import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, map, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId, PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import {
  PlatformAssignmentChange,
  grantPlatformAssignment,
  revokePlatformAssignment,
  setOperatorBlocked,
} from '../../../demo/world/commands/operator.commands';
import { CommandOutcome, DemoWorld } from '../../../demo/world/demo-world';
import {
  DemoWorldTables,
  OperatorProfileRecord,
  PlatformAssignmentRecord,
  adminIdentityId,
} from '../../../demo/world/records';
import {
  assignedPlatformsOf,
  assignmentHistoryOf,
  grantsOf,
  isActiveAssignment,
  isCompanyPlatform,
  operatorProfileOf,
} from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  OperatorAccountState,
  OperatorSummary,
  PlatformAssignment,
} from '../domain/operator.model';
import { OperatorAccountGateway } from './operator-account.gateway';
import { AssignmentChangeRequest, OperatorAssignmentGateway } from './operator-assignment.gateway';
import { OperatorDirectoryGateway } from './operator-directory.gateway';

/** Which answer the directory mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type OperatorDirectoryDemoScenario = 'normal' | 'empty' | 'error';

export const OPERATOR_DIRECTORY_DEMO_SCENARIO = new InjectionToken<OperatorDirectoryDemoScenario>(
  'OPERATOR_DIRECTORY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Which answer a Platform assignment change gets. Demo builds use `normal`, which SUCCEEDS. The others:
 * - `changedElsewhere`: another writer makes the same change just before (`409 assignment_conflict` for a grant, the
 *   collapsed `404` for a removal);
 * - `outcomeUnknown`: the change commits but its answer is lost (nothing replays it: Core has no idempotency key);
 * - `hierarchyUnavailable`: a grant's first touch of the Platform cannot reach Organization Service (`503
 *   hierarchy_unavailable`, before anything is checked or written); a removal is not affected;
 * - `unavailable`: the service refuses either change before applying anything (`503`, no code);
 * - `rateLimited`: `429` with no detail (Core has only a coarse per-IP throttle here; its answer is unverified).
 */
export type OperatorAssignmentDemoScenario =
  | 'normal'
  | 'changedElsewhere'
  | 'outcomeUnknown'
  | 'hierarchyUnavailable'
  | 'unavailable'
  | 'rateLimited';

