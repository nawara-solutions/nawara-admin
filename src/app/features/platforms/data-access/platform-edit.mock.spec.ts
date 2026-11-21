import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { platformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { activityOf, organizationsOf, platformRefOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { demoPaymentFollowUps } from '../../billing/data-access/billing.mock';
import { MockCompanyOverviewGateway } from '../../company-overview/data-access/company-overview.mock';
import {
  demoLicensesOverview,
  demoPlatformSubscriptions,
} from '../../licenses/data-access/licenses.mock';
import { MockPlatformDashboardGateway } from '../../platform-dashboard/data-access/platform-dashboard.mock';
import {
  MockPlatformCommandGateway,
  PLATFORM_COMMANDS_DEMO_SCENARIO,
  PlatformCommandsDemoScenario,
} from './platform-command.mock';
import { MockPlatformDirectoryGateway } from './platform-directory.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;

function setUp(
  identity: AdminIdentityId = DEMO_OWNER_ID,
  tier: 'owner' | 'operator' = 'owner',
  scenario: PlatformCommandsDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: PLATFORM_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      MockPlatformCommandGateway,
      MockScopeDirectoryGateway,
      MockPlatformDirectoryGateway,
      MockCompanyOverviewGateway,
      MockPlatformDashboardGateway,
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  auth.signedIn.set({
    identity: { userId: identity, email: null, phone: null, adminTier: tier },
    businessIdentityId: identity,
  });
  const commands = TestBed.inject(MockPlatformCommandGateway);
  const rename = (name: string, id = SCHOOL) => firstValueFrom(commands.update(id, { name }));
  return { commands, rename, auth, world: TestBed.inject(DemoWorld) };
}

async function error(answer: Promise<unknown> | Observable<unknown>): Promise<AppError> {
  try {
    await (answer instanceof Observable ? firstValueFrom(answer) : answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockPlatformCommandGateway.update (M4, demo world)', () => {
  it('renames the owner’s Platform through the world, trimmed, without any step-up', async () => {
    const { rename, world } = setUp();
    const stepUps = vi.spyOn(TestBed.inject(DemoAuthState), 'consumeStepUp');
    expect(await rename('  Nawara École  ')).toEqual({
      id: SCHOOL,
      companyId: DEMO_COMPANY_ID,
      name: 'Nawara École',
      key: 'nawara-school',
    });
    expect(platformRefOf(world.snapshot(), SCHOOL)?.name).toBe('Nawara École');
    expect(stepUps).not.toHaveBeenCalled();
  });

  it('answers the same name with 200 and writes nothing', async () => {
    const { rename, world } = setUp();
    const before = world.snapshot();
    expect(await rename('Nawara School')).toMatchObject({ name: 'Nawara School' });
    expect(world.snapshot()).toBe(before);
  });

  it('refuses an invalid body (400) and an unknown Platform (404), applying nothing', async () => {
    const { commands, rename, world } = setUp();
    const before = world.snapshot();
    expect(await error(rename('   '))).toMatchObject({
      status: 400,
      code: 'invalid_platform_request',
    });
    expect(await error(rename('x'.repeat(201)))).toMatchObject({ status: 400 });
    // Only `{ name }` is accepted: a widened body is refused (the gateway's type forbids it).
    const widened = { name: 'N', key: 'other' } as unknown as { name: string };
    expect(await error(commands.update(SCHOOL, widened))).toMatchObject({ status: 400 });
    expect(
      await error(rename('X', platformId('00000000-0000-4000-8000-000000000000'))),
    ).toMatchObject({ status: 404, code: 'not_found' });
    expect(world.snapshot()).toBe(before);
  });

  it('refuses an assigned operator (403 admin_forbidden): an assignment confers no configuration', async () => {
    const { rename, world } = setUp(DEMO_OPERATOR_IDS.school, 'operator');
    const before = world.snapshot();
    expect(await error(rename('Mine'))).toMatchObject({ status: 403, code: 'admin_forbidden' });
    expect(world.snapshot()).toBe(before);
  });

  it('refuses without a session (401)', async () => {
    const { rename, auth, world } = setUp();
    auth.signedIn.set(null);
    const before = world.snapshot();
    expect(await error(rename('X'))).toMatchObject({ status: 401 });
    expect(world.snapshot()).toBe(before);
  });

  it('simulates 409 not_authoritative and an outage (503), applying nothing', async () => {
    const refused = setUp(DEMO_OWNER_ID, 'owner', 'notAuthoritative');
    const before = refused.world.snapshot();
    expect(await error(refused.rename('X'))).toMatchObject({
      status: 409,
      code: 'not_authoritative',
    });
    expect(refused.world.snapshot()).toBe(before);
    TestBed.resetTestingModule();
    const down = setUp(DEMO_OWNER_ID, 'owner', 'unavailable');
    const untouched = down.world.snapshot();
    expect(await error(down.rename('X'))).toMatchObject({ status: 503 });
    expect(down.world.snapshot()).toBe(untouched);
  });

  it('loses the first answer of an applied rename: applied once, never twice', async () => {
    const { rename, world } = setUp(DEMO_OWNER_ID, 'owner', 'outcomeUnknown');
    expect((await error(rename('Nawara École'))).kind).toBe('network');
    const after = world.snapshot();
    expect(platformRefOf(after, SCHOOL)?.name).toBe('Nawara École');
    expect(after.activity.filter((e) => e.action === 'platform.updated')).toHaveLength(1);
    // A repeat of the same name after the lost answer is the same-name no-op: no second activity.
    expect(await rename('Nawara École')).toMatchObject({ name: 'Nawara École' });
    expect(world.snapshot()).toBe(after);
  });

  it('applies nothing until subscribed', () => {
    const { commands, world } = setUp();
    const before = world.snapshot();
    commands.update(SCHOOL, { name: 'Later' });
    expect(world.snapshot()).toBe(before);
  });
});

describe('a renamed Platform across the views (M4, demo world)', () => {
  it('shows the new name everywhere that reads the shared record, and changes nothing else', async () => {
    const { rename, world } = setUp();
    const before = world.snapshot();
    await rename('Nawara École');
    const after = world.snapshot();

    // The record: same id, Company, key and product; the other Platform untouched.
    expect(after.platforms.map((p) => p.id)).toEqual(before.platforms.map((p) => p.id));
    expect(platformRefOf(after, SCHOOL)).toEqual({
      id: SCHOOL,
      name: 'Nawara École',
      key: 'nawara-school',
      product: 'school',
    });
    expect(platformRefOf(after, DEMO_DRIVE_PLATFORM_ID)).toEqual(
      platformRefOf(before, DEMO_DRIVE_PLATFORM_ID),
    );
    // No Organization moved, no assignment changed.
    expect(organizationsOf(after, SCHOOL)).toEqual(organizationsOf(before, SCHOOL));
    expect(after.organizations).toBe(before.organizations);
    expect(after.assignments).toBe(before.assignments);

    // Scope directory: the switcher, the sidebar and the breadcrumbs (owner), and an assigned operator's names.
    const scope = TestBed.inject(MockScopeDirectoryGateway);
    const directory = await firstValueFrom(scope.companyDirectory(DEMO_COMPANY_ID));
    expect(directory.platforms.find((p) => p.id === SCHOOL)?.name).toBe('Nawara École');
    expect((await firstValueFrom(scope.assignedPlatforms([SCHOOL])))[0]?.name).toBe('Nawara École');

    // The Platform directory cards.
    const cards = await firstValueFrom(
      TestBed.inject(MockPlatformDirectoryGateway).list(DEMO_COMPANY_ID),
    );
    expect(cards.find((c) => c.platform.id === SCHOOL)?.platform.name).toBe('Nawara École');

    // The Company Overview: its Platform rows and the activity line of the rename.
    const overview = await firstValueFrom(
      TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID),
    );
    expect(overview.platforms.find((p) => p.platform.id === SCHOOL)?.platform.name).toBe(
      'Nawara École',
    );
    if (overview.activity.status !== 'available') throw new Error('expected activity');
    expect(overview.activity.data[0]).toMatchObject({
      action: 'platform.updated',
      platformName: 'Nawara École',
    });

    // The Platform dashboard's activity.
    const dashboard = await firstValueFrom(
      TestBed.inject(MockPlatformDashboardGateway).load(SCHOOL),
    );
    if (dashboard.activity.status !== 'available') throw new Error('expected activity');
    expect(dashboard.activity.data[0]).toMatchObject({ action: 'platform.updated' });
    expect(activityOf(after, SCHOOL)[0]?.action).toBe('platform.updated');

    // Billing follow-ups and Licenses label their rows from the same record.
    for (const row of demoPaymentFollowUps(after, NOW).followUps.filter(
      (r) => r.platform.id === SCHOOL,
    ))
      expect(row.platform.name).toBe('Nawara École');
    const licenses = demoLicensesOverview(after, NOW);
    expect(licenses.platforms.find((p) => p.platform.id === SCHOOL)?.platform.name).toBe(
      'Nawara École',
    );
    expect(demoPlatformSubscriptions(after, platformRefOf(after, SCHOOL)!, NOW).platform.name).toBe(
      'Nawara École',
    );

    // Subscription and financial facts are untouched.
    for (const table of [
      'subscriptions',
      'invoices',
      'paymentRequests',
      'payments',
      'refundCases',
      'paymentDisputes',
      'reconciliationCases',
      'platformCommercial',
    ] as const)
      expect(after[table], table).toBe(before[table]);
  });
});
