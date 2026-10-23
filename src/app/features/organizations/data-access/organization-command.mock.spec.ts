import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { PlatformId, platformId } from '../../../core/context/scope.model';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  normaliseOrganizationRequest,
  runtimeOrganizationId,
} from '../../../demo/world/commands/organization.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { activeMembershipCount, pendingRequestCount } from '../../../demo/world/selectors';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
} from '../../company-overview/data-access/company-overview.mock';
import {
  MockPlatformCommercialGateway,
  MockPlatformDashboardGateway,
} from '../../platform-dashboard/data-access/platform-dashboard.mock';
import { MockPlatformDirectoryGateway } from '../../platforms/data-access/platform-directory.mock';
import { CreateOrganizationRequest } from '../domain/create-organization.model';
import {
  MOCK_ORGANIZATION_COMMAND_PROVIDERS,
  MockOrganizationCommandGateway,
  ORGANIZATION_COMMANDS_DEMO_SCENARIO,
  OrganizationCommandsDemoScenario,
} from './organization-command.mock';
import { OrganizationCommandGateway } from './organization-command.gateway';
import { MockOrganizationCommercialGateway, MockOrganizationGateway } from './organization.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const NEW = runtimeOrganizationId(1);
const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const DRIVE = DEMO_DRIVE_PLATFORM_ID;

const request = (change: Partial<CreateOrganizationRequest> = {}): CreateOrganizationRequest => ({
  platformId: SCHOOL,
  name: 'École Al Fajr',
  taxCode: null,
  address: null,
  phone: null,
  type: null,
  ...change,
});

function setUp(
  identity: AdminIdentityId = DEMO_OWNER_ID,
  tier: 'owner' | 'operator' = 'owner',
  scenario: OrganizationCommandsDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ORGANIZATION_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      MockOrganizationCommandGateway,
      MockStepUpGateway,
      MockOrganizationGateway,
      MockOrganizationCommercialGateway,
      MockPlatformDirectoryGateway,
      MockPlatformDashboardGateway,
      MockPlatformCommercialGateway,
      MockCompanyOverviewGateway,
      MockCommercialSummaryGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: identity, email: null, phone: null, adminTier: tier },
    businessIdentityId: identity,
  });
  const commands = TestBed.inject(MockOrganizationCommandGateway);
  const grant = async (purpose: StepUpPurpose = 'organization.create') =>
    (
      await firstValueFrom(
        TestBed.inject(MockStepUpGateway).obtain(purpose, { method: 'totp', code: '123456' }),
      )
    ).token;
  const create = async (body = request(), key = 'key-0001') =>
    firstValueFrom(commands.create(body, { idempotencyKey: key, stepUpToken: await grant() }));
  const send = (body: unknown, key: string, token: string) =>
    firstValueFrom(
      commands.create(body as CreateOrganizationRequest, {
        idempotencyKey: key,
        stepUpToken: token,
      }),
    );
  const world = TestBed.inject(DemoWorld);
  const count = (platform: PlatformId = SCHOOL) =>
    world.snapshot().organizations.filter((o) => o.platformId === platform).length;
  return { commands, grant, create, send, world, count };
}

