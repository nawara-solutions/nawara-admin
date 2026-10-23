import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { platformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { organizationsOf } from '../../../demo/world/selectors';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import { demoPlatformDirectory } from '../../platforms/data-access/platform-directory.mock';
import { subscriptionCounts } from '../domain/platform-commercial.model';
import {
  MockPlatformCommercialGateway,
  MockPlatformDashboardGateway,
  PLATFORM_DASHBOARD_DEMO_SCENARIO,
  PlatformDashboardDemoScenario,
} from './platform-dashboard.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const WORLD = demoWorldSeed(NOW);
const DIRECTORY = demoPlatformDirectory(WORLD);

function setUp(
  viewer: 'owner' | 'operator' | null,
  options: { scenario?: PlatformDashboardDemoScenario; operator?: AdminIdentityId } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: PLATFORM_DASHBOARD_DEMO_SCENARIO, useValue: options.scenario ?? 'normal' },
      MockPlatformDashboardGateway,
      MockPlatformCommercialGateway,
    ],
  });
  if (viewer !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: viewer, email: `${viewer}@x.invalid`, phone: null, adminTier: viewer },
      // The world's identities: its assignment records decide what the operator may see.
      businessIdentityId:
        viewer === 'owner' ? DEMO_OWNER_ID : (options.operator ?? DEMO_OPERATOR_IDS.school),
    });
  return {
    dashboard: TestBed.inject(MockPlatformDashboardGateway),
    commercial: TestBed.inject(MockPlatformCommercialGateway),
  };
}

