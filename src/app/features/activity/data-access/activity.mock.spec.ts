import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId, companyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { blockOperator } from '../../../demo/world/commands/operator.commands';
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
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  ACTIVITY_DEMO_SCENARIO,
  ActivityDemoScenario,
  MockActivityGateway,
  demoAdministrativeActivity,
} from './activity.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: ActivityDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ACTIVITY_DEMO_SCENARIO, useValue: scenario },
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
    gateway: TestBed.runInInjectionContext(() => new MockActivityGateway()),
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

const withBlock = (world: DemoWorldTables): DemoWorldTables => {
  const outcome = blockOperator({
    actor: DEMO_OWNER_ID,
    operatorId: DEMO_OPERATOR_IDS.school,
    now: NOW - 3_600_000,
  })(world);
  if (!outcome.ok) throw new Error('expected the block to succeed');
  return outcome.world;
};

describe('Simulated administrative activity of the demo world (P8-S1)', () => {
  const world = demoWorldSeed(NOW);
  const activity = demoAdministrativeActivity(world);

  it('lists exactly the seeded events, newest first, nothing generated', () => {
    expect(activity.entries.map((e) => e.id)).toEqual([
      'platform-activity-s1',
      'platform-activity-d1',
      'platform-activity-s2',
      'platform-activity-s3',
      'platform-activity-s4',
      'platform-activity-d2',
      'platform-activity-d3',
    ]);
    expect(activity.entries).toHaveLength(world.activity.length);
    const times = activity.entries.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
  });

  it('reads each scope from the record: the Platform-level assignment names no Organization', () => {
    expect(activity.entries.map((e) => e.scope)).toEqual([
      'organization',
      'organization',
      'organization',
      'organization',
      'platform',
      'organization',
      'organization',
    ]);
    const assigned = activity.entries.find((e) => e.action === 'operator.assigned');
    expect(assigned).toMatchObject({
      scope: 'platform',
      platformId: DEMO_SCHOOL_PLATFORM_ID,
      organizationId: null,
    });
    for (const e of activity.entries.filter((x) => x.scope === 'organization')) {
      const organization = world.organizations.find((o) => o.id === e.organizationId);
      expect(organization?.platformId).toBe(e.platformId);
    }
  });

  it('keeps Company events Company-level: no Platform, no Organization, the operator by id only', () => {
    const blocked = demoAdministrativeActivity(withBlock(world));
    const company = blocked.entries.filter((e) => e.scope === 'company');
    expect(company).toEqual([
      {
        id: expect.stringMatching(/^operator-activity-blocked-/),
        scope: 'company',
        action: 'operator.blocked',
        occurredAt: new Date(NOW - 3_600_000).toISOString(),
        platformId: null,
        organizationId: null,
        operatorId: DEMO_OPERATOR_IDS.school,
      },
    ]);
    // Ordered with the rest by time: an hour ago, so newer than s1 (2 h).
    expect(blocked.entries.map((e) => e.id).slice(0, 3)).toEqual([
      expect.stringMatching(/^operator-activity-blocked-/),
      'platform-activity-s1',
      'platform-activity-d1',
    ]);
  });

  it('carries no audit-only field: no audit id, actor, outcome, origin, signature or changes', () => {
    for (const e of demoAdministrativeActivity(withBlock(world)).entries)
      expect(Object.keys(e).sort()).toEqual([
        'action',
        'id',
        'occurredAt',
        'operatorId',
        'organizationId',
        'platformId',
        'scope',
      ]);
  });

  it('gives the Company’s hierarchy only, and leaves out another Company’s Platform and its events', () => {
    expect(activity.platforms.map((p) => p.id)).toEqual([
      DEMO_SCHOOL_PLATFORM_ID,
      DEMO_DRIVE_PLATFORM_ID,
    ]);
    expect(activity.organizations).toHaveLength(24);
    const other: DemoWorldTables = {
      ...world,
      platforms: world.platforms.map((p) =>
        p.id === DEMO_DRIVE_PLATFORM_ID ? { ...p, companyId: companyId('elsewhere') } : p,
      ),
    };
    const isolated = demoAdministrativeActivity(other);
    expect(isolated.platforms.map((p) => p.id)).toEqual([DEMO_SCHOOL_PLATFORM_ID]);
    expect(isolated.organizations.every((o) => o.platformId === DEMO_SCHOOL_PLATFORM_ID)).toBe(
      true,
    );
    expect(isolated.entries.every((e) => e.platformId !== DEMO_DRIVE_PLATFORM_ID)).toBe(true);
  });
});

describe('MockActivityGateway (P8-S1)', () => {
  it('answers the owner with the world’s activity, changing nothing', async () => {
    const s = setUp();
    const before = s.world.snapshot();
    expect(await firstValueFrom(s.gateway.activity(DEMO_COMPANY_ID))).toEqual(
      demoAdministrativeActivity(before),
    );
    expect(s.world.snapshot()).toBe(before);
  });

  it('refuses an operator, even one assigned to every Platform (403), and a caller without a session (401)', async () => {
    expect(await error(setUp(DEMO_OPERATOR_IDS.multi).gateway.activity(DEMO_COMPANY_ID))).toEqual({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp(null).gateway.activity(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('collapses another Company to 404', async () => {
    const other: CompanyId = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1aff');
    expect(await error(setUp().gateway.activity(other))).toEqual({
      kind: 'not_found',
      status: 404,
    });
  });

  it('simulates an unavailable service and a Company without activity', async () => {
    expect(
      await error(setUp(DEMO_OWNER_ID, 'error').gateway.activity(DEMO_COMPANY_ID)),
    ).toMatchObject({ kind: 'unavailable', status: 503 });
    TestBed.resetTestingModule();
    const empty = await firstValueFrom(
      setUp(DEMO_OWNER_ID, 'empty').gateway.activity(DEMO_COMPANY_ID),
    );
    expect(empty.entries).toEqual([]);
  });

  it('is read only and has no export: the gateway offers nothing else', () => {
    const methods = Object.getOwnPropertyNames(MockActivityGateway.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(['activity', 'fail']);
  });
});
