import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { normaliseOrganizationPatch } from '../../../demo/world/commands/organization.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { MockCompanyOverviewGateway } from '../../company-overview/data-access/company-overview.mock';
import { MockPlatformDashboardGateway } from '../../platform-dashboard/data-access/platform-dashboard.mock';
import { OrganizationPatch } from '../domain/edit-organization.model';
import {
  MockOrganizationCommandGateway,
  ORGANIZATION_COMMANDS_DEMO_SCENARIO,
  OrganizationCommandsDemoScenario,
} from './organization-command.mock';
import { MockOrganizationCommercialGateway, MockOrganizationGateway } from './organization.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const LATER = NOW + 60_000;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');

function setUp(
  identity: AdminIdentityId = DEMO_OWNER_ID,
  tier: 'owner' | 'operator' = 'owner',
  scenario: OrganizationCommandsDemoScenario = 'normal',
) {
  let now = NOW;
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => now },
      { provide: ORGANIZATION_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      MockOrganizationCommandGateway,
      MockOrganizationGateway,
      MockOrganizationCommercialGateway,
      MockPlatformDashboardGateway,
      MockCompanyOverviewGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: identity, email: null, phone: null, adminTier: tier },
    businessIdentityId: identity,
  });
  const world = TestBed.inject(DemoWorld);
  now = LATER;
  const commands = TestBed.inject(MockOrganizationCommandGateway);
  const update = (patch: unknown, id = HORIZON) =>
    firstValueFrom(commands.update(id, patch as OrganizationPatch));
  const record = (id = HORIZON) => world.snapshot().organizations.find((o) => o.id === id)!;
  return { world, update, record };
}

