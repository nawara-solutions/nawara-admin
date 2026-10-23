import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables, OrganizationRecord } from '../../../demo/world/records';
import {
  activityOfOrganization,
  adminInvitationsOf,
  assistedPaymentsOf,
  newestFirst,
  organizationOf,
  organizationsOf,
  paymentIssuesOf,
  platformViewerOf,
  subscriptionEndOf,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { Metric } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  OrganizationCommercial,
  OrganizationSubscription,
  PlatformOrganizationsCommercial,
} from '../domain/organization-commercial.model';
import {
  OrganizationActivityAction,
  OrganizationDetail,
  OrganizationDirectory,
  OrganizationSummary,
} from '../domain/organization.model';
import { OrganizationCommercialGateway } from './organization-commercial.gateway';
import { OrganizationGateway } from './organization.gateway';

/**
 * Which answer the mocks give, so every view state can be exercised (§3). Demo builds use `normal`; `partial` leaves the
 * owner's commercial list and some detail sections unavailable; `empty` is a Platform without Organizations.
 */
export type OrganizationsDemoScenario = 'normal' | 'partial' | 'error' | 'empty';

export const ORGANIZATIONS_DEMO_SCENARIO = new InjectionToken<OrganizationsDemoScenario>(
  'ORGANIZATIONS_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

const UNAVAILABLE = { status: 'unavailable' } as const;
const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
const UNAUTHENTICATED: AppError = { kind: 'unauthenticated', status: 401 };
const OUTAGE: AppError = { kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 };

const count = (value: number): Metric => ({ status: 'available', value });
const answer = <T>(value: T, latency: number): Observable<T> => of(value).pipe(delay(latency));
const fail = <T>(error: AppError, latency: number): Observable<T> =>
  timer(latency).pipe(switchMap(() => throwError(() => error)));

/** The simulated session's view of a Platform: owner, operator, or Core's answer (`401`, collapsed `404`). */
function viewerOf(
  world: DemoWorldTables,
  auth: DemoAuthState,
  platform: PlatformId,
): 'owner' | 'operator' | AppError {
  const signedIn = auth.signedIn();
  if (signedIn === null) return UNAUTHENTICATED;
  return platformViewerOf(world, signedIn.businessIdentityId, platform) ?? NOT_FOUND;
}

/** The record, if it exists and the session may see its Platform: unknown and not-yours are one `404`. */
function visibleOrganization(
  world: DemoWorldTables,
  auth: DemoAuthState,
  organization: OrganizationId,
): { readonly record: OrganizationRecord; readonly viewer: 'owner' | 'operator' } | AppError {
  if (auth.signedIn() === null) return UNAUTHENTICATED;
  const record = organizationOf(world, organization);
  if (record === undefined) return NOT_FOUND;
  const viewer = viewerOf(world, auth, record.platformId);
  return typeof viewer === 'string' ? { record, viewer } : viewer;
}

const summaryOf = (o: OrganizationRecord): OrganizationSummary => ({
  id: o.id,
  platformId: o.platformId,
  name: o.name,
  createdAt: o.createdAt,
  memberships: count(o.memberships),
  pendingRequests: count(o.pendingRequests),
});

function subscriptionOf(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
): OrganizationSubscription {
  const { state, graceEndsAt } = subscriptionStateOf(world, organization, now);
  const endsAt = subscriptionEndOf(world, organization);
  if (state === 'active' && endsAt !== null) return { state, endsAt };
  if (state === 'grace' && graceEndsAt !== undefined) return { state, graceEndsAt };
  return { state: 'none' };
}

/**
 * Mock adapter of a Platform's Organizations (demo builds only), reading the demo world at request time, so it agrees
 * with the Platform dashboard and directory. An operator gets the hierarchy facts only: invitations and activity come
 * back `unavailable`, as Core would refuse them.
 */
export class MockOrganizationGateway extends OrganizationGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ORGANIZATIONS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  list(platform: PlatformId): Observable<OrganizationDirectory> {
    const world = this.world.snapshot();
    const viewer = viewerOf(world, this.auth, platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (this.scenario === 'error') return fail(OUTAGE, this.latency);
    const organizations =
      this.scenario === 'empty' ? [] : [...organizationsOf(world, platform)].sort(newestFirst);
    return answer(
      { platformId: platform, organizations: organizations.map(summaryOf) },
      this.latency,
    );
  }

  load(organization: OrganizationId): Observable<OrganizationDetail> {
    const world = this.world.snapshot();
    const visible = visibleOrganization(world, this.auth, organization);
    if (!('record' in visible)) return fail(visible, this.latency);
    if (this.scenario === 'error') return fail(OUTAGE, this.latency);
    if (this.scenario === 'empty') return fail(NOT_FOUND, this.latency);
    const { record, viewer } = visible;
    const owner = viewer === 'owner';
    const detail: OrganizationDetail = {
      ...summaryOf(record),
      adminInvitationsAwaiting: owner
        ? { status: 'available', data: count(adminInvitationsOf(world, [record]).length) }
        : UNAVAILABLE,
      activity:
        owner && this.scenario !== 'partial'
          ? {
              status: 'available',
              data: activityOfOrganization(world, record.id).flatMap((e) =>
                // Platform-level events (an operator assigned, the Platform created) are not the Organization's.
                e.action === 'operator.assigned' || e.action === 'platform.created'
                  ? []
                  : [
                      {
                        id: e.id,
                        action: e.action satisfies OrganizationActivityAction,
                        occurredAt: e.occurredAt,
                      },
                    ],
              ),
            }
          : UNAVAILABLE,
    };
    return answer(detail, this.latency);
  }
}

/**
 * Mock adapter of Organizations' commercial facts (demo builds only), for the owner: an operator is refused (`403`), as
 * no commercial read authority is confirmed for operators (the UI never asks). Subscription states follow from each
 * Organization's one subscription record and the clock; payment issues are Payment records; the assisted-payments
 * policy is the Platform's setting with the Organization's override.
 */
export class MockOrganizationCommercialGateway extends OrganizationCommercialGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ORGANIZATIONS_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  list(platform: PlatformId): Observable<PlatformOrganizationsCommercial> {
    const world = this.world.snapshot();
    const viewer = viewerOf(world, this.auth, platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (viewer !== 'owner')
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 }, this.latency);
    if (this.scenario === 'error' || this.scenario === 'partial')
      return fail({ kind: 'unavailable', status: 503 }, this.latency);
    const now = this.now();
    const organizations = this.scenario === 'empty' ? [] : organizationsOf(world, platform);
    return answer(
      {
        platformId: platform,
        organizations: organizations.flatMap((o) => {
          const assistedPayments = assistedPaymentsOf(world, o);
          return assistedPayments === null
            ? []
            : [
                {
                  organizationId: o.id,
                  subscription: subscriptionOf(world, o.id, now),
                  assistedPayments,
                },
              ];
        }),
      },
      this.latency,
    );
  }

  load(organization: OrganizationId): Observable<OrganizationCommercial> {
    const world = this.world.snapshot();
    const visible = visibleOrganization(world, this.auth, organization);
    if (!('record' in visible)) return fail(visible, this.latency);
    if (visible.viewer !== 'owner')
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 }, this.latency);
    if (this.scenario === 'error') return fail({ kind: 'unavailable', status: 503 }, this.latency);
    const { record } = visible;
    const assistedPayments = assistedPaymentsOf(world, record);
    const commercial: OrganizationCommercial = {
      organizationId: record.id,
      platformId: record.platformId,
      subscription:
        this.scenario === 'partial'
          ? UNAVAILABLE
          : { status: 'available', data: subscriptionOf(world, record.id, this.now()) },
      paymentIssues: { status: 'available', data: count(paymentIssuesOf(world, [record]).length) },
      assistedPayments:
        assistedPayments === null ? UNAVAILABLE : { status: 'available', data: assistedPayments },
    };
    return answer(commercial, this.latency);
  }
}

export const MOCK_ORGANIZATION_PROVIDERS: readonly Provider[] = [
  { provide: OrganizationGateway, useClass: MockOrganizationGateway },
];

export const MOCK_ORGANIZATION_COMMERCIAL_PROVIDERS: readonly Provider[] = [
  { provide: OrganizationCommercialGateway, useClass: MockOrganizationCommercialGateway },
];
