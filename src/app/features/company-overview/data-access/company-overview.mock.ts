import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables } from '../../../demo/world/records';
import {
  activeAdminInvitationsOf,
  assignmentsOf,
  companyActivity,
  growthSeries,
  membershipTotal,
  organizationNameOf,
  organizationsOf,
  organizationsOfCompany,
  paymentIssuesOf,
  platformRefOf,
  platformRefs,
  platformsWithOperators,
  subscriptionStateOf,
  subscriptionsEndingWithin,
  uniqueAssignedOperators,
} from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { CommercialSummary } from '../domain/commercial-summary.model';
import { CompanyOverview } from '../domain/company-overview.model';
import { ServiceHealthSummary } from '../domain/service-health.model';
import { CommercialSummaryGateway } from './commercial-summary.gateway';
import { CompanyOverviewGateway } from './company-overview.gateway';
import { DEMO_SERVICE_HEALTH } from './company-overview.fixtures';
import { ServiceHealthGateway } from './service-health.gateway';

/** Which answer the mocks give, so every view state can be exercised (§3). Demo builds use `normal`. */
export type CompanyOverviewDemoScenario = 'normal' | 'error' | 'forbidden' | 'sections-unavailable';

export const COMPANY_OVERVIEW_DEMO_SCENARIO = new InjectionToken<CompanyOverviewDemoScenario>(
  'COMPANY_OVERVIEW_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** The reporting period of the overview, in days. */
export const COMPANY_PERIOD_DAYS = 30;
/** The growth chart's days, as offsets before today (UTC): the period's start, then weekly, then today. */
export const GROWTH_DAY_OFFSETS: readonly number[] = [30, 21, 14, 7, 0];
/** How many of the newest events the overview's activity feed shows. */
export const RECENT_ACTIVITY = 4;
/** "Expiring soon": active subscriptions that end within this many days. */
export const EXPIRING_WITHIN_DAYS = 14;

const count = (value: number) => ({ status: 'available', value }) as const;

/**
 * The Company Overview of the demo world at `now`, every figure derived from its records, so it agrees with the
 * Platform directory and the Platform dashboards by construction. Unique identities stay unavailable: there are no
 * person records before P5, and memberships are not identities.
 */
export function demoCompanyOverview(world: DemoWorldTables, now: number): CompanyOverview {
  const platforms = platformRefs(world);
  const organizations = organizationsOfCompany(world);
  const invitations = activeAdminInvitationsOf(world, organizations, now).length;
  return {
    company: { id: world.company.id, name: world.company.name },
    periodDays: COMPANY_PERIOD_DAYS,
    summary: {
      platforms: count(platforms.length),
      organizations: count(organizations.length),
      uniqueIdentities: { status: 'unavailable' },
      pendingAdminInvitations: count(invitations),
    },
    platforms: platforms.map((platform) => ({
      platform,
      organizations: count(organizationsOf(world, platform.id).length),
      memberships: count(membershipTotal(organizationsOf(world, platform.id))),
      operators: count(assignmentsOf(world, platform.id).length),
    })),
    access: {
      status: 'available',
      data: {
        operatorAssignments: count(world.assignments.length),
        uniqueOperators: count(uniqueAssignedOperators(world)),
        platformsWithOperators: count(platformsWithOperators(world)),
      },
    },
    attention: {
      status: 'available',
      data: invitations > 0 ? [{ kind: 'admin_invitations_awaiting', count: invitations }] : [],
    },
    growth: {
      status: 'available',
      data: {
        points: growthSeries(organizations, now, GROWTH_DAY_OFFSETS),
        platforms: platforms.map((platform) => ({
          platformId: platform.id,
          points: growthSeries(organizationsOf(world, platform.id), now, GROWTH_DAY_OFFSETS),
        })),
      },
    },
    activity: {
      status: 'available',
      data: companyActivity(world)
        .slice(0, RECENT_ACTIVITY)
        .map((e) => ({
          id: e.id,
          action: e.action,
          organizationName: organizationNameOf(world, e.organizationId),
          platformName: platformRefOf(world, e.platformId)?.name ?? '',
          occurredAt: e.occurredAt,
        })),
    },
  };
}

/** The Company's commercial summary at `now`, from the subscription and payment records. */
export function demoCommercialSummary(world: DemoWorldTables, now: number): CommercialSummary {
  const organizations = organizationsOfCompany(world);
  return {
    activeLicenses: count(
      organizations.filter((o) => subscriptionStateOf(world, o.id, now).state === 'active').length,
    ),
    expiringSoon: count(subscriptionsEndingWithin(world, organizations, now, EXPIRING_WITHIN_DAYS)),
    expiringWithinDays: EXPIRING_WITHIN_DAYS,
    paymentIssues: count(paymentIssuesOf(world, organizations).length),
  };
}

/**
 * Mock adapter of the overview (demo builds only), reading the demo world at request time. Another Company answers like
 * Core's collapsed `404`.
 */
export class MockCompanyOverviewGateway extends CompanyOverviewGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_OVERVIEW_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly world = inject(DemoWorld);

  load(company: CompanyId): Observable<CompanyOverview> {
    const fail = (error: AppError) => throwError(() => error).pipe(delay(this.latency));
    const world = this.world.snapshot();
    if (company !== world.company.id) {
      return fail({ kind: 'not_found', status: 404 });
    }
    const overview = demoCompanyOverview(world, this.now());
    switch (this.scenario) {
      case 'error':
        return fail({ kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 });
      case 'forbidden':
        return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
      case 'sections-unavailable':
        return of<CompanyOverview>({
          ...overview,
          access: { status: 'unavailable' },
          attention: { status: 'unavailable' },
          growth: { status: 'unavailable' },
          activity: { status: 'unavailable' },
        }).pipe(delay(this.latency));
      case 'normal':
        return of(overview).pipe(delay(this.latency));
    }
  }
}

/** Mock adapter of the commercial summary (demo builds only), reading the demo world at request time. */
export class MockCommercialSummaryGateway extends CommercialSummaryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_OVERVIEW_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);
  private readonly world = inject(DemoWorld);

  load(company: CompanyId): Observable<CommercialSummary> {
    const world = this.world.snapshot();
    if (company !== world.company.id || this.scenario === 'sections-unavailable') {
      const notFound: AppError = { kind: 'not_found', status: 404 };
      return throwError(() => notFound).pipe(delay(this.latency));
    }
    return of(demoCommercialSummary(world, this.now())).pipe(delay(this.latency));
  }
}

/** Mock adapter of service health (demo builds only): illustrative statuses, never live health. */
export class MockServiceHealthGateway extends ServiceHealthGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_OVERVIEW_DEMO_SCENARIO);

  load(): Observable<ServiceHealthSummary> {
    if (this.scenario === 'sections-unavailable') {
      const unavailable: AppError = { kind: 'unavailable', status: 503 };
      return throwError(() => unavailable).pipe(delay(this.latency));
    }
    return of(DEMO_SERVICE_HEALTH).pipe(delay(this.latency));
  }
}

export const MOCK_COMPANY_OVERVIEW_PROVIDERS: readonly Provider[] = [
  { provide: CompanyOverviewGateway, useClass: MockCompanyOverviewGateway },
];
export const MOCK_COMMERCIAL_SUMMARY_PROVIDERS: readonly Provider[] = [
  { provide: CommercialSummaryGateway, useClass: MockCommercialSummaryGateway },
];
export const MOCK_SERVICE_HEALTH_PROVIDERS: readonly Provider[] = [
  { provide: ServiceHealthGateway, useClass: MockServiceHealthGateway },
];
