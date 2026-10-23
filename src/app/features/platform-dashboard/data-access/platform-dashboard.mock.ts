import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState, DemoSignedIn } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables } from '../../../demo/world/records';
import {
  activityOf,
  adminInvitationsOf,
  assignmentsOf,
  createdWithin,
  membershipTotal,
  newestFirst,
  organizationNameOf,
  organizationsOf,
  paymentIssuesOf,
  pendingRequestTotal,
  platformCommercialOf,
  platformViewerOf,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { Metric } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import { PlatformCommercial } from '../domain/platform-commercial.model';
import { PlatformDashboard } from '../domain/platform-dashboard.model';
import { PlatformCommercialGateway } from './platform-commercial.gateway';
import { PlatformDashboardGateway } from './platform-dashboard.gateway';

/**
 * Which answer the mocks give, so every view state can be exercised (§3). Demo builds use `normal`; `partial` leaves
 * some sections unavailable; `empty` is a Platform without Organizations.
 */
export type PlatformDashboardDemoScenario = 'normal' | 'partial' | 'error' | 'empty';

export const PLATFORM_DASHBOARD_DEMO_SCENARIO = new InjectionToken<PlatformDashboardDemoScenario>(
  'PLATFORM_DASHBOARD_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** The reporting period of the demo figures, in days. */
export const PLATFORM_PERIOD_DAYS = 30;
/** How many of the newest Organizations the dashboard lists. */
export const RECENT_ORGANIZATIONS = 5;

const UNAVAILABLE = { status: 'unavailable' } as const;
const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };

const count = (value: number): Metric => ({ status: 'available', value });
const answer = <T>(value: T, latency: number): Observable<T> => of(value).pipe(delay(latency));
const fail = <T>(error: AppError, latency: number): Observable<T> =>
  timer(latency).pipe(switchMap(() => throwError(() => error)));

/** Who the simulated Core session belongs to, and whether they may see this Platform (Core's collapsed 404 if not). */
function viewerOf(
  world: DemoWorldTables,
  signedIn: DemoSignedIn | null,
  platform: PlatformId,
): 'owner' | 'operator' | AppError {
  if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
  return platformViewerOf(world, signedIn.businessIdentityId, platform) ?? NOT_FOUND;
}

/**
 * Mock adapter of the Platform dashboard (demo builds only). Every figure is derived from the demo world's records at
 * request time, so it agrees with the Platform directory and the Company Overview. An operator gets the hierarchy figures only: the owner-only sections
 * (operator assignments, invitations, activity) come back `unavailable`, as Core would refuse them.
 */
export class MockPlatformDashboardGateway extends PlatformDashboardGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DASHBOARD_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  load(platform: PlatformId): Observable<PlatformDashboard> {
    const world = this.world.snapshot();
    const viewer = viewerOf(world, this.auth.signedIn(), platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (this.scenario === 'error')
      return fail(
        { kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 },
        this.latency,
      );
    const empty = this.scenario === 'empty';
    const partial = this.scenario === 'partial';
    const organizations = empty ? [] : organizationsOf(world, platform);
    const owner = viewer === 'owner';

    const dashboard: PlatformDashboard = {
      platformId: platform,
      periodDays: PLATFORM_PERIOD_DAYS,
      figures: {
        status: 'available',
        data: {
          organizations: count(organizations.length),
          organizationsAdded: count(
            createdWithin(organizations, this.now(), PLATFORM_PERIOD_DAYS).length,
          ),
          memberships: count(membershipTotal(organizations)),
          membershipRequests: count(pendingRequestTotal(organizations)),
          organizationsWithRequests: count(
            organizations.filter((o) => o.pendingRequests > 0).length,
          ),
        },
      },
      recentOrganizations: partial
        ? UNAVAILABLE
        : {
            status: 'available',
            data: [...organizations]
              .sort(newestFirst)
              .slice(0, RECENT_ORGANIZATIONS)
              .map((o) => ({
                id: o.id,
                name: o.name,
                createdAt: o.createdAt,
                memberships: count(o.memberships),
                pendingRequests: count(o.pendingRequests),
              })),
          },
      operatorAssignments: owner
        ? { status: 'available', data: count(assignmentsOf(world, platform).length) }
        : UNAVAILABLE,
      adminInvitationsAwaiting: owner
        ? { status: 'available', data: count(adminInvitationsOf(world, organizations).length) }
        : UNAVAILABLE,
      activity:
        owner && !partial
          ? {
              status: 'available',
              data: empty
                ? []
                : activityOf(world, platform).map((e) => ({
                    id: e.id,
                    action: e.action,
                    organizationName: organizationNameOf(world, e.organizationId),
                    occurredAt: e.occurredAt,
                  })),
            }
          : UNAVAILABLE,
    };
    return answer(dashboard, this.latency);
  }
}

/**
 * Mock adapter of a Platform's commercial facts (demo builds only), for the owner: an operator is refused (`403`), as
 * no commercial read authority is confirmed for operators. Subscription states follow from each Organization's one
 * subscription record and the clock, so they always add up to the Platform's Organizations; Personal Premium and
 * payment issues are separate records.
 */
export class MockPlatformCommercialGateway extends PlatformCommercialGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DASHBOARD_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  load(platform: PlatformId): Observable<PlatformCommercial> {
    const world = this.world.snapshot();
    const viewer = viewerOf(world, this.auth.signedIn(), platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (viewer !== 'owner')
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 }, this.latency);
    if (this.scenario === 'error') return fail({ kind: 'unavailable', status: 503 }, this.latency);
    const facts = platformCommercialOf(world, platform);
    if (facts === undefined) return fail(NOT_FOUND, this.latency);
    const empty = this.scenario === 'empty';
    const organizations = empty ? [] : organizationsOf(world, platform);
    const now = this.now();

    const commercial: PlatformCommercial = {
      platformId: platform,
      organizationSubscriptions: {
        status: 'available',
        data: organizations.map((o) => ({
          organizationId: o.id,
          organizationName: o.name,
          ...subscriptionStateOf(world, o.id, now),
        })),
      },
      personalPremium:
        this.scenario === 'partial'
          ? UNAVAILABLE
          : { status: 'available', data: count(empty ? 0 : facts.personalPremium) },
      paymentIssues: {
        status: 'available',
        data: count(paymentIssuesOf(world, organizations).length),
      },
      assistedPayments: {
        status: 'available',
        data: {
          platform: facts.assistedPayments,
          // An override only matters while the Platform enables it: a disabled Platform cannot be enabled below.
          organizationsDisabled:
            facts.assistedPayments === 'enabled'
              ? organizations.filter((o) => o.assistedPayments === 'disabled').length
              : 0,
          organizations: organizations.length,
        },
      },
    };
    return answer(commercial, this.latency);
  }
}

export const MOCK_PLATFORM_DASHBOARD_PROVIDERS: readonly Provider[] = [
  { provide: PlatformDashboardGateway, useClass: MockPlatformDashboardGateway },
];

export const MOCK_PLATFORM_COMMERCIAL_PROVIDERS: readonly Provider[] = [
  { provide: PlatformCommercialGateway, useClass: MockPlatformCommercialGateway },
];
