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
import {
  paymentIssuesOf,
  platformRefOf,
  subscriptionLifecycleOf,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { demoPlatformSubscriptions } from '../../licenses/data-access/licenses.mock';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  BILLING_DEMO_SCENARIO,
  BillingDemoScenario,
  MockBillingGateway,
  demoPaymentFollowUps,
} from './billing.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: BillingDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: BILLING_DEMO_SCENARIO, useValue: scenario },
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
    gateway: TestBed.runInInjectionContext(() => new MockBillingGateway()),
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

describe('Payment follow-ups of the demo world (P7-S3)', () => {
  const world = demoWorldSeed(NOW);
  const { followUps } = demoPaymentFollowUps(world, NOW);

  it('lists exactly the two follow-ups the seeded payment requests give, with their Organization and Platform', () => {
    // Derived from the requests (WP-3.2): the `failed` one and the `requested` one; the `paid` one is no follow-up.
    expect(paymentIssuesOf(world, world.organizations)).toHaveLength(2);
    expect(followUps).toHaveLength(2);
    expect(
      followUps.map((f) => [f.organizationName, f.platform.id, f.platform.name, f.kind]),
    ).toEqual([
      ['Collège Riad', DEMO_SCHOOL_PLATFORM_ID, 'Nawara School', 'failed'],
      ['Auto-École du Port', DEMO_DRIVE_PLATFORM_ID, 'Nawara Drive', 'awaiting_action'],
    ]);
    for (const f of followUps) {
      const record = world.organizations.find((o) => o.id === f.organizationId);
      expect(record?.platformId).toBe(f.platform.id);
    }
  });

  it('keeps the subscription and entitlement apart: a failed payment leaves Collège Riad active and entitled', () => {
    // The WP-4.1 lifecycle (M1): Collège Riad's subscription ends in 6 days; Auto-École du Port has none.
    expect(followUps[0]).toMatchObject({ kind: 'failed', entitlement: 'entitled' });
    expect(followUps[0]?.lifecycle.state).toBe('active');
    expect(followUps[0]?.lifecycle.currentPeriodEnd).not.toBeNull();
    expect(followUps[1]).toMatchObject({ kind: 'awaiting_action', entitlement: 'notEntitled' });
    expect(followUps[1]?.lifecycle.state).toBe('none');
    expect(followUps[1]?.lifecycle.currentPeriodEnd).toBeNull();
    // Without the issues, the subscriptions are the same: a payment issue never changes a state.
    const noIssues: DemoWorldTables = { ...world, paymentRequests: [] };
    for (const o of world.organizations)
      expect(subscriptionStateOf(noIssues, o.id, NOW)).toEqual(
        subscriptionStateOf(world, o.id, NOW),
      );
    expect(demoPaymentFollowUps(noIssues, NOW).followUps).toEqual([]);
  });

  it('never derives a follow-up from grace, an ending or a missing subscription', () => {
    const grace = world.organizations.find(
      (o) => subscriptionStateOf(world, o.id, NOW).state === 'grace',
    );
    expect(grace).toBeDefined();
    expect(followUps.some((f) => f.organizationId === grace?.id)).toBe(false);
    const none = world.organizations.filter(
      (o) => subscriptionStateOf(world, o.id, NOW).state === 'none',
    );
    expect(none.length).toBe(3);
    expect(followUps.filter((f) => f.lifecycle.state === 'none')).toHaveLength(1);
  });

  it('shows the same lifecycle as Licenses for each Organization: one calculation, not a second (M1)', () => {
    for (const f of followUps) {
      expect(f.lifecycle).toEqual(subscriptionLifecycleOf(world, f.organizationId, NOW));
      const platform = platformRefOf(world, f.platform.id)!;
      const licensed = demoPlatformSubscriptions(world, platform, NOW).organizations.find(
        (o) => o.organizationId === f.organizationId,
      );
      expect(licensed?.lifecycle, f.organizationName).toEqual(f.lifecycle);
    }
  });

  it('carries only the supported fields: no amount, currency, invoice, reference, method, date or balance', () => {
    for (const f of followUps)
      expect(Object.keys(f).sort()).toEqual([
        'entitlement',
        'kind',
        // The subscription's lifecycle (WP-4.1): its own period dates, never a payment amount, reference or date.
        'lifecycle',
        'organizationId',
        'organizationName',
        'platform',
      ]);
  });

  it('leaves out an issue of an Organization outside the Company', () => {
    const outside: DemoWorldTables = {
      ...world,
      platforms: world.platforms.filter((p) => p.id !== DEMO_DRIVE_PLATFORM_ID),
    };
    expect(demoPaymentFollowUps(outside, NOW).followUps.map((f) => f.kind)).toEqual(['failed']);
  });
});

describe('MockBillingGateway (P7-S3)', () => {
  it('answers the owner with the follow-ups of the world, changing nothing', async () => {
    const s = setUp();
    const before = s.world.snapshot();
    expect(await firstValueFrom(s.gateway.followUps(DEMO_COMPANY_ID))).toEqual(
      demoPaymentFollowUps(before, NOW),
    );
    expect(s.world.snapshot()).toBe(before);
  });

  it('refuses an operator, even one assigned to every Platform (403), and a caller without a session (401)', async () => {
    expect(await error(setUp(DEMO_OPERATOR_IDS.multi).gateway.followUps(DEMO_COMPANY_ID))).toEqual({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp(null).gateway.followUps(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('collapses another Company to 404', async () => {
    const other: CompanyId = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1aff');
    expect(await error(setUp().gateway.followUps(other))).toEqual({
      kind: 'not_found',
      status: 404,
    });
  });

  it('simulates an unavailable service and a Company without follow-ups', async () => {
    expect(
      await error(setUp(DEMO_OWNER_ID, 'error').gateway.followUps(DEMO_COMPANY_ID)),
    ).toMatchObject({ kind: 'unavailable', status: 503 });
    TestBed.resetTestingModule();
    const empty = await firstValueFrom(
      setUp(DEMO_OWNER_ID, 'empty').gateway.followUps(DEMO_COMPANY_ID),
    );
    expect(empty.followUps).toEqual([]);
  });

  it('is read only: the gateway offers no payment operation of any kind', () => {
    const methods = Object.getOwnPropertyNames(MockBillingGateway.prototype).filter(
      (m) => m !== 'constructor',
    );
    expect(methods.sort()).toEqual(['fail', 'followUps']);
  });
});
