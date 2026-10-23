import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState, DemoSignedIn } from '../../../core/auth/auth.mock-state';
import {
  DEMO_PLATFORM_FACTS,
  DemoOrganization,
  demoOrganizationsOf,
} from '../../../core/context/organization.fixtures';
import { DEMO_COMPANY_DIRECTORY } from '../../../core/context/scope-directory.fixtures';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
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

const HOUR_MS = 3_600_000;
const UNAVAILABLE = { status: 'unavailable' } as const;
const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };

const count = (value: number): Metric => ({ status: 'available', value });
const answer = <T>(value: T, latency: number): Observable<T> => of(value).pipe(delay(latency));
const fail = <T>(error: AppError, latency: number): Observable<T> =>
  timer(latency).pipe(switchMap(() => throwError(() => error)));

/** Who the simulated Core session belongs to, and whether they may see this Platform (Core's collapsed 404 if not). */
function viewerOf(
  signedIn: DemoSignedIn | null,
  platform: PlatformId,
): 'owner' | 'operator' | AppError {
  if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
  const known = DEMO_COMPANY_DIRECTORY.platforms.some((p) => p.id === platform);
  const { identity, grants } = signedIn;
  if (
    known &&
    identity.adminTier === 'owner' &&
    grants.companyId === DEMO_COMPANY_DIRECTORY.company.id
  )
    return 'owner';
  if (known && identity.adminTier === 'operator' && grants.platformAssignments.includes(platform))
    return 'operator';
  return NOT_FOUND;
}

const newestFirst = (a: DemoOrganization, b: DemoOrganization) =>
  a.createdHoursAgo - b.createdHoursAgo;

/**
 * Mock adapter of the Platform dashboard (demo builds only). Every figure is derived from the demo Organization records,
 * so it agrees with the Platform directory. An operator gets the hierarchy figures only: the owner-only sections
 * (operator assignments, invitations, activity) come back `unavailable`, as Core would refuse them.
 */
export class MockPlatformDashboardGateway extends PlatformDashboardGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DASHBOARD_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly auth = inject(DemoAuthState);

  load(platform: PlatformId): Observable<PlatformDashboard> {
    const viewer = viewerOf(this.auth.signedIn(), platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (this.scenario === 'error')
      return fail(
        { kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 },
        this.latency,
      );
    const empty = this.scenario === 'empty';
    const partial = this.scenario === 'partial';
    const organizations = empty ? [] : demoOrganizationsOf(platform);
    const facts = DEMO_PLATFORM_FACTS[platform];
    const owner = viewer === 'owner' && facts !== undefined;
    const names = new Map(organizations.map((o) => [o.id, o.name]));
    const ago = (hours: number) => new Date(this.now() - hours * HOUR_MS).toISOString();

    const dashboard: PlatformDashboard = {
      platformId: platform,
      periodDays: PLATFORM_PERIOD_DAYS,
      figures: {
        status: 'available',
        data: {
          organizations: count(organizations.length),
          organizationsAdded: count(
            organizations.filter((o) => o.createdHoursAgo <= PLATFORM_PERIOD_DAYS * 24).length,
          ),
          memberships: count(organizations.reduce((sum, o) => sum + o.memberships, 0)),
          membershipRequests: count(organizations.reduce((sum, o) => sum + o.pendingRequests, 0)),
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
                createdAt: ago(o.createdHoursAgo),
                memberships: count(o.memberships),
                pendingRequests: count(o.pendingRequests),
              })),
          },
      operatorAssignments: owner
        ? { status: 'available', data: count(facts.operatorAssignments) }
        : UNAVAILABLE,
      adminInvitationsAwaiting: owner
        ? { status: 'available', data: count(empty ? 0 : facts.adminInvitationsAwaiting) }
        : UNAVAILABLE,
      activity:
        owner && !partial
          ? {
              status: 'available',
              data: empty
                ? []
                : facts.activity.map((e) => ({
                    id: e.id,
                    action: e.action,
                    organizationName:
                      e.organization === null ? null : (names.get(e.organization) ?? null),
                    occurredAt: ago(e.hoursAgo),
                  })),
            }
          : UNAVAILABLE,
    };
    return answer(dashboard, this.latency);
  }
}

/**
 * Mock adapter of a Platform's commercial facts (demo builds only), for the owner: an operator is refused (`403`), as
 * no commercial read authority is confirmed for operators. Subscription states come from the Organization records, so
 * they always add up to the Platform's Organizations; Personal Premium and payment issues are separate facts.
 */
export class MockPlatformCommercialGateway extends PlatformCommercialGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DASHBOARD_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly auth = inject(DemoAuthState);

  load(platform: PlatformId): Observable<PlatformCommercial> {
    const viewer = viewerOf(this.auth.signedIn(), platform);
    if (typeof viewer !== 'string') return fail(viewer, this.latency);
    if (viewer !== 'owner')
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 }, this.latency);
    if (this.scenario === 'error') return fail({ kind: 'unavailable', status: 503 }, this.latency);
    const facts = DEMO_PLATFORM_FACTS[platform];
    if (facts === undefined) return fail(NOT_FOUND, this.latency);
    const empty = this.scenario === 'empty';
    const organizations = empty ? [] : demoOrganizationsOf(platform);
    const graceEndsAt = new Date(this.now() + facts.graceEndsInHours * HOUR_MS).toISOString();

    const commercial: PlatformCommercial = {
      platformId: platform,
      organizationSubscriptions: {
        status: 'available',
        data: organizations.map((o) => ({
          organizationId: o.id,
          organizationName: o.name,
          state: o.subscription,
          ...(o.subscription === 'grace' ? { graceEndsAt } : {}),
        })),
      },
      personalPremium:
        this.scenario === 'partial'
          ? UNAVAILABLE
          : { status: 'available', data: count(empty ? 0 : facts.personalPremium) },
      paymentIssues: { status: 'available', data: count(empty ? 0 : facts.paymentIssues.length) },
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
