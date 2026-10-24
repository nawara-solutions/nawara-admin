import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  DemoWorldTables,
  OperatorProfileRecord,
  adminIdentityId,
} from '../../../demo/world/records';
import {
  assignedPlatformsOf,
  assignmentHistoryOf,
  grantsOf,
  isActiveAssignment,
  operatorProfileOf,
} from '../../../demo/world/selectors';
import {
  OperatorAccountState,
  OperatorSummary,
  PlatformAssignment,
} from '../domain/operator.model';
import { OperatorAssignmentGateway } from './operator-assignment.gateway';
import { OperatorDirectoryGateway } from './operator-directory.gateway';

/** Which answer the directory mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type OperatorDirectoryDemoScenario = 'normal' | 'empty' | 'error';

export const OPERATOR_DIRECTORY_DEMO_SCENARIO = new InjectionToken<OperatorDirectoryDemoScenario>(
  'OPERATOR_DIRECTORY_DEMO_SCENARIO',
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

/**
 * Mock adapter of Core's assignment history (`GET /auth/admin/operators/:id/platform-assignments`; demo builds only),
 * answering what Core answers: the owner only (`403` otherwise), the collapsed `404` for an operator that is not the
 * owner's Company's, else every record, active and removed, oldest first, in Core's field names.
 */
export class MockOperatorAssignmentGateway extends OperatorAssignmentGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(OPERATOR_HISTORY_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  history(operator: string): Observable<readonly PlatformAssignment[]> {
    return defer(() => {
      const world = this.world.snapshot();
      const refused = callerError(this.auth, world);
      if (refused !== null) return this.fail(refused);
      const id = adminIdentityId(operator);
      if (operatorProfileOf(world, id) === undefined) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const records = assignmentHistoryOf(world, id).map((a): PlatformAssignment => ({
        id: a.id,
        platformId: a.platformId,
        assignedBy: a.assignedBy,
        assignedAt: a.assignedAt,
        revokedAt: a.revokedAt,
        revokedBy: a.revokedBy,
        active: isActiveAssignment(a),
      }));
      return of(records).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_OPERATOR_PROVIDERS: readonly Provider[] = [
  { provide: OperatorDirectoryGateway, useClass: MockOperatorDirectoryGateway },
  { provide: OperatorAssignmentGateway, useClass: MockOperatorAssignmentGateway },
];
