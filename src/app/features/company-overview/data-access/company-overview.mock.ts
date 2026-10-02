import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import { CommercialSummary } from '../domain/commercial-summary.model';
import { ActivityEntry, CompanyOverview } from '../domain/company-overview.model';
import { ServiceHealthSummary } from '../domain/service-health.model';
import { CommercialSummaryGateway } from './commercial-summary.gateway';
import { CompanyOverviewGateway } from './company-overview.gateway';
import {
  DEMO_COMMERCIAL_SUMMARY,
  DEMO_COMPANY_OVERVIEW,
  DEMO_SERVICE_HEALTH,
} from './company-overview.fixtures';
import { ServiceHealthGateway } from './service-health.gateway';

/** Which answer the mocks give, so every view state can be exercised (§3). Demo builds use `normal`. */
export type CompanyOverviewDemoScenario = 'normal' | 'error' | 'forbidden' | 'sections-unavailable';

export const COMPANY_OVERVIEW_DEMO_SCENARIO = new InjectionToken<CompanyOverviewDemoScenario>(
  'COMPANY_OVERVIEW_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** Age of the newest fictional activity entry when the demo runs. */
export const NEWEST_ACTIVITY_AGE_MS = 2 * 3_600_000;

/**
 * Moves the fictional activity forward so the newest entry happened two hours ago: the feed then reads like recent
 * activity ("2 hours ago", "Yesterday", "3 days ago") whatever day the demo runs. The gaps between entries are kept.
 */
export function rebaseActivity(entries: readonly ActivityEntry[], now: number): ActivityEntry[] {
  const newest = Math.max(...entries.map((e) => Date.parse(e.occurredAt)));
  const shift = Math.max(0, now - NEWEST_ACTIVITY_AGE_MS - newest);
  return entries.map((e) => ({
    ...e,
    occurredAt: new Date(Date.parse(e.occurredAt) + shift).toISOString(),
  }));
}

/** Mock adapter of the overview (demo builds only). Another Company answers like Core's collapsed `404`. */
export class MockCompanyOverviewGateway extends CompanyOverviewGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_OVERVIEW_DEMO_SCENARIO);
  private readonly now = inject(NW_CLOCK);

  load(company: CompanyId): Observable<CompanyOverview> {
    const fail = (error: AppError) => throwError(() => error).pipe(delay(this.latency));
    if (company !== DEMO_COMPANY_OVERVIEW.company.id) {
      return fail({ kind: 'not_found', status: 404 });
    }
    const activity = DEMO_COMPANY_OVERVIEW.activity;
    const overview: CompanyOverview = {
      ...DEMO_COMPANY_OVERVIEW,
      activity:
        activity.status === 'available'
          ? { status: 'available', data: rebaseActivity(activity.data, this.now()) }
          : activity,
    };
    switch (this.scenario) {
      case 'error':
        return fail({ kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 });
      case 'forbidden':
        return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
      case 'sections-unavailable':
        return of<CompanyOverview>({
          ...overview,
          summary: { ...overview.summary, uniqueIdentities: { status: 'unavailable' } },
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

/** Mock adapter of the commercial summary (demo builds only). */
export class MockCommercialSummaryGateway extends CommercialSummaryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_OVERVIEW_DEMO_SCENARIO);

  load(company: CompanyId): Observable<CommercialSummary> {
    if (company !== DEMO_COMPANY_OVERVIEW.company.id || this.scenario === 'sections-unavailable') {
      const notFound: AppError = { kind: 'not_found', status: 404 };
      return throwError(() => notFound).pipe(delay(this.latency));
    }
    return of(DEMO_COMMERCIAL_SUMMARY).pipe(delay(this.latency));
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
