import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId, companyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId, DemoWorldTables } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { entitlementOf, subscriptionStateOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { LicensesOverview } from '../domain/licenses.model';
import {
  LICENSES_DEMO_SCENARIO,
  LicensesDemoScenario,
  MockLicensesGateway,
  demoLicensesOverview,
} from './licenses.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: LicensesDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: LICENSES_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  if (as !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: {
        userId: as,
        email: null,
        phone: null,
        adminTier: as === DEMO_OWNER_ID ? 'owner' : 'operator',
      },
      businessIdentityId: as,
    });
  return {
    gateway: TestBed.runInInjectionContext(() => new MockLicensesGateway()),
    world: TestBed.inject(DemoWorld),
  };
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

const platform = (o: LicensesOverview, id: string) => {
  const row = o.platforms.find((p) => p.platform.id === id);
  if (!row) throw new Error(`no platform ${id}`);
  return row;
};

describe('Licenses overview of the demo world (P7-S1)', () => {
  const world = demoWorldSeed(NOW);
  const overview = demoLicensesOverview(world, NOW);

  it('counts the seeded subscriptions exactly: grace is never counted as active', () => {
    expect(overview.company).toEqual({
      organizations: 24,
      active: 20,
      grace: 1,
      none: 3,
      endingSoon: 4,
      entitled: 21,
    });
    expect(overview.endingWithinDays).toBe(14);
    expect(overview.graceHours).toBe(24);
  });

  it('distributes them per Platform, adding up to the Company', () => {
    expect(platform(overview, DEMO_SCHOOL_PLATFORM_ID).distribution).toEqual({
      organizations: 16,
      active: 13,
      grace: 1,
      none: 2,
      endingSoon: 3,
      entitled: 14,
    });
    expect(platform(overview, DEMO_DRIVE_PLATFORM_ID).distribution).toEqual({
      organizations: 8,
      active: 7,
      grace: 0,
      none: 1,
      endingSoon: 1,
      entitled: 7,
    });
    for (const key of [
      'organizations',
      'active',
      'grace',
      'none',
      'endingSoon',
      'entitled',
    ] as const)
      expect(overview.platforms.reduce((n, p) => n + p.distribution[key], 0)).toBe(
        overview.company[key],
      );
    for (const { distribution: d } of [{ distribution: overview.company }, ...overview.platforms]) {
      expect(d.active + d.grace + d.none).toBe(d.organizations);
      expect(d.entitled).toBe(d.active + d.grace);
      expect(d.endingSoon).toBeLessThanOrEqual(d.active);
    }
  });

  it('keeps entitlement apart from the subscription state, and ends grace after exactly 24 hours', () => {
    const grace = world.organizations.find(
      (o) => subscriptionStateOf(world, o.id, NOW).state === 'grace',
    )!;
    expect(grace.name).toBe('Lycée Al Amal');
    expect(entitlementOf(world, grace.id, NOW)).toBe('entitledInGrace');
    const ended = Date.parse(
      world.subscriptions.find((s) => s.organizationId === grace.id)!.endsAt,
    );
    expect(entitlementOf(world, grace.id, ended + 24 * HOUR - 1)).toBe('entitledInGrace');
    expect(entitlementOf(world, grace.id, ended + 24 * HOUR)).toBe('notEntitled');
    const none = world.organizations.find((o) => o.name === 'Institut Nour')!;
    expect(entitlementOf(world, none.id, NOW)).toBe('notEntitled');
    const active = world.organizations.find((o) => o.name === 'École Horizon')!;
    expect(entitlementOf(world, active.id, NOW)).toBe('entitled');
  });

  it('lists grace first, then subscriptions ending within 14 days, each by when it ends', () => {
    expect(overview.attention.map((a) => [a.organizationName, a.reason])).toEqual([
      ['Lycée Al Amal', 'graceEnds'],
      ['Lycée Ibn Khaldoun', 'ends'],
      ['Collège Riad', 'ends'],
      ['Permis Express', 'ends'],
      ['École Ibn Sina', 'ends'],
    ]);
    expect(overview.attention[0]?.at).toBe(new Date(NOW + 18 * HOUR).toISOString());
  });

  it('shows Personal Premium as the declared per-Platform count, independent of memberships', () => {
    expect(platform(overview, DEMO_SCHOOL_PLATFORM_ID).personalPremium).toEqual({
      status: 'available',
      value: 21,
    });
    expect(platform(overview, DEMO_DRIVE_PLATFORM_ID).personalPremium).toEqual({
      status: 'available',
      value: 9,
    });
    // Memberships change: Personal Premium and the subscriptions do not.
    const fewerMembers: DemoWorldTables = { ...world, memberships: [] };
    const again = demoLicensesOverview(fewerMembers, NOW);
    expect(again.platforms.map((p) => p.personalPremium)).toEqual(
      overview.platforms.map((p) => p.personalPremium),
    );
    expect(again.company).toEqual(overview.company);
    // Personal Premium changes: the subscriptions do not.
    const morePremium: DemoWorldTables = {
      ...world,
      platformCommercial: world.platformCommercial.map((c) => ({ ...c, personalPremium: 999 })),
    };
    expect(demoLicensesOverview(morePremium, NOW).company).toEqual(overview.company);
    // No commercial record: unavailable, never zero.
    const noRecord = demoLicensesOverview({ ...world, platformCommercial: [] }, NOW);
    expect(noRecord.platforms.every((p) => p.personalPremium.status === 'unavailable')).toBe(true);
  });
});

describe('MockLicensesGateway (P7-S1)', () => {
  it('answers the owner with the overview of the world, changing nothing', async () => {
    const s = setUp();
    const before = s.world.snapshot();
    const answer = await firstValueFrom(s.gateway.overview(DEMO_COMPANY_ID));
    expect(answer).toEqual(demoLicensesOverview(before, NOW));
    expect(s.world.snapshot()).toBe(before);
  });

  it('refuses an operator, even one assigned to every Platform (403), and a caller without a session (401)', async () => {
    expect(await error(setUp(DEMO_OPERATOR_IDS.multi).gateway.overview(DEMO_COMPANY_ID))).toEqual({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp(null).gateway.overview(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('collapses another Company to 404', async () => {
    const other: CompanyId = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1aff');
    expect(await error(setUp().gateway.overview(other))).toMatchObject({ status: 404 });
  });

  it('simulates an unavailable service and an empty Company', async () => {
    expect(
      await error(setUp(DEMO_OWNER_ID, 'error').gateway.overview(DEMO_COMPANY_ID)),
    ).toMatchObject({
      kind: 'unavailable',
      status: 503,
    });
    TestBed.resetTestingModule();
    const empty = await firstValueFrom(
      setUp(DEMO_OWNER_ID, 'empty').gateway.overview(DEMO_COMPANY_ID),
    );
    expect(empty.company.organizations).toBe(0);
    expect(empty.attention).toEqual([]);
  });

  it('is read only: the gateway offers no change of any kind', () => {
    const methods = Object.getOwnPropertyNames(MockLicensesGateway.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(['fail', 'overview']);
  });
});
