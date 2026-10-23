import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { organizationOf, platformViewerOf } from '../../../demo/world/selectors';
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
 * Mock adapter (demo builds only): Core's membership list over the demo world's records, at request time. Authority as
 * Core's `organizationAuthority`: the owner of the Organization's Company or an operator assigned to its Platform
 * (organization admins are not Admin actors); anyone else, and an unknown Organization, is one collapsed `404`. A status
 * Core cannot list is `400`. Rows are Core's projection (no name; the identity's email, phone and verification), oldest
 * request first; revoked memberships are never returned.
 */
export class MockMembershipGateway extends MembershipGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(MEMBERSHIPS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

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

  private fail<T>(error: AppError): Observable<T> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_MEMBERSHIP_PROVIDERS: readonly Provider[] = [
  { provide: MembershipGateway, useClass: MockMembershipGateway },
];