async function error(answer: Promise<unknown> | Observable<unknown>): Promise<AppError> {
  try {
    await (answer instanceof Observable ? firstValueFrom(answer) : answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('normaliseOrganizationRequest (Core’s organization-input rules)', () => {
  const base = { platformId: SCHOOL, name: 'École' };

  it('trims, keeps the optional fields, and makes an absent one null', () => {
    expect(
      normaliseOrganizationRequest({ ...base, name: '  École  ', taxCode: ' 12-AB ', phone: null }),
    ).toEqual({
      platformId: SCHOOL,
      name: 'École',
      taxCode: '12-AB',
      address: null,
      phone: null,
      type: null,
    });
  });

  it('refuses a blank or too-long value, an empty optional string, unknown fields and a bad Platform id', () => {
    const refused = (body: unknown) =>
      (normaliseOrganizationRequest(body) as AppError).kind === 'validation';
    expect(refused({ ...base, name: '   ' })).toBe(true);
    expect(refused({ ...base, name: 'x'.repeat(201) })).toBe(true);
    expect(refused({ ...base, name: ` ${'x'.repeat(200)} ` })).toBe(false);
    expect(refused({ ...base, taxCode: '' })).toBe(true);
    expect(refused({ ...base, taxCode: 'x'.repeat(65) })).toBe(true);
    expect(refused({ ...base, address: 'x'.repeat(501) })).toBe(true);
    expect(refused({ ...base, phone: 'x'.repeat(33) })).toBe(true);
    expect(refused({ ...base, type: 'x'.repeat(65) })).toBe(true);
    expect(refused({ ...base, type: 'x'.repeat(64) })).toBe(false);
    expect(refused({ ...base, status: 'active' })).toBe(true);
    expect(refused({ ...base, platformId: 'school' })).toBe(true);
    expect(refused({ name: 'École' })).toBe(true);
    expect(refused(null)).toBe(true);
  });
});

describe('MockOrganizationCommandGateway (demo world)', () => {
  it('binds the mock as the gateway in demo builds', () => {
    TestBed.configureTestingModule({ providers: [...MOCK_ORGANIZATION_COMMAND_PROVIDERS] });
    expect(TestBed.inject(OrganizationCommandGateway).available).toBe(true);
  });

  it('creates exactly one Organization in the selected Platform, with its metadata, and replays a repeat', async () => {
    const { create, world, count } = setUp();
    const drive = count(DRIVE);
    const body = request({
      taxCode: 'TX-001',
      address: '12 Rue des Écoles',
      phone: '+213 21 00 00',
      type: 'School',
    });
    const created = await create(body);
    expect(created).toEqual({
      organization: {
        id: NEW,
        platformId: SCHOOL,
        name: 'École Al Fajr',
        taxCode: 'TX-001',
        address: '12 Rue des Écoles',
        phone: '+213 21 00 00',
        type: 'School',
        createdAt: new Date(NOW).toISOString(),
        updatedAt: new Date(NOW).toISOString(),
      },
      replayed: false,
    });
    expect(count()).toBe(17);
    expect(count(DRIVE)).toBe(drive);
    const record = world.snapshot().organizations.find((o) => o.id === NEW);
    expect(record).toMatchObject({ assistedPayments: 'inherit' });
    // Its figures are derived from membership records: it has none yet.
    expect(activeMembershipCount(world.snapshot(), NEW)).toBe(0);
    expect(pendingRequestCount(world.snapshot(), NEW)).toBe(0);
    expect(world.snapshot().memberships.some((m) => m.organizationId === NEW)).toBe(false);
    // Same key, same request (with a fresh step-up): the same Organization, never a second one.
    expect(await create(body)).toEqual({ ...created, replayed: true });
    expect(count()).toBe(17);
    // Same key, another request: Core's 422, nothing created.
    expect(await error(create(request({ name: 'Autre' })))).toMatchObject({
      status: 422,
      code: 'idempotency_key_reused',
    });
    expect(count()).toBe(17);
  });

  it('creates no subscription, payment, invitation or membership, and records one simulated activity', async () => {
    const { create, world } = setUp();
    const before = world.snapshot();
    await create();
    const after = world.snapshot();
    expect(after.subscriptions).toEqual(before.subscriptions);
    expect(after.paymentIssues).toEqual(before.paymentIssues);
    expect(after.adminInvitations).toEqual(before.adminInvitations);
    expect(after.platformCommercial).toEqual(before.platformCommercial);
    // Memberships are counts on the Organization records: the seed's are untouched, the new one starts at 0.
    expect(after.organizations.slice(0, before.organizations.length)).toEqual(before.organizations);
    expect(after.activity.slice(before.activity.length)).toEqual([
      {
        id: 'organization-activity-created-1',
        platformId: SCHOOL,
        organizationId: NEW,
        action: 'organization.created',
        occurredAt: new Date(NOW).toISOString(),
      },
    ]);
  });

  it('checks in Core’s order: key, request, Platform, authority, then the step-up', async () => {
    const { send, grant, count } = setUp();
    const token = await grant();
    expect(await error(send(request(), 'short', token))).toMatchObject({ status: 400 });
    expect(await error(send(request(), 'bad key!', token))).toMatchObject({ status: 400 });
    expect(await error(send({ ...request(), name: '' }, 'key-0001', token))).toMatchObject({
      kind: 'validation',
      status: 400,
    });
    const unknown = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3bff');
    expect(await error(send(request({ platformId: unknown }), 'key-0001', token))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    // None of these refusals spent the grant (Core checks the step-up after them).
    expect(await send(request(), 'key-0001', token)).toMatchObject({ replayed: false });
    expect(count()).toBe(17);
  });

  it('requires a live grant for organization.create, used once; a platform.create grant is refused', async () => {
    const { send, grant, count } = setUp();
    expect(await error(send(request(), 'key-0001', 'made-up'))).toMatchObject({
      status: 403,
      code: 'step_up_required',
    });
    expect(await error(send(request(), 'key-0001', await grant('platform.create')))).toMatchObject({
      code: 'step_up_required',
    });
    const token = await grant();
    await send(request(), 'key-0001', token);
    expect(await error(send(request(), 'key-0002', token))).toMatchObject({
      code: 'step_up_required',
    });
    expect(count()).toBe(17);
  });

  it('a failed creation does not consume the key', async () => {
    const { send, grant, count } = setUp();
    // Refused inside the command (Platform unknown): nothing recorded, so the key starts a new operation afterwards.
    const unknown = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3bff');
    expect(
      (await error(send(request({ platformId: unknown }), 'key-0001', await grant()))).status,
    ).toBe(404);
    expect(await send(request({ name: 'Autre école' }), 'key-0001', await grant())).toMatchObject({
      replayed: false,
      organization: { name: 'Autre école' },
    });
    expect(count()).toBe(17);
  });

  it('an outage applies nothing', async () => {
    const { create, count } = setUp(DEMO_OWNER_ID, 'owner', 'unavailable');
    expect((await error(create())).status).toBe(503);
    expect(count()).toBe(16);
  });

  it('simulates Core’s documented 409 not_authoritative, after spending the step-up, applying nothing', async () => {
    const { create, count } = setUp(DEMO_OWNER_ID, 'owner', 'notAuthoritative');
    expect(await error(create())).toMatchObject({ status: 409, code: 'not_authoritative' });
    expect(count()).toBe(16);
  });

  it('loses the first answer of an applied command; a retry with the same key and a fresh step-up replays it', async () => {
    const { create, count } = setUp(DEMO_OWNER_ID, 'owner', 'outcomeUnknown');
    expect((await error(create())).kind).toBe('network');
    expect(count()).toBe(17);
    expect(await create()).toMatchObject({ replayed: true, organization: { id: NEW } });
    expect(count()).toBe(17);
  });

  it('refuses an operator at the step-up (Core has none for operators), and a Platform not theirs as Core does', async () => {
    const assigned = setUp(DEMO_OPERATOR_IDS.school, 'operator');
    expect(await error(assigned.send(request(), 'key-0001', 'no-grant'))).toMatchObject({
      status: 403,
      code: 'step_up_required',
    });
    expect(
      await error(assigned.send(request({ platformId: DRIVE }), 'key-0001', 'no-grant')),
    ).toMatchObject({
      status: 403,
      code: 'admin_forbidden',
    });
    expect(assigned.count()).toBe(16);
  });

  it('answers 401 without a session, and keys replays by caller', async () => {
    const { create, send, grant } = setUp();
    const token = await grant();
    TestBed.inject(DemoAuthState).signedIn.set(null);
    expect(await error(send(request(), 'key-0001', token))).toMatchObject({ status: 401 });
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: DEMO_OWNER_ID, email: null, phone: null, adminTier: 'owner' },
      businessIdentityId: DEMO_OWNER_ID,
    });
    expect(await create()).toMatchObject({ replayed: false });
  });

  it('applies nothing until subscribed', async () => {
    const { commands, grant, count } = setUp();
    commands.create(request(), { idempotencyKey: 'key-0001', stepUpToken: await grant() });
    expect(count()).toBe(16);
  });
});

describe('a created Organization across the views (demo world)', () => {
  it('appears in its Platform’s directory and detail, with its metadata, and nowhere else', async () => {
    const { create } = setUp();
    await create(request({ type: 'School', phone: '+213 21 00 00' }));
    const organizations = TestBed.inject(MockOrganizationGateway);
    const directory = await firstValueFrom(organizations.list(SCHOOL));
    expect(directory.organizations).toHaveLength(17);
    expect(directory.organizations[0]).toEqual({
      id: NEW,
      platformId: SCHOOL,
      name: 'École Al Fajr',
      createdAt: new Date(NOW).toISOString(),
      memberships: { status: 'available', value: 0 },
      pendingRequests: { status: 'available', value: 0 },
    });
    expect(
      (await firstValueFrom(organizations.list(DRIVE))).organizations.some((o) => o.id === NEW),
    ).toBe(false);
    const detail = await firstValueFrom(organizations.load(NEW));
    expect(detail.metadata).toEqual({
      taxCode: null,
      address: null,
      phone: '+213 21 00 00',
      type: 'School',
    });
    expect(detail.adminInvitationsAwaiting).toEqual({
      status: 'available',
      data: { status: 'available', value: 0 },
    });
    expect(detail.activity).toMatchObject({
      status: 'available',
      data: [{ action: 'organization.created' }],
    });
    const commercial = await firstValueFrom(
      TestBed.inject(MockOrganizationCommercialGateway).list(SCHOOL),
    );
    expect(commercial.organizations.find((c) => c.organizationId === NEW)).toMatchObject({
      subscription: { state: 'none' },
      assistedPayments: { organization: 'inherit' },
    });
  });

  it('counts in the Platform dashboard, the Platform directory and the Company Overview', async () => {
    const before = setUp();
    const overviewBefore = await firstValueFrom(
      TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID),
    );
    const licensesBefore = (
      await firstValueFrom(TestBed.inject(MockCommercialSummaryGateway).load(DEMO_COMPANY_ID))
    ).activeLicenses;
    await before.create();

    const dashboard = await firstValueFrom(
      TestBed.inject(MockPlatformDashboardGateway).load(SCHOOL),
    );
    if (
      dashboard.figures.status !== 'available' ||
      dashboard.recentOrganizations.status !== 'available'
    )
      throw new Error('expected sections');
    expect(dashboard.figures.data.organizations).toEqual({ status: 'available', value: 17 });
    expect(dashboard.recentOrganizations.data[0]).toMatchObject({ id: NEW, name: 'École Al Fajr' });

    const directory = await firstValueFrom(
      TestBed.inject(MockPlatformDirectoryGateway).list(DEMO_COMPANY_ID),
    );
    expect(directory.find((e) => e.platform.id === SCHOOL)?.organizations).toEqual({
      status: 'available',
      value: 17,
    });

    const overview = await firstValueFrom(
      TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID),
    );
    expect(overview.summary.organizations).toEqual({ status: 'available', value: 25 });
    expect(overviewBefore.summary.organizations).toEqual({ status: 'available', value: 24 });
    if (overview.growth.status !== 'available' || overviewBefore.growth.status !== 'available')
      throw new Error('expected growth');
    const today = (g: typeof overview.growth) =>
      g.status === 'available' ? g.data.points.at(-1)?.organizations : undefined;
    expect(today(overview.growth)).toBe((today(overviewBefore.growth) ?? 0) + 1);
    // No financial record is created.
    const licenses = (
      await firstValueFrom(TestBed.inject(MockCommercialSummaryGateway).load(DEMO_COMPANY_ID))
    ).activeLicenses;
    expect(licenses).toEqual(licensesBefore);
  });
});
