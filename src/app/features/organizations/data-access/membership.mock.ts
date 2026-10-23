import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { decideMembership } from '../../../demo/world/commands/membership.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { organizationOf, platformViewerOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { MembershipDecision, MembershipDecisionResult } from '../domain/membership-decision.model';
import {
  LISTABLE_STATUSES,
  ListableMembershipStatus,
  Membership,
  MembershipList,
} from '../domain/membership.model';
import { MembershipGateway } from './membership.gateway';

/** Which answer the mock gives (§3). Demo builds use `normal`; `error` is an outage of the membership read. */
export type MembershipsDemoScenario = 'normal' | 'error';

export const MEMBERSHIPS_DEMO_SCENARIO = new InjectionToken<MembershipsDemoScenario>(
  'MEMBERSHIPS_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Which answer a decision gets (§3). Demo builds use `normal`, which SUCCEEDS. The others:
 * - `decidedElsewhere`: someone else decides the request just before (a competing decision): `409`;
 * - `outcomeUnknown`: the decision is applied but its answer is lost (nothing replays it: no idempotency);
 * - `rateLimited`: the per-actor bucket is exhausted (`429 rate_limited`);
 * - `unavailable`: the service refuses before applying anything (`503`).
 */
export type MembershipDecisionsDemoScenario =
  'normal' | 'decidedElsewhere' | 'outcomeUnknown' | 'rateLimited' | 'unavailable';

export const MEMBERSHIP_DECISIONS_DEMO_SCENARIO =
  new InjectionToken<MembershipDecisionsDemoScenario>('MEMBERSHIP_DECISIONS_DEMO_SCENARIO', {
    factory: () => 'normal',
  });

/** Core's `REQUIRE_CONTACT_VERIFICATION` (auth-service `config/app-config.ts`), `false` by default as in Core. */
export const MEMBERSHIP_CONTACT_VERIFICATION_REQUIRED = new InjectionToken<boolean>(
  'MEMBERSHIP_CONTACT_VERIFICATION_REQUIRED',
  { factory: () => false },
);

/** Core's `membership_op_actor` bucket (120 per 900 s per actor), shared with revoke (P5-S3). */
export const MEMBERSHIP_OP_LIMIT = { limit: 120, windowMs: 900_000 } as const;

/**
 * Mock adapter (demo builds only): Core's membership list over the demo world's records, at request time. Authority as
 * Core's `organizationAuthority`: the owner of the Organization's Company or an operator assigned to its Platform
 * (organization admins are not Admin actors); anyone else, and an unknown Organization, is one collapsed `404`. A status
 * Core cannot list is `400`. Rows are Core's projection (no name; the identity's email, phone and verification), oldest
 * request first; revoked memberships are never returned.
 *
 * Decisions follow Core's `decide`: the session (`401`), the throttle (`429`, every attempt counts), then the
 * `decideMembership` command, which owns authority, the self rule and the pending check (`404`/`409`).
 */
export class MockMembershipGateway extends MembershipGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(MEMBERSHIPS_DEMO_SCENARIO);
  private readonly decisions = inject(MEMBERSHIP_DECISIONS_DEMO_SCENARIO);
  private readonly contactRequired = inject(MEMBERSHIP_CONTACT_VERIFICATION_REQUIRED);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);
  /** Per user id: the instants of decision attempts in the current window. */
  private readonly hits = new Map<string, number[]>();

  list(organization: OrganizationId, status: ListableMembershipStatus): Observable<MembershipList> {
    return defer((): Observable<MembershipList> => {
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (!(LISTABLE_STATUSES as readonly string[]).includes(status))
        return this.fail({ kind: 'validation', messages: ['status is not valid'], status: 400 });
      const world = this.world.snapshot();
      const record = organizationOf(world, organization);
      if (
        record === undefined ||
        platformViewerOf(world, signedIn.businessIdentityId, record.platformId) === null
      )
        return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const people = new Map(world.members.map((p) => [p.id, p]));
      const memberships = world.memberships
        .filter((m) => m.organizationId === organization && m.status === status)
        .sort(
          (a, b) =>
            Date.parse(a.requestedAt) - Date.parse(b.requestedAt) || a.id.localeCompare(b.id),
        )
        .map((m): Membership => {
          const person = people.get(m.userId);
          return {
            id: m.id,
            userId: m.userId,
            status,
            requestedAt: m.requestedAt,
            approvedAt: m.approvedAt,
            rejectedAt: m.rejectedAt,
            isOrganizationAdmin: m.isOrganizationAdmin,
            email: person?.email ?? null,
            phone: person?.phone ?? null,
            audience: m.audience,
            contactVerified: person?.contactVerified ?? false,
          };
        });
      return of<MembershipList>({ organizationId: organization, status, memberships }).pipe(
        delay(this.latency),
      );
    });
  }

  decide(
    organization: OrganizationId,
    membershipId: string,
    decision: MembershipDecision,
  ): Observable<MembershipDecisionResult> {
    return defer((): Observable<MembershipDecisionResult> => {
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (this.decisions === 'unavailable') return this.fail({ kind: 'unavailable', status: 503 });
      const userId = signedIn.identity.userId;
      const throttled = this.throttle(userId);
      if (throttled) return this.fail(throttled);
      // An account without a business identity has no relation to any Organization: one 404.
      const actor = signedIn.businessIdentityId;
      if (actor === null) return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      const now = this.now();
      const input = {
        organizationId: organization,
        membershipId,
        decision,
        actor,
        actorUserId: userId,
        requireContactVerification: this.contactRequired,
        now,
      };
      if (this.decisions === 'decidedElsewhere')
        this.world.commit((tables) =>
          decideMembership(tables, { ...input, decision: 'approve', actorUserId: 'elsewhere' }),
        );
      const outcome = this.world.commit((tables) => decideMembership(tables, input));
      if (!outcome.ok) return this.fail(outcome.error);
      if (this.decisions === 'outcomeUnknown') return this.fail({ kind: 'network', status: 0 });
      return of<MembershipDecisionResult>({
        id: outcome.result.id,
        status: decision === 'approve' ? 'active' : 'rejected',
      }).pipe(delay(this.latency));
    });
  }

  /** Core's per-actor bucket: every decision attempt counts, refused or not. */
  private throttle(userId: string): AppError | null {
    if (this.decisions === 'rateLimited') return { kind: 'rate_limited', status: 429 };
    const now = this.now();
    const recent = (this.hits.get(userId) ?? []).filter(
      (t) => t > now - MEMBERSHIP_OP_LIMIT.windowMs,
    );
    recent.push(now);
    this.hits.set(userId, recent);
    return recent.length > MEMBERSHIP_OP_LIMIT.limit ? { kind: 'rate_limited', status: 429 } : null;
  }

  private fail<T>(error: AppError): Observable<T> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_MEMBERSHIP_PROVIDERS: readonly Provider[] = [
  { provide: MembershipGateway, useClass: MockMembershipGateway },
];
