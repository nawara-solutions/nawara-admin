import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DEMO_OWNER_ACCOUNT } from '../../../core/auth/auth.fixtures';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId, organizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { normaliseInvitationCreate } from '../../../demo/world/commands/admin-invitation.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_OWNER_USER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { activeAdminInvitationsOf, invitationStatusOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { MockCompanyOverviewGateway } from '../../company-overview/data-access/company-overview.mock';
import { MockPlatformDashboardGateway } from '../../platform-dashboard/data-access/platform-dashboard.mock';
import { CreateAdminInvitationRequest } from '../domain/admin-invitation.model';
import {
  ADMIN_INVITATIONS_DEMO_SCENARIO,
  AdminInvitationsDemoScenario,
  INVITATION_MANAGE_LIMIT,
  MockAdminInvitationGateway,
  generateDemoInvitationCode,
} from './admin-invitation.mock';
import { MockOrganizationGateway } from './organization.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');
const CODE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

function setUp(
  {
    userId = DEMO_OWNER_USER_ID,
    actor = DEMO_OWNER_ID as AdminIdentityId | null,
    tier = 'owner' as 'owner' | 'operator',
  } = {},
  scenario: AdminInvitationsDemoScenario = 'normal',
) {
  let now = NOW;
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => now },
      { provide: ADMIN_INVITATIONS_DEMO_SCENARIO, useValue: scenario },
      MockAdminInvitationGateway,
      MockStepUpGateway,
      MockOrganizationGateway,
      MockPlatformDashboardGateway,
      MockCompanyOverviewGateway,
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  auth.signedIn.set({
    identity: { userId, email: null, phone: null, adminTier: tier },
    businessIdentityId: actor,
  });
  const gateway = TestBed.inject(MockAdminInvitationGateway);
  const world = TestBed.inject(DemoWorld);
  const grant = async (purpose: StepUpPurpose) =>
    (
      await firstValueFrom(
        TestBed.inject(MockStepUpGateway).obtain(purpose, { method: 'totp', code: '123456' }),
      )
    ).token;
  const create = async (
    body: unknown = { invitationType: 'org_admin' },
    organization: OrganizationId = HORIZON,
    token?: string,
  ) =>
    firstValueFrom(
      gateway.create(organization, body as CreateAdminInvitationRequest, {
        stepUpToken: token ?? (await grant('admin_invitation.create')),
      }),
    );
  const revoke = async (id: string, organization: OrganizationId = HORIZON, token?: string) =>
    firstValueFrom(
      gateway.revoke(organization, id, {
        stepUpToken: token ?? (await grant('admin_invitation.revoke')),
      }),
    );
  const list = (organization: OrganizationId = HORIZON) =>
    firstValueFrom(gateway.list(organization));
  const advance = (ms: number) => (now += ms);
  return { auth, gateway, world, grant, create, revoke, list, advance, now: () => now };
}