export const OPERATOR_ASSIGNMENT_DEMO_SCENARIO = new InjectionToken<OperatorAssignmentDemoScenario>(
  'OPERATOR_ASSIGNMENT_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** Which answer the assignment-history mock gives. Demo builds use `normal`. */
export type OperatorHistoryDemoScenario = 'normal' | 'error';

export const OPERATOR_HISTORY_DEMO_SCENARIO = new InjectionToken<OperatorHistoryDemoScenario>(
  'OPERATOR_HISTORY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

const NOT_FOUND: AppError = { kind: 'not_found', code: 'not_found', status: 404 };
/** Core's guard answer for an identity that is not an owner (`@Actors('owner')`). */
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };

const stateOf = (profile: OperatorProfileRecord): OperatorAccountState =>
  profile.blocked
    ? 'blocked'
    : profile.contactConfirmedAt === null
      ? 'awaitingConfirmation'
      : 'canSignIn';

/** One operator as the provisional directory describes it, from the demo world's records (FICTIONAL). */
export const demoOperatorSummary = (
  world: DemoWorldTables,
  profile: OperatorProfileRecord,
): OperatorSummary => ({
  id: profile.id,
  contact:
    profile.email !== null
      ? { kind: 'email', email: profile.email }
      : { kind: 'phone', phone: profile.phone ?? '' },
  accountState: stateOf(profile),
  activePlatformIds: assignedPlatformsOf(world, profile.id),
  createdAt: profile.createdAt,
});

/**
 * The simulated caller's relation to the Company: its owner, or not (Core's owner-only operator routes answer `403` to
 * every other identity, and `401` without a session).
 */
function callerError(auth: DemoAuthState, world: DemoWorldTables): AppError | null {
  const signedIn = auth.signedIn();
  if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
  return grantsOf(world, signedIn.businessIdentityId).companyId === world.company.id
    ? null
    : FORBIDDEN;
}

/**
 * Mock adapter of the PROVISIONAL operator directory (demo builds only; CF-03: no Core route exists). It reads the demo
 * world at request time, so it agrees with the Platform counts and the sign-in flow (a contact confirmed there shows
 * here). The owner only; another Company, or an operator it does not know, is the collapsed `404`.
 */
export class MockOperatorDirectoryGateway extends OperatorDirectoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(OPERATOR_DIRECTORY_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  list(company: CompanyId): Observable<readonly OperatorSummary[]> {
    return defer(() => {
      const world = this.world.snapshot();
      const refused = callerError(this.auth, world);
      if (refused !== null) return this.fail(refused);
      if (company !== world.company.id) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      if (this.scenario === 'empty') return this.answer<readonly OperatorSummary[]>([]);
      return this.answer(world.operators.map((profile) => demoOperatorSummary(world, profile)));
    });
  }

  load(company: CompanyId, operator: string): Observable<OperatorSummary> {
    return defer(() => {
      const world = this.world.snapshot();
      const refused = callerError(this.auth, world);
      if (refused !== null) return this.fail(refused);
      const profile = operatorProfileOf(world, adminIdentityId(operator));
      if (company !== world.company.id || profile === undefined) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      return this.answer(demoOperatorSummary(world, profile));
    });
  }

  private answer<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

const toAssignment = (a: PlatformAssignmentRecord): PlatformAssignment => ({
  id: a.id,
  platformId: a.platformId,
  assignedBy: a.assignedBy,
  assignedAt: a.assignedAt,
  revokedAt: a.revokedAt,
  revokedBy: a.revokedBy,
  active: isActiveAssignment(a),
});

/**
 * Mock adapter of Core's assignment routes (demo builds only), over the demo world at request time.
 *
 * - `history`: the owner only (`403` otherwise), the collapsed `404` for an operator that is not the owner's Company's,
 *   else every record, active and removed, oldest first, in Core's field names.
 * - `grant` / `revoke`, in Core's order (`assignment.service.ts`): the session (`401`), the owner-only guard (`403
 *   forbidden`, an operator on their own record included), [grant: the hierarchy check, `503 hierarchy_unavailable`],
 *   the operator (and for a grant the Platform) in the owner's Company (collapsed `404`), the step-up of exactly this
 *   purpose, for this user, live (`403 step_up_required`; CHECKED, not spent), then the command (`409` / `404`: Core
 *   rolls back, so the step-up stays unspent), and only once it commits is the step-up spent. Never replays a change.
 */
export class MockOperatorAssignmentGateway extends OperatorAssignmentGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(OPERATOR_HISTORY_DEMO_SCENARIO);
  private readonly changes = inject(OPERATOR_ASSIGNMENT_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  grant(
    operator: string,
    platform: PlatformId,
    request: AssignmentChangeRequest,
  ): Observable<PlatformAssignment> {
    return defer(() =>
      this.change('platform_assignment.grant', operator, platform, request, (change) =>
        grantPlatformAssignment(change),
      ).pipe(map(toAssignment)),
    );
  }

  revoke(
    operator: string,
    platform: PlatformId,
    request: AssignmentChangeRequest,
  ): Observable<void> {
    return defer(() =>
      this.change('platform_assignment.revoke', operator, platform, request, (change) =>
        revokePlatformAssignment(change),
      ).pipe(map(() => undefined)),
    );
  }

  private change(
    purpose: 'platform_assignment.grant' | 'platform_assignment.revoke',
    operator: string,
    platform: PlatformId,
    request: AssignmentChangeRequest,
    command: (
      change: PlatformAssignmentChange,
    ) => (world: DemoWorldTables) => CommandOutcome<PlatformAssignmentRecord>,
  ): Observable<PlatformAssignmentRecord> {
    const world = this.world.snapshot();
    const refused = callerError(this.auth, world);
    if (refused !== null) return this.fail(refused);
    if (this.changes === 'rateLimited') return this.fail({ kind: 'rate_limited', status: 429 });
    const grant = purpose === 'platform_assignment.grant';
    if (grant && this.changes === 'hierarchyUnavailable')
      return this.fail({ kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 });
    if (this.changes === 'unavailable') return this.fail({ kind: 'unavailable', status: 503 });
    const operatorId = adminIdentityId(operator);
    if (
      operatorProfileOf(world, operatorId) === undefined ||
      (grant && !isCompanyPlatform(world, platform))
    )
      return this.fail(NOT_FOUND);
    const signedIn = this.auth.signedIn();
    const userId = signedIn?.identity.userId ?? '';
    const now = this.now();
    if (!this.auth.checkStepUp(request.stepUpToken, purpose, userId, now))
      return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
    const change = {
      actor: signedIn?.businessIdentityId ?? null,
      operatorId,
      platformId: platform,
      now,
    };
    if (this.changes === 'changedElsewhere') this.world.commit(command(change));
    const outcome = this.world.commit(command(change));
    // Nothing changed: Core rolls the transaction back, so the step-up is not spent.
    if (!outcome.ok) return this.fail(outcome.error);
    this.auth.consumeStepUp(request.stepUpToken, purpose, userId, now);
    if (this.changes === 'outcomeUnknown') return this.fail({ kind: 'network', status: 0 });
    return of(outcome.result).pipe(delay(this.latency));
  }

  history(operator: string): Observable<readonly PlatformAssignment[]> {
    return defer(() => {
      const world = this.world.snapshot();
      const refused = callerError(this.auth, world);
      if (refused !== null) return this.fail(refused);
      const id = adminIdentityId(operator);
      if (operatorProfileOf(world, id) === undefined) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      return of(assignmentHistoryOf(world, id).map(toAssignment)).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

/**
 * Which answer a block or unblock gets (P6-S3). Demo builds use `normal`, which SUCCEEDS. The others:
 * - `outcomeUnknown`: the change commits (and its sign-in effects apply) but the answer is lost;
 * - `auditFailure`: Core's `500` when its audit write fails: the transaction rolls back, nothing changes (Core's
 *   verified test); Admin cannot tell this `500` from any other, so it still reconciles;
 * - `unavailable`: `503` before anything is applied.
 */
export type OperatorAccountDemoScenario =
  'normal' | 'outcomeUnknown' | 'auditFailure' | 'unavailable';

export const OPERATOR_ACCOUNT_DEMO_SCENARIO = new InjectionToken<OperatorAccountDemoScenario>(
  'OPERATOR_ACCOUNT_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Mock adapter of Core's block and unblock (demo builds only), in Core's order: the session (`401`), the owner-only
 * guard (`403 forbidden`, an operator on their own record included), then `setOperatorBlocked` (the collapsed `404`;
 * owner authority again inside), all in one step. No step-up. Once a BLOCK commits, what Core does outside the account
 * row is applied to the sign-in state (`DemoAuthState.endOperatorSignIn`: unused codes cancelled, their session ended);
 * an unblock restores nothing there. Never replays a change.
 */
export class MockOperatorAccountGateway extends OperatorAccountGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(OPERATOR_ACCOUNT_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  block(operator: string): Observable<void> {
    return defer(() => this.change(operator, true));
  }

  unblock(operator: string): Observable<void> {
    return defer(() => this.change(operator, false));
  }

  private change(operator: string, blocked: boolean): Observable<void> {
    const refused = callerError(this.auth, this.world.snapshot());
    if (refused !== null) return this.fail(refused);
    if (this.scenario === 'unavailable') return this.fail({ kind: 'unavailable', status: 503 });
    // Core's audit write fails inside the transaction: everything rolls back, nothing changes.
    if (this.scenario === 'auditFailure') return this.fail({ kind: 'unexpected', status: 500 });
    const operatorId = adminIdentityId(operator);
    const outcome = this.world.commit(
      setOperatorBlocked(
        { actor: this.auth.signedIn()?.businessIdentityId ?? null, operatorId, now: this.now() },
        blocked,
      ),
    );
    if (!outcome.ok) return this.fail(outcome.error);
    if (blocked) this.auth.endOperatorSignIn(operatorId);
    if (this.scenario === 'outcomeUnknown') return this.fail({ kind: 'network', status: 0 });
    return of(undefined).pipe(delay(this.latency));
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_OPERATOR_PROVIDERS: readonly Provider[] = [
  { provide: OperatorDirectoryGateway, useClass: MockOperatorDirectoryGateway },
  { provide: OperatorAssignmentGateway, useClass: MockOperatorAssignmentGateway },
  { provide: OperatorAccountGateway, useClass: MockOperatorAccountGateway },
];
