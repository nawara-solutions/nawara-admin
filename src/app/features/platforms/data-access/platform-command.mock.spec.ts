import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { runtimePlatformId } from '../../../demo/world/commands/platform.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_COMPANY_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
} from '../../company-overview/data-access/company-overview.mock';
import { MockOrganizationGateway } from '../../organizations/data-access/organization.mock';
import {
  MockPlatformCommercialGateway,
  MockPlatformDashboardGateway,
} from '../../platform-dashboard/data-access/platform-dashboard.mock';
import { MockPlatformDirectoryGateway } from './platform-directory.mock';
import {
  MockPlatformCommandGateway,
  PLATFORM_COMMANDS_DEMO_SCENARIO,
  PlatformCommandsDemoScenario,
} from './platform-command.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const NEW = runtimePlatformId(1);

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
      MockStepUpGateway,
      MockScopeDirectoryGateway,
      MockPlatformDirectoryGateway,
      MockCompanyOverviewGateway,
      MockCommercialSummaryGateway,
      MockPlatformDashboardGateway,
      MockPlatformCommercialGateway,
      MockOrganizationGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: identity, email: null, phone: null, adminTier: tier },
    businessIdentityId: identity,
  });
  const commands = TestBed.inject(MockPlatformCommandGateway);
  const grant = async () =>
    (
      await firstValueFrom(
        TestBed.inject(MockStepUpGateway).obtain('platform.create', {
          method: 'totp',
          code: '123456',
        }),
      )
    ).token;
  const create = async (name = 'Nawara Academy', key = 'key-1') =>
    firstValueFrom(
      commands.create(
        { companyId: DEMO_COMPANY_ID, name },
        { idempotencyKey: key, stepUpToken: await grant() },
      ),
    );
  return { commands, grant, create, world: TestBed.inject(DemoWorld) };
}

