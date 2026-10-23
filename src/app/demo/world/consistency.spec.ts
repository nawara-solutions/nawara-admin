import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../core/auth/auth.mock-state';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../core/context/scope-directory.mock';
import { MockNotificationSummaryGateway } from '../../core/notifications/notification-summary.mock';
import {
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
} from '../../features/company-overview/data-access/company-overview.mock';
import { Metric, Section } from '../../shared/dashboard/metric';
import { NW_CLOCK } from '../../shared/format/clock';
import {
  MockPlatformCommercialGateway,
  MockPlatformDashboardGateway,
} from '../../features/platform-dashboard/data-access/platform-dashboard.mock';
import { subscriptionCounts } from '../../features/platform-dashboard/domain/platform-commercial.model';
import { MockPlatformDirectoryGateway } from '../../features/platforms/data-access/platform-directory.mock';
import { AdminIdentityId } from './records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from './seed';

const NOW = Date.parse('2026-10-23T12:00:00Z');

/** Every demo mock that reads the world, as the app binds them, over one root world. */
function mocks(signedInAs: AdminIdentityId, tier: 'owner' | 'operator') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      MockScopeDirectoryGateway,
      MockNotificationSummaryGateway,
      MockCompanyOverviewGateway,
      MockCommercialSummaryGateway,
      MockPlatformDirectoryGateway,
      MockPlatformDashboardGateway,
      MockPlatformCommercialGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: signedInAs, email: null, phone: null, adminTier: tier },
    businessIdentityId: signedInAs,
  });
  return {
    scope: TestBed.inject(MockScopeDirectoryGateway),
    notifications: TestBed.inject(MockNotificationSummaryGateway),
    overview: TestBed.inject(MockCompanyOverviewGateway),
    commercial: TestBed.inject(MockCommercialSummaryGateway),
    directory: TestBed.inject(MockPlatformDirectoryGateway),
    dashboard: TestBed.inject(MockPlatformDashboardGateway),
    platformCommercial: TestBed.inject(MockPlatformCommercialGateway),
  };
}

const value = (metric: Metric | undefined): number => {
  if (metric?.status !== 'available') throw new Error('expected an available metric');
  return metric.value;
};
const data = <T>(section: Section<T>): T => {
  if (section.status !== 'available') throw new Error('expected an available section');
  return section.data;
};

describe('demo world: cross-feature consistency', () => {
  it('gives the Overview, the directory and each Platform dashboard the same figures', async () => {
    const m = mocks(DEMO_OWNER_ID, 'owner');
    const overview = await firstValueFrom(m.overview.load(DEMO_COMPANY_ID));
    const directory = await firstValueFrom(m.directory.list(DEMO_COMPANY_ID));
    const scope = await firstValueFrom(m.scope.companyDirectory(DEMO_COMPANY_ID));
    expect(directory.map((e) => e.platform)).toEqual(scope.platforms);
    expect(overview.platforms.map((p) => p.platform)).toEqual(scope.platforms);

    let organizations = 0;
    let invitations = 0;
    for (const entry of directory) {
      const dashboard = await firstValueFrom(m.dashboard.load(entry.platform.id));
      const figures = data(dashboard.figures);
      const row = overview.platforms.find((p) => p.platform.id === entry.platform.id);
      expect(figures.organizations).toEqual(entry.organizations);
      expect(row?.organizations).toEqual(entry.organizations);
      expect(figures.memberships).toEqual(entry.memberships);
      expect(row?.memberships).toEqual(entry.memberships);
      expect(data(dashboard.operatorAssignments)).toEqual(entry.operatorAssignments);
      expect(row?.operators).toEqual(entry.operatorAssignments);
      organizations += value(entry.organizations);
      invitations += value(data(dashboard.adminInvitationsAwaiting));
    }
    expect(value(overview.summary.organizations)).toBe(organizations);
    expect(value(overview.summary.pendingAdminInvitations)).toBe(invitations);
    expect(value(data(overview.access).operatorAssignments)).toBe(
      directory.reduce((n, e) => n + value(e.operatorAssignments), 0),
    );
  });

  it('gives the Company commercial summary the sum of the Platforms’ commercial facts', async () => {
    const m = mocks(DEMO_OWNER_ID, 'owner');
    const company = await firstValueFrom(m.commercial.load(DEMO_COMPANY_ID));
    let active = 0;
    let issues = 0;
    for (const platform of [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID]) {
      const facts = await firstValueFrom(m.platformCommercial.load(platform));
      active += subscriptionCounts(data(facts.organizationSubscriptions)).active;
      issues += value(data(facts.paymentIssues));
    }
    expect(value(company.activeLicenses)).toBe(active);
    expect(value(company.paymentIssues)).toBe(issues);
  });

  it('lists in the Company activity exactly the newest events of the Platform activity feeds', async () => {
    const m = mocks(DEMO_OWNER_ID, 'owner');
    const overview = data((await firstValueFrom(m.overview.load(DEMO_COMPANY_ID))).activity);
    const platformEvents = [
      ...data((await firstValueFrom(m.dashboard.load(DEMO_SCHOOL_PLATFORM_ID))).activity),
      ...data((await firstValueFrom(m.dashboard.load(DEMO_DRIVE_PLATFORM_ID))).activity),
    ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    expect(overview.map((e) => [e.id, e.occurredAt, e.organizationName])).toEqual(
      platformEvents.slice(0, overview.length).map((e) => [e.id, e.occurredAt, e.organizationName]),
    );
  });

  it('shows an operator only the Platforms assigned in the world, and nothing of another Platform', async () => {
    const m = mocks(DEMO_OPERATOR_IDS.school, 'operator');
    const assigned = await firstValueFrom(
      m.scope.assignedPlatforms([DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID]),
    );
    // The scope directory resolves ids; access itself is Auth's (the dashboard refuses the other Platform).
    expect(assigned.map((p) => p.id)).toEqual([DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID]);
    const school = await firstValueFrom(m.dashboard.load(DEMO_SCHOOL_PLATFORM_ID));
    const schoolIds = new Set(data(school.recentOrganizations).map((o) => o.id));
    expect(schoolIds.size).toBeGreaterThan(0);
    await expect(firstValueFrom(m.dashboard.load(DEMO_DRIVE_PLATFORM_ID))).rejects.toMatchObject({
      status: 404,
    });
    expect((await firstValueFrom(m.notifications.summary())).unread).toBe(0);
  });

  it('answers the owner’s unread count from the world', async () => {
    const m = mocks(DEMO_OWNER_ID, 'owner');
    expect((await firstValueFrom(m.notifications.summary())).unread).toBe(4);
  });
});