async function error(answer: Promise<unknown> | Observable<unknown>): Promise<AppError> {
  try {
    await (answer instanceof Observable ? firstValueFrom(answer) : answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('normaliseOrganizationPatch (the verified PATCH rules)', () => {
  const refused = (body: unknown) =>
    (normaliseOrganizationPatch(body) as AppError).kind === 'validation';

  it('keeps only the supplied fields, trimmed; null clears an optional field', () => {
    expect(normaliseOrganizationPatch({ name: ' École ', phone: null })).toEqual({
      name: 'École',
      phone: null,
    });
  });

  it('refuses an empty patch, immutable or unknown fields, a cleared or blank name and empty strings', () => {
    expect(refused({})).toBe(true);
    for (const field of ['id', 'platformId', 'createdAt', 'updatedAt', 'status'])
      expect(refused({ name: 'X', [field]: 'x' })).toBe(true);
    expect(refused({ name: null })).toBe(true);
    expect(refused({ name: '  ' })).toBe(true);
    expect(refused({ type: '' })).toBe(true);
    expect(refused({ name: 'x'.repeat(201) })).toBe(true);
    expect(refused({ phone: 'x'.repeat(33) })).toBe(true);
    expect(refused({ address: 'x'.repeat(500) })).toBe(false);
    expect(refused(null)).toBe(true);
  });
});

describe('MockOrganizationCommandGateway.update (demo world)', () => {
  it('updates only the supplied fields, sets updatedAt and records one simulated activity', async () => {
    const { world, update, record } = setUp();
    const before = world.snapshot();
    const horizon = record();
    const answer = await update({ name: 'École Horizon – Annexe', type: 'School' });
    expect(answer).toEqual({
      id: HORIZON,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
      name: 'École Horizon – Annexe',
      taxCode: null,
      address: null,
      phone: null,
      type: 'School',
      createdAt: horizon.createdAt,
      updatedAt: new Date(LATER).toISOString(),
    });
    const after = world.snapshot();
    // The parent, the id, counts, the assisted-payments override and every other record are untouched.
    expect(record()).toEqual({
      ...horizon,
      name: 'École Horizon – Annexe',
      type: 'School',
      updatedAt: new Date(LATER).toISOString(),
    });
    expect(after.organizations.filter((o) => o.id !== HORIZON)).toEqual(
      before.organizations.filter((o) => o.id !== HORIZON),
    );
    expect(after.subscriptions).toEqual(before.subscriptions);
    expect(after.paymentIssues).toEqual(before.paymentIssues);
    expect(after.adminInvitations).toEqual(before.adminInvitations);
    expect(after.platformCommercial).toEqual(before.platformCommercial);
    expect(after.idempotency).toEqual(before.idempotency);
    expect(after.activity.slice(before.activity.length)).toEqual([
      {
        id: 'organization-activity-updated-1',
        platformId: DEMO_SCHOOL_PLATFORM_ID,
        organizationId: HORIZON,
        action: 'organization.updated',
        occurredAt: new Date(LATER).toISOString(),
      },
    ]);
  });

  it('clears an optional field with null, and sets it again', async () => {
    const { update, record } = setUp();
    await update({ phone: '+213 21 00 00' });
    expect(record().phone).toBe('+213 21 00 00');
    await update({ phone: null });
    expect(record().phone).toBeNull();
  });

  it('writes nothing for a patch equal to the current values, and still answers the representation', async () => {
    const { world, update, record } = setUp();
    const before = world.snapshot();
    const answer = await update({ name: record().name, phone: null });
    expect(world.snapshot()).toBe(before);
    expect(answer.updatedAt).toBe(record().createdAt);
  });

  it('lets an assigned operator edit their Platform’s Organizations only', async () => {
    const { update, record } = setUp(DEMO_OPERATOR_IDS.school, 'operator');
    await update({ type: 'School' });
    expect(record().type).toBe('School');
    expect(await error(update({ type: 'Driving school' }, ANDALOUS))).toMatchObject({
      status: 403,
      code: 'admin_forbidden',
    });
    expect(record(ANDALOUS).type).toBeNull();
  });

  it('refuses an unassigned operator, an unknown Organization and a missing session, changing nothing', async () => {
    const unassigned = setUp(DEMO_OPERATOR_IDS.unassigned, 'operator');
    const before = unassigned.world.snapshot();
    expect((await error(unassigned.update({ type: 'X' }))).status).toBe(403);
    expect(
      await error(
        unassigned.update({ type: 'X' }, organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3cff')),
      ),
    ).toMatchObject({ status: 404, code: 'not_found' });
    TestBed.inject(DemoAuthState).signedIn.set(null);
    expect((await error(unassigned.update({ type: 'X' }))).status).toBe(401);
    expect(unassigned.world.snapshot()).toBe(before);
  });

  it('refuses an invalid patch before looking anything up', async () => {
    const { world, update } = setUp();
    const before = world.snapshot();
    expect(await error(update({ platformId: DEMO_COMPANY_ID }))).toMatchObject({ status: 400 });
    expect(await error(update({}))).toMatchObject({ status: 400 });
    expect(world.snapshot()).toBe(before);
  });

  it('simulates 409 not_authoritative and an outage without applying anything', async () => {
    const refused = setUp(DEMO_OWNER_ID, 'owner', 'notAuthoritative');
    expect(await error(refused.update({ type: 'X' }))).toMatchObject({
      status: 409,
      code: 'not_authoritative',
    });
    expect(refused.record().type).toBeNull();
    TestBed.resetTestingModule();
    const down = setUp(DEMO_OWNER_ID, 'owner', 'unavailable');
    expect((await error(down.update({ type: 'X' }))).status).toBe(503);
    expect(down.record().type).toBeNull();
  });

  it('loses the first answer of an applied edit; nothing replays it, and a re-read shows it applied', async () => {
    const { update, record } = setUp(DEMO_OWNER_ID, 'owner', 'outcomeUnknown');
    expect((await error(update({ type: 'School' }))).kind).toBe('network');
    expect(record().type).toBe('School');
    const detail = await firstValueFrom(TestBed.inject(MockOrganizationGateway).load(HORIZON));
    expect(detail.metadata.type).toBe('School');
  });
});

describe('an edited Organization across the views (demo world)', () => {
  it('shows its new name in the directory, detail, dashboard and Company Overview activity', async () => {
    const { update } = setUp();
    await update({ name: 'École Horizon – Annexe', taxCode: 'TX-1' });
    const organizations = TestBed.inject(MockOrganizationGateway);
    const directory = await firstValueFrom(organizations.list(DEMO_SCHOOL_PLATFORM_ID));
    expect(directory.organizations.find((o) => o.id === HORIZON)?.name).toBe(
      'École Horizon – Annexe',
    );
    const detail = await firstValueFrom(organizations.load(HORIZON));
    expect(detail.name).toBe('École Horizon – Annexe');
    expect(detail.metadata.taxCode).toBe('TX-1');
    expect(detail.memberships).toEqual({ status: 'available', value: 64 });
    if (detail.activity.status !== 'available') throw new Error('expected activity');
    expect(detail.activity.data[0]).toMatchObject({ action: 'organization.updated' });
    const commercial = await firstValueFrom(
      TestBed.inject(MockOrganizationCommercialGateway).load(HORIZON),
    );
    expect(commercial.subscription).toMatchObject({
      status: 'available',
      data: { state: 'active' },
    });
    const dashboard = await firstValueFrom(
      TestBed.inject(MockPlatformDashboardGateway).load(DEMO_SCHOOL_PLATFORM_ID),
    );
    if (
      dashboard.recentOrganizations.status !== 'available' ||
      dashboard.activity.status !== 'available'
    )
      throw new Error('expected sections');
    expect(dashboard.recentOrganizations.data.find((o) => o.id === HORIZON)?.name).toBe(
      'École Horizon – Annexe',
    );
    expect(dashboard.activity.data[0]).toMatchObject({ action: 'organization.updated' });
    const overview = await firstValueFrom(
      TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID),
    );
    if (overview.activity.status !== 'available') throw new Error('expected activity');
    expect(overview.activity.data[0]).toMatchObject({
      action: 'organization.updated',
      organizationName: 'École Horizon – Annexe',
    });
    expect(overview.summary.organizations).toEqual({ status: 'available', value: 24 });
  });
});