async function error(answer: Promise<unknown> | Observable<unknown>): Promise<AppError> {
  try {
    await (answer instanceof Observable ? firstValueFrom(answer) : answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockPlatformCommandGateway (demo world)', () => {
  it('creates the Platform through the world, once per grant, and replays a repeat', async () => {
    const { create, world } = setUp();
    const created = await create();
    expect(created).toEqual({
      platform: { id: NEW, name: 'Nawara Academy', key: null, product: null },
      replayed: false,
    });
    expect(world.snapshot().platforms).toHaveLength(3);
    expect(await create()).toEqual({ ...created, replayed: true });
    expect(world.snapshot().platforms).toHaveLength(3);
    expect(await error(create('Another name'))).toMatchObject({ code: 'idempotency_key_reused' });
  });

  it('requires a live grant for platform.create, used once', async () => {
    const { commands, grant, world } = setUp();
    const send = (token: string) =>
      firstValueFrom(
        commands.create(
          { companyId: DEMO_COMPANY_ID, name: 'X' },
          { idempotencyKey: 'k', stepUpToken: token },
        ),
      );
    expect(await error(send('made-up'))).toMatchObject({ status: 403, code: 'step_up_required' });
    const token = await grant();
    await send(token);
    expect(await error(send(token))).toMatchObject({ code: 'step_up_required' });
    expect(world.snapshot().platforms).toHaveLength(3);
  });

  it('applies nothing until subscribed', async () => {
    const { commands, grant, world } = setUp();
    commands.create(
      { companyId: DEMO_COMPANY_ID, name: 'X' },
      { idempotencyKey: 'k', stepUpToken: await grant() },
    );
    expect(world.snapshot().platforms).toHaveLength(2);
  });

  it('refuses an operator before anything is applied', async () => {
    const { create, world } = setUp(DEMO_OPERATOR_IDS.multi, 'operator');
    // Operators get no step-up (Core has none for them).
    expect((await error(create())).status).toBe(403);
    expect(world.snapshot().platforms).toHaveLength(2);
  });

  it('simulates Core’s documented 409 not_authoritative and an outage, applying nothing', async () => {
    const refused = setUp(DEMO_OWNER_ID, 'owner', 'notAuthoritative');
    expect(await error(refused.create())).toMatchObject({ status: 409, code: 'not_authoritative' });
    expect(refused.world.snapshot().platforms).toHaveLength(2);
    TestBed.resetTestingModule();
    const down = setUp(DEMO_OWNER_ID, 'owner', 'unavailable');
    expect((await error(down.create())).status).toBe(503);
    expect(down.world.snapshot().platforms).toHaveLength(2);
  });

  it('loses the first answer of an applied command, and a retry with the same key replays it', async () => {
    const { create, world } = setUp(DEMO_OWNER_ID, 'owner', 'outcomeUnknown');
    expect((await error(create())).kind).toBe('network');
    expect(world.snapshot().platforms).toHaveLength(3);
    expect(await create()).toMatchObject({ replayed: true, platform: { id: NEW } });
    expect(world.snapshot().platforms).toHaveLength(3);
  });
});

describe('a created Platform across the views (demo world)', () => {
  it('appears in the scope directory, the Platform directory and the Company Overview', async () => {
    const { create } = setUp();
    await create();
    const scope = await firstValueFrom(
      TestBed.inject(MockScopeDirectoryGateway).companyDirectory(DEMO_COMPANY_ID),
    );
    expect(scope.platforms.map((p) => p.name)).toEqual([
      'Nawara School',
      'Nawara Drive',
      'Nawara Academy',
    ]);
    const directory = await firstValueFrom(
      TestBed.inject(MockPlatformDirectoryGateway).list(DEMO_COMPANY_ID),
    );
    expect(directory.at(-1)).toEqual({
      platform: { id: NEW, name: 'Nawara Academy', key: null, product: null },
      organizations: { status: 'available', value: 0 },
      memberships: { status: 'available', value: 0 },
      operatorAssignments: { status: 'available', value: 0 },
    });
    const overview = await firstValueFrom(
      TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID),
    );
    expect(overview.summary.platforms).toEqual({ status: 'available', value: 3 });
    expect(overview.summary.organizations).toEqual({ status: 'available', value: 24 });
    expect(overview.platforms).toHaveLength(3);
    if (overview.activity.status !== 'available' || overview.growth.status !== 'available')
      throw new Error('expected sections');
    expect(overview.activity.data[0]).toMatchObject({
      action: 'platform.created',
      platformName: 'Nawara Academy',
    });
    expect(overview.growth.data.platforms.at(-1)?.points.every((p) => p.organizations === 0)).toBe(
      true,
    );
    // The commercial figures are unchanged: no financial record is created.
    const commercial = await firstValueFrom(
      TestBed.inject(MockCommercialSummaryGateway).load(DEMO_COMPANY_ID),
    );
    expect(commercial.activeLicenses).toEqual({ status: 'available', value: 20 });
  });

  it('opens as an empty Platform dashboard, with its creation in its activity', async () => {
    const { create } = setUp();
    await create();
    const dashboard = await firstValueFrom(TestBed.inject(MockPlatformDashboardGateway).load(NEW));
    if (dashboard.figures.status !== 'available' || dashboard.activity.status !== 'available')
      throw new Error('expected sections');
    expect(dashboard.figures.data.organizations).toEqual({ status: 'available', value: 0 });
    expect(dashboard.recentOrganizations).toEqual({ status: 'available', data: [] });
    expect(dashboard.activity.data.map((e) => e.action)).toEqual(['platform.created']);
    expect(
      (await firstValueFrom(TestBed.inject(MockOrganizationGateway).list(NEW))).organizations,
    ).toEqual([]);
    // No commercial record was invented for it.
    expect((await error(TestBed.inject(MockPlatformCommercialGateway).load(NEW))).status).toBe(404);
  });

  it('survives a sign-out (the world keeps it), and stays out of an operator’s reach', async () => {
    const { create, world } = setUp();
    await create();
    TestBed.inject(DemoAuthState).signedIn.set(null);
    expect(world.snapshot().platforms).toHaveLength(3);
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: {
        userId: DEMO_OPERATOR_IDS.multi,
        email: null,
        phone: null,
        adminTier: 'operator',
      },
      businessIdentityId: DEMO_OPERATOR_IDS.multi,
    });
    expect((await error(TestBed.inject(MockPlatformDashboardGateway).load(NEW))).status).toBe(404);
  });
});