async function error(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

const value = (metric: Metric) => {
  if (metric.status !== 'available') throw new Error('expected an available metric');
  return metric.value;
};
const data = <T>(section: Section<T>): T => {
  if (section.status !== 'available') throw new Error('expected an available section');
  return section.data;
};

describe('MockPlatformDashboardGateway', () => {
  it('derives every figure from the records, in agreement with the directory', async () => {
    const { dashboard } = setUp('owner');
    const school = await firstValueFrom(dashboard.load(DEMO_SCHOOL_PLATFORM_ID));
    const figures = data(school.figures);
    const directory = DIRECTORY[0];
    expect(school.platformId).toBe(DEMO_SCHOOL_PLATFORM_ID);
    expect(figures.organizations).toEqual(directory?.organizations);
    expect(figures.memberships).toEqual(directory?.memberships);
    expect(value(figures.membershipRequests)).toBe(12);
    expect(value(figures.organizationsWithRequests)).toBe(4);
    expect(value(figures.organizationsAdded)).toBe(2);
    expect(data(school.operatorAssignments)).toEqual(directory?.operatorAssignments);
  });

  it('lists the five newest Organizations of THIS Platform only, newest first', async () => {
    const { dashboard } = setUp('owner');
    const school = data(
      (await firstValueFrom(dashboard.load(DEMO_SCHOOL_PLATFORM_ID))).recentOrganizations,
    );
    expect(school.map((o) => o.name)).toEqual([
      'École Horizon',
      'Lycée Al Amal',
      'Collège Riad',
      'Institut Nour',
      'École Les Oliviers',
    ]);
    const schoolIds = new Set(organizationsOf(WORLD, DEMO_SCHOOL_PLATFORM_ID).map((o) => o.id));
    expect(school.every((o) => schoolIds.has(o.id))).toBe(true);
    expect(school.map((o) => o.createdAt)).toEqual(
      [...school.map((o) => o.createdAt)].sort().reverse(),
    );
    const drive = data(
      (await firstValueFrom(dashboard.load(DEMO_DRIVE_PLATFORM_ID))).recentOrganizations,
    );
    expect(drive.some((o) => schoolIds.has(o.id))).toBe(false);
  });

  it('withholds the owner-only sections from an operator', async () => {
    const { dashboard } = setUp('operator');
    const school = await firstValueFrom(dashboard.load(DEMO_SCHOOL_PLATFORM_ID));
    expect(school.figures.status).toBe('available');
    expect(school.recentOrganizations.status).toBe('available');
    expect(school.operatorAssignments.status).toBe('unavailable');
    expect(school.adminInvitationsAwaiting.status).toBe('unavailable');
    expect(school.activity.status).toBe('unavailable');
  });

  it('answers a collapsed 404 for an unknown Platform and for one the operator is not assigned to', async () => {
    const { dashboard } = setUp('operator', { operator: DEMO_OPERATOR_IDS.school });
    expect((await error(dashboard.load(platformId('unknown')))).status).toBe(404);
    expect((await error(dashboard.load(DEMO_DRIVE_PLATFORM_ID))).status).toBe(404);
  });

  it('answers 401 when nobody is signed in', async () => {
    const { dashboard } = setUp(null);
    expect((await error(dashboard.load(DEMO_SCHOOL_PLATFORM_ID))).status).toBe(401);
  });

  it('simulates an outage, unavailable sections, and a Platform without Organizations', async () => {
    expect(
      (await error(setUp('owner', { scenario: 'error' }).dashboard.load(DEMO_SCHOOL_PLATFORM_ID)))
        .status,
    ).toBe(503);
    TestBed.resetTestingModule();
    const partial = await firstValueFrom(
      setUp('owner', { scenario: 'partial' }).dashboard.load(DEMO_SCHOOL_PLATFORM_ID),
    );
    expect(partial.figures.status).toBe('available');
    expect(partial.recentOrganizations.status).toBe('unavailable');
    expect(partial.activity.status).toBe('unavailable');
    TestBed.resetTestingModule();
    const empty = await firstValueFrom(
      setUp('owner', { scenario: 'empty' }).dashboard.load(DEMO_SCHOOL_PLATFORM_ID),
    );
    expect(value(data(empty.figures).organizations)).toBe(0);
    expect(data(empty.recentOrganizations)).toEqual([]);
  });
});

describe('MockPlatformCommercialGateway', () => {
  it('gives one subscription per Organization, so the states add up to the Platform’s Organizations', async () => {
    const { commercial } = setUp('owner');
    const school = await firstValueFrom(commercial.load(DEMO_SCHOOL_PLATFORM_ID));
    const counts = subscriptionCounts(data(school.organizationSubscriptions));
    expect(counts).toEqual({ active: 13, grace: 1, none: 2, total: 16 });
    expect(counts.active + counts.grace + counts.none).toBe(
      organizationsOf(WORLD, DEMO_SCHOOL_PLATFORM_ID).length,
    );
    const grace = data(school.organizationSubscriptions).find((s) => s.state === 'grace');
    expect(grace?.organizationName).toBe('Lycée Al Amal');
    // Its subscription ended 6 hours ago: the 24-hour grace ends 18 hours from now.
    expect(grace?.graceEndsAt).toBe('2026-10-24T06:00:00.000Z');
  });

  it('keeps Personal Premium and payment issues apart from Organization subscriptions', async () => {
    const { commercial } = setUp('owner');
    const school = await firstValueFrom(commercial.load(DEMO_SCHOOL_PLATFORM_ID));
    expect(data(school.personalPremium)).toEqual({ status: 'available', value: 21 });
    expect(data(school.paymentIssues)).toEqual({ status: 'available', value: 1 });
    // Not derived from, nor counted in, the subscription states.
    expect(data(school.organizationSubscriptions)).toHaveLength(16);
  });

  it('reports the assisted-payments setting read only; a disabled Platform has no Organization override', async () => {
    const { commercial } = setUp('owner');
    const school = data(
      (await firstValueFrom(commercial.load(DEMO_SCHOOL_PLATFORM_ID))).assistedPayments,
    );
    expect(school).toEqual({ platform: 'enabled', organizationsDisabled: 2, organizations: 16 });
    const drive = data(
      (await firstValueFrom(commercial.load(DEMO_DRIVE_PLATFORM_ID))).assistedPayments,
    );
    expect(drive).toEqual({ platform: 'disabled', organizationsDisabled: 0, organizations: 8 });
  });

  it('counts payment issues from the Payment records, per Platform', async () => {
    const { commercial } = setUp('owner');
    const drive = await firstValueFrom(commercial.load(DEMO_DRIVE_PLATFORM_ID));
    expect(data(drive.paymentIssues)).toEqual({ status: 'available', value: 1 });
    expect(subscriptionCounts(data(drive.organizationSubscriptions))).toEqual({
      active: 7,
      grace: 0,
      none: 1,
      total: 8,
    });
  });

  it('refuses an operator (no confirmed commercial read authority)', async () => {
    const { commercial } = setUp('operator');
    expect((await error(commercial.load(DEMO_SCHOOL_PLATFORM_ID))).status).toBe(403);
  });
});