async function error(answer: Promise<unknown> | Observable<unknown>): Promise<AppError> {
  try {
    await (answer instanceof Observable ? firstValueFrom(answer) : answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('the seed’s invitations', () => {
  it('keeps 7 active invitations, with every other status at École Horizon, and the owner’s real user id', () => {
    const { world } = setUp();
    const tables = world.snapshot();
    expect(activeAdminInvitationsOf(world.snapshot(), tables.organizations, NOW)).toHaveLength(7);
    const horizon = tables.adminInvitations.filter((i) => i.organizationId === HORIZON);
    expect(horizon.map((i) => invitationStatusOf(i, NOW)).sort()).toEqual([
      'active',
      'active',
      'consumed',
      'expired',
      'revoked',
    ]);
    expect(DEMO_OWNER_USER_ID).toBe(DEMO_OWNER_ACCOUNT.identity.userId);
    // No code and no contact is ever kept.
    const serialized = JSON.stringify(tables.adminInvitations);
    expect(serialized).not.toMatch(/code|contact"|@/i);
  });

  it('derives status in Core’s precedence: consumed, revoked, expired, active', () => {
    const base = {
      id: 'x',
      organizationId: HORIZON,
      invitationType: 'org_admin',
      contactBound: false,
      createdAt: '2026-10-20T00:00:00.000Z',
      createdBy: 'u',
      revokedBy: null,
    };
    const past = '2026-10-21T00:00:00.000Z';
    const future = '2026-10-30T00:00:00.000Z';
    expect(
      invitationStatusOf({ ...base, expiresAt: past, consumedAt: past, revokedAt: past }, NOW),
    ).toBe('consumed');
    expect(
      invitationStatusOf({ ...base, expiresAt: past, consumedAt: null, revokedAt: past }, NOW),
    ).toBe('revoked');
    expect(
      invitationStatusOf({ ...base, expiresAt: past, consumedAt: null, revokedAt: null }, NOW),
    ).toBe('expired');
    expect(
      invitationStatusOf({ ...base, expiresAt: future, consumedAt: null, revokedAt: null }, NOW),
    ).toBe('active');
  });
});

describe('normaliseInvitationCreate (Core’s DTO and service rules)', () => {
  const refused = (body: unknown) =>
    (normaliseInvitationCreate(body) as AppError).kind === 'validation';

  it('accepts a valid type, the default duration and a contact, keeping only whether one was given', () => {
    expect(normaliseInvitationCreate({ invitationType: 'org_admin' })).toEqual({
      invitationType: 'org_admin',
      minutes: 1440,
      contactBound: false,
    });
    expect(
      normaliseInvitationCreate({
        invitationType: 'm',
        expiresInMinutes: 60,
        inviteeContact: ' A@B.Example ',
      }),
    ).toEqual({ invitationType: 'm', minutes: 60, contactBound: true });
    expect(
      normaliseInvitationCreate({ invitationType: 'm', inviteeContact: '+213 (550) 00-00-00' }),
    ).toMatchObject({
      contactBound: true,
    });
    // An empty contact is no binding, as in Core.
    expect(normaliseInvitationCreate({ invitationType: 'm', inviteeContact: '' })).toMatchObject({
      contactBound: false,
    });
  });

  it('refuses the reserved type, bad patterns, unknown fields, non-integer or out-of-range durations and bad phones', () => {
    for (const type of ['admin', 'Admin', '1abc', '', 'a'.repeat(33), 'org admin', 'org.admin'])
      expect(refused({ invitationType: type })).toBe(true);
    expect(refused({ invitationType: 'a'.repeat(32) })).toBe(false);
    expect(refused({ invitationType: 'admins' })).toBe(false);
    expect(refused({ invitationType: 'x', expiresAt: '2026-11-01T00:00:00Z' })).toBe(true);
    expect(refused({ invitationType: 'x', expiresInMinutes: '60' })).toBe(true);
    expect(refused({ invitationType: 'x', expiresInMinutes: 60.5 })).toBe(true);
    expect(refused({ invitationType: 'x', expiresInMinutes: 14 })).toBe(true);
    expect(refused({ invitationType: 'x', expiresInMinutes: 10_081 })).toBe(true);
    expect(refused({ invitationType: 'x', expiresInMinutes: 10_080 })).toBe(false);
    expect(refused({ invitationType: 'x', inviteeContact: '12345' })).toBe(true);
    expect(refused({ invitationType: 'x', inviteeContact: 'x'.repeat(255) })).toBe(true);
  });
});

describe('MockAdminInvitationGateway (demo world)', () => {
  it('creates one active invitation and answers the code once, in Core’s format; the list never shows it', async () => {
    const { world, create, list } = setUp();
    const before = (await list()).invitations.length;
    const created = await create({
      invitationType: 'org_admin',
      expiresInMinutes: 60,
      inviteeContact: 'amina@example.invalid',
    });
    expect(created).toMatchObject({ invitationType: 'org_admin', contactBound: true });
    expect(created.code).toMatch(CODE);
    expect(Date.parse(created.expiresAt) - Date.parse(created.createdAt)).toBe(60 * 60_000);
    const listed = await list();
    expect(listed.invitations).toHaveLength(before + 1);
    expect(listed.invitations[0]).toMatchObject({
      id: created.id,
      status: 'active',
      createdBy: DEMO_OWNER_USER_ID,
      contactBound: true,
    });
    // The code and the contact exist nowhere but in the one answer.
    for (const text of [JSON.stringify(listed), JSON.stringify(world.snapshot())]) {
      expect(text).not.toContain(created.code);
      expect(text).not.toContain('amina');
    }
    expect(world.snapshot().activity.at(-1)).toMatchObject({
      action: 'admin_invitation.created',
      organizationId: HORIZON,
    });
  });

  it('generates unbiased, well-formed, distinct codes', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateDemoInvitationCode()));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(CODE);
  });

  it('requires a live grant for exactly the purpose, by a factor the purpose allows, spent only on commit', async () => {
    const { auth, create, grant, list, now } = setUp();
    const count = async () => (await list()).invitations.length;
    const start = await count();
    expect(await error(create(undefined, HORIZON, 'made-up'))).toMatchObject({
      status: 403,
      code: 'step_up_required',
    });
    expect(
      await error(create(undefined, HORIZON, await grant('admin_invitation.revoke'))),
    ).toMatchObject({ code: 'step_up_required' });
    expect(
      await error(create(undefined, HORIZON, await grant('organization.create'))),
    ).toMatchObject({ code: 'step_up_required' });
    // A secret-key grant never satisfies a factor-only purpose.
    const secretKey = auth.issueStepUp(
      'admin_invitation.create',
      DEMO_OWNER_USER_ID,
      now() + 60_000,
      'secret_key',
    );
    expect(await error(create(undefined, HORIZON, secretKey))).toMatchObject({
      code: 'step_up_required',
    });
    expect(await count()).toBe(start);
    // A refusal before the commit (a bad body) leaves the grant usable; the commit spends it.
    const token = await grant('admin_invitation.create');
    expect((await error(create({ invitationType: 'admin' }, HORIZON, token))).status).toBe(400);
    await create(undefined, HORIZON, token);
    expect(await error(create(undefined, HORIZON, token))).toMatchObject({
      code: 'step_up_required',
    });
    expect(await count()).toBe(start + 1);
  });

  it('expires a grant after its lifetime', async () => {
    const { create, grant, advance } = setUp();
    const token = await grant('admin_invitation.create');
    advance(5 * 60_000 + 1);
    expect(await error(create(undefined, HORIZON, token))).toMatchObject({
      code: 'step_up_required',
    });
  });

  it('rolls the step-up back on a code collision: nothing created, the grant still valid', async () => {
    const { world, auth, create, grant, now } = setUp(undefined, 'collision');
    const before = world.snapshot();
    const token = await grant('admin_invitation.create');
    expect(await error(create(undefined, HORIZON, token))).toMatchObject({
      status: 409,
      code: 'conflict',
    });
    expect(world.snapshot()).toBe(before);
    expect(auth.checkStepUp(token, 'admin_invitation.create', DEMO_OWNER_USER_ID, now())).toBe(
      true,
    );
  });

  it('revokes an active or an expired unused invitation; a used, revoked, unknown or other-Organization one is 404 and keeps the grant', async () => {
    const { world, auth, revoke, grant, list, now } = setUp();
    await revoke('admin-invitation-1');
    await revoke('admin-invitation-10'); // expired, unused: revocable, as in Core
    const statuses = Object.fromEntries((await list()).invitations.map((i) => [i.id, i.status]));
    expect(statuses['admin-invitation-1']).toBe('revoked');
    expect(statuses['admin-invitation-10']).toBe('revoked');
    const memberships = world.snapshot().organizations.find((o) => o.id === HORIZON)?.memberships;
    for (const id of [
      'admin-invitation-8',
      'admin-invitation-9',
      'admin-invitation-1',
      'unknown',
    ]) {
      const token = await grant('admin_invitation.revoke');
      expect(await error(revoke(id, HORIZON, token))).toMatchObject({
        status: 404,
        code: 'not_found',
      });
      expect(auth.checkStepUp(token, 'admin_invitation.revoke', DEMO_OWNER_USER_ID, now())).toBe(
        true,
      );
    }
    // Another Organization's invitation, through this one's route.
    expect((await error(revoke('admin-invitation-3', HORIZON))).status).toBe(404);
    // Revocation never touches memberships.
    expect(world.snapshot().organizations.find((o) => o.id === HORIZON)?.memberships).toBe(
      memberships,
    );
    expect(world.snapshot().activity.at(-1)).toMatchObject({ action: 'admin_invitation.revoked' });
  });

  it('refuses operators and Organizations outside the owner’s Company with one 404, and a missing session with 401', async () => {
    const operator = setUp({ userId: 'op', actor: DEMO_OPERATOR_IDS.school, tier: 'operator' });
    expect(await error(operator.list())).toMatchObject({ status: 404, code: 'not_found' });
    const token = operator.auth.issueStepUp('admin_invitation.create', 'op', NOW + 60_000);
    expect((await error(operator.create(undefined, HORIZON, token))).status).toBe(404);
    TestBed.resetTestingModule();
    const owner = setUp();
    expect(
      (await error(owner.list(organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3cff')))).status,
    ).toBe(404);
    expect((await owner.list(ANDALOUS)).invitations.every((i) => i.status)).toBe(true);
    owner.auth.signedIn.set(null);
    expect((await error(owner.list())).status).toBe(401);
  });

  it('throttles create and revoke together: 20 attempts per hour per user, failures included', async () => {
    const { create, revoke, advance } = setUp();
    for (let i = 0; i < INVITATION_MANAGE_LIMIT.limit; i++)
      await (i % 2 === 0
        ? error(create(undefined, HORIZON, 'bad'))
        : error(revoke('unknown', HORIZON, 'bad')));
    expect(await error(create())).toMatchObject({ status: 429, kind: 'rate_limited' });
    expect(await error(revoke('admin-invitation-1'))).toMatchObject({ status: 429 });
    advance(INVITATION_MANAGE_LIMIT.windowMs);
    expect((await create()).code).toMatch(CODE);
  });

  it('loses the first answer of an applied create; nothing replays it, so a second send would create another', async () => {
    const { create, list } = setUp(undefined, 'outcomeUnknown');
    const before = (await list()).invitations.length;
    expect((await error(create())).kind).toBe('network');
    expect((await list()).invitations).toHaveLength(before + 1);
  });

  it('keeps the counts of every view active-only and consistent', async () => {
    const { create, revoke } = setUp();
    const dashboard = async () => {
      const d = await firstValueFrom(
        TestBed.inject(MockPlatformDashboardGateway).load(DEMO_SCHOOL_PLATFORM_ID),
      );
      return d.adminInvitationsAwaiting.status === 'available'
        ? d.adminInvitationsAwaiting.data
        : null;
    };
    const overview = async () =>
      (await firstValueFrom(TestBed.inject(MockCompanyOverviewGateway).load(DEMO_COMPANY_ID)))
        .summary.pendingAdminInvitations;
    const detail = async () =>
      (await firstValueFrom(TestBed.inject(MockOrganizationGateway).load(HORIZON)))
        .adminInvitationsAwaiting;
    expect(await overview()).toEqual({ status: 'available', value: 7 });
    expect(await detail()).toEqual({
      status: 'available',
      data: { status: 'available', value: 2 },
    });
    const schoolBefore = await dashboard();
    await create();
    await revoke('admin-invitation-1');
    await revoke('admin-invitation-10'); // expired: not counted before, not counted after
    expect(await overview()).toEqual({ status: 'available', value: 7 });
    expect(await detail()).toEqual({
      status: 'available',
      data: { status: 'available', value: 2 },
    });
    expect(await dashboard()).toEqual(schoolBefore);
  });
});

describe('the seed’s invitation invariants', () => {
  it('never predates its Organization, and every status timestamp follows creation', () => {
    const { world } = setUp();
    const tables = world.snapshot();
    for (const i of tables.adminInvitations) {
      const organization = tables.organizations.find((o) => o.id === i.organizationId)!;
      const created = Date.parse(i.createdAt);
      expect(created).toBeGreaterThanOrEqual(Date.parse(organization.createdAt));
      expect(Date.parse(i.expiresAt)).toBeGreaterThan(created);
      for (const at of [i.consumedAt, i.revokedAt])
        if (at !== null) expect(Date.parse(at)).toBeGreaterThan(created);
    }
  });
});
