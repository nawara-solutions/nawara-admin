import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { ListableMembershipStatus } from '../domain/membership.model';
import { MembershipDecision } from '../domain/membership-decision.model';
import {
  MEMBERSHIP_DECISIONS_DEMO_SCENARIO,
  MEMBERSHIP_OP_LIMIT,
  MembershipDecisionsDemoScenario,
  MockMembershipGateway,
} from './membership.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');

function setUp(actor: AdminIdentityId | null, tier: 'owner' | 'operator' = 'owner') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      MockMembershipGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set(
    actor === null
      ? null
      : {
          identity: { userId: `u-${actor}`, email: null, phone: null, adminTier: tier },
          businessIdentityId: actor,
        },
  );
  const gateway = TestBed.inject(MockMembershipGateway);
  return {
    world: TestBed.inject(DemoWorld),
    list: (status: ListableMembershipStatus, organization = HORIZON) =>
      firstValueFrom(gateway.list(organization, status)),
  };
}

async function error(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockMembershipGateway (Core’s membership list over the demo world)', () => {
  it('lists one status of one Organization, oldest request first, with exactly Core’s fields', async () => {
    const { list } = setUp(DEMO_OWNER_ID);
    const active = await list('active');
    expect(active.memberships).toHaveLength(64);
    expect(Object.keys(active.memberships[0]!).sort()).toEqual(
      [
        'approvedAt',
        'audience',
        'contactVerified',
        'email',
        'id',
        'isOrganizationAdmin',
        'phone',
        'rejectedAt',
        'requestedAt',
        'status',
        'userId',
      ].sort(),
    );
    const times = active.memberships.map((m) => m.requestedAt);
    expect([...times].sort()).toEqual(times);
    expect((await list('pending')).memberships).toHaveLength(3);
    expect((await list('rejected')).memberships).toHaveLength(1);
    expect(active.memberships.every((m) => m.status === 'active')).toBe(true);
  });

  it('never lists a revoked membership, and refuses a status Core cannot list', async () => {
    const { list, world } = setUp(DEMO_OWNER_ID);
    const revoked = world
      .snapshot()
      .memberships.filter((m) => m.organizationId === HORIZON && m.status === 'revoked');
    expect(revoked).toHaveLength(1);
    const listed = [
      ...(await list('active')).memberships,
      ...(await list('pending')).memberships,
      ...(await list('rejected')).memberships,
    ];
    expect(listed.some((m) => m.id === revoked[0]!.id)).toBe(false);
    expect((await error(list('revoked' as ListableMembershipStatus))).status).toBe(400);
  });

  it('lets an assigned operator read their Platform’s Organizations only; others get one collapsed 404', async () => {
    const operator = setUp(DEMO_OPERATOR_IDS.school, 'operator');
    expect((await operator.list('active')).memberships).toHaveLength(64);
    expect(await error(operator.list('active', ANDALOUS))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    TestBed.resetTestingModule();
    const unassigned = setUp(DEMO_OPERATOR_IDS.unassigned, 'operator');
    expect((await error(unassigned.list('active'))).status).toBe(404);
    TestBed.resetTestingModule();
    const owner = setUp(DEMO_OWNER_ID);
    expect(
      (await error(owner.list('active', organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3cff'))))
        .status,
    ).toBe(404);
    TestBed.resetTestingModule();
    const nobody = setUp(null);
    expect((await error(nobody.list('active'))).status).toBe(401);
  });
});

describe('MockMembershipGateway: decisions (P5-S2)', () => {
  let now = NOW;

  function decisions(scenario: MembershipDecisionsDemoScenario = 'normal', actor = DEMO_OWNER_ID) {
    now = NOW;
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => now },
        { provide: MEMBERSHIP_DECISIONS_DEMO_SCENARIO, useValue: scenario },
        MockMembershipGateway,
      ],
    });
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: `u-${actor}`, email: null, phone: null, adminTier: 'owner' },
      businessIdentityId: actor,
    });
    const gateway = TestBed.inject(MockMembershipGateway);
    const world = TestBed.inject(DemoWorld);
    const pending = () =>
      world
        .snapshot()
        .memberships.find((m) => m.organizationId === HORIZON && m.status === 'pending')!;
    return {
      world,
      pending,
      statusOf: (id: string) => world.snapshot().memberships.find((m) => m.id === id)?.status,
      decide: (id: string, decision: MembershipDecision = 'approve', organization = HORIZON) =>
        firstValueFrom(gateway.decide(organization, id, decision)),
    };
  }

  it('answers Core’s 200 { id, status } and applies the decision', async () => {
    const { pending, decide, statusOf } = decisions();
    const request = pending();
    expect(await decide(request.id)).toEqual({ id: request.id, status: 'active' });
    expect(statusOf(request.id)).toBe('active');
    const next = pending();
    expect(await decide(next.id, 'reject')).toEqual({ id: next.id, status: 'rejected' });
  });

  it('refuses signed-out callers (401) and another Organization’s id (404) without applying anything', async () => {
    const { pending, decide, statusOf } = decisions();
    const request = pending();
    expect((await error(decide(request.id, 'approve', ANDALOUS))).status).toBe(404);
    TestBed.inject(DemoAuthState).signedIn.set(null);
    expect((await error(decide(request.id))).status).toBe(401);
    expect(statusOf(request.id)).toBe('pending');
  });

  it('throttles per actor before anything else: every attempt counts', async () => {
    const { decide, pending, statusOf } = decisions();
    for (let i = 0; i < MEMBERSHIP_OP_LIMIT.limit; i++) await error(decide('unknown'));
    const request = pending();
    expect(await error(decide(request.id))).toEqual({ kind: 'rate_limited', status: 429 });
    expect(statusOf(request.id)).toBe('pending');
    now += MEMBERSHIP_OP_LIMIT.windowMs + 1;
    expect((await decide(request.id)).status).toBe('active');
  });

  it('simulates a competing decision, a lost answer, an exhausted bucket and an outage', async () => {
    let s = decisions('decidedElsewhere');
    let request = s.pending();
    expect(await error(s.decide(request.id, 'reject'))).toEqual({
      kind: 'conflict',
      code: 'membership_already_decided',
      status: 409,
    });
    expect(s.statusOf(request.id)).toBe('active');

    TestBed.resetTestingModule();
    s = decisions('outcomeUnknown');
    request = s.pending();
    expect((await error(s.decide(request.id))).kind).toBe('network');
    expect(s.statusOf(request.id)).toBe('active');

    for (const scenario of ['rateLimited', 'unavailable'] as const) {
      TestBed.resetTestingModule();
      s = decisions(scenario);
      request = s.pending();
      expect((await error(s.decide(request.id))).status).toBe(
        scenario === 'rateLimited' ? 429 : 503,
      );
      expect(s.statusOf(request.id)).toBe('pending');
    }
  });

  it('lets an assigned operator decide and refuses one of another Platform', async () => {
    let s = decisions('normal', DEMO_OPERATOR_IDS.school);
    expect((await s.decide(s.pending().id)).status).toBe('active');
    TestBed.resetTestingModule();
    s = decisions('normal', DEMO_OPERATOR_IDS.phone);
    const request = s.pending();
    expect((await error(s.decide(request.id))).status).toBe(404);
    expect(s.statusOf(request.id)).toBe('pending');
  });
});

describe('MockMembershipGateway: revocation (P5-S3a)', () => {
  function revocations(
    scenario: MembershipDecisionsDemoScenario = 'normal',
    actor = DEMO_OWNER_ID,
  ) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => NOW },
        { provide: MEMBERSHIP_DECISIONS_DEMO_SCENARIO, useValue: scenario },
        MockMembershipGateway,
      ],
    });
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: `u-${actor}`, email: null, phone: null, adminTier: 'owner' },
      businessIdentityId: actor,
    });
    const gateway = TestBed.inject(MockMembershipGateway);
    const world = TestBed.inject(DemoWorld);
    const active = (admin = false) =>
      world
        .snapshot()
        .memberships.find(
          (m) =>
            m.organizationId === HORIZON &&
            m.status === 'active' &&
            m.isOrganizationAdmin === admin,
        )!;
    return {
      active,
      record: (id: string) => world.snapshot().memberships.find((m) => m.id === id),
      revoke: (id: string, organization = HORIZON) =>
        firstValueFrom(gateway.revoke(organization, id)),
      listActive: () => firstValueFrom(gateway.list(HORIZON, 'active')),
    };
  }

  it('answers Core’s 200 { id, status: "revoked" }; the membership leaves the Active list and no list shows it', async () => {
    const s = revocations();
    const target = s.active();
    expect(await s.revoke(target.id)).toEqual({ id: target.id, status: 'revoked' });
    expect(s.record(target.id)?.status).toBe('revoked');
    expect((await s.listActive()).memberships.some((m) => m.id === target.id)).toBe(false);
  });

  it('refuses a non-active membership with 409 and another Organization’s id with 404', async () => {
    const s = revocations();
    const target = s.active();
    await s.revoke(target.id);
    expect(await error(s.revoke(target.id))).toEqual({
      kind: 'conflict',
      code: 'membership_not_active',
      status: 409,
    });
    expect((await error(s.revoke(s.active().id, ANDALOUS))).status).toBe(404);
  });

  it('lets an assigned operator revoke an organization admin, clearing the role; another Platform’s operator gets 404', async () => {
    let s = revocations('normal', DEMO_OPERATOR_IDS.school);
    const admin = s.active(true);
    await s.revoke(admin.id);
    expect(s.record(admin.id)).toMatchObject({ status: 'revoked', isOrganizationAdmin: false });
    TestBed.resetTestingModule();
    s = revocations('normal', DEMO_OPERATOR_IDS.phone);
    const target = s.active();
    expect((await error(s.revoke(target.id))).status).toBe(404);
    expect(s.record(target.id)?.status).toBe('active');
  });

  it('simulates a competing revocation, a lost answer, an exhausted bucket and an outage', async () => {
    let s = revocations('decidedElsewhere');
    let target = s.active();
    expect((await error(s.revoke(target.id))).status).toBe(409);
    expect(s.record(target.id)?.status).toBe('revoked');
    TestBed.resetTestingModule();
    s = revocations('outcomeUnknown');
    target = s.active();
    expect((await error(s.revoke(target.id))).kind).toBe('network');
    expect(s.record(target.id)?.status).toBe('revoked');
    for (const scenario of ['rateLimited', 'unavailable'] as const) {
      TestBed.resetTestingModule();
      s = revocations(scenario);
      target = s.active();
      expect((await error(s.revoke(target.id))).status).toBe(
        scenario === 'rateLimited' ? 429 : 503,
      );
      expect(s.record(target.id)?.status).toBe('active');
    }
  });
});

describe('MockMembershipGateway: the organization-admin role (P5-S3b)', () => {
  function roles(
    scenario: MembershipDecisionsDemoScenario = 'normal',
    actor = DEMO_OWNER_ID,
    tier: 'owner' | 'operator' = 'owner',
  ) {
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => NOW },
        { provide: MEMBERSHIP_DECISIONS_DEMO_SCENARIO, useValue: scenario },
        MockMembershipGateway,
      ],
    });
    const auth = TestBed.inject(DemoAuthState);
    const userId = `u-${actor}`;
    auth.signedIn.set({
      identity: { userId, email: null, phone: null, adminTier: tier },
      businessIdentityId: actor,
    });
    const gateway = TestBed.inject(MockMembershipGateway);
    const world = TestBed.inject(DemoWorld);
    const active = (admin: boolean, skip = 0) =>
      world
        .snapshot()
        .memberships.filter(
          (m) =>
            m.organizationId === HORIZON &&
            m.status === 'active' &&
            m.isOrganizationAdmin === admin,
        )[skip]!;
    /** A grant as the step-up gateway would issue it (`secret_key` only to prove Core's refusal). */
    const grant = (purpose: string, method: 'totp' | 'webauthn' | 'secret_key' = 'totp') =>
      auth.issueStepUp(purpose, userId, NOW + 60_000, method);
    return {
      world,
      active,
      grant,
      flag: (id: string) =>
        world.snapshot().memberships.find((m) => m.id === id)?.isOrganizationAdmin,
      set: (id: string, admin: boolean, stepUpToken: string, organization = HORIZON) =>
        firstValueFrom(gateway.setOrganizationAdmin(organization, id, admin, { stepUpToken })).then(
          () => 'done',
        ),
    };
  }
  const STEP_UP_REQUIRED = { kind: 'forbidden', code: 'step_up_required', status: 403 };

  it('grants and removes with a factor step-up of the matching purpose: 204, the flag flips, the grant is single use', async () => {
    const s = roles();
    const member = s.active(false);
    const token = s.grant('organization.admin.grant');
    expect(await s.set(member.id, true, token)).toBe('done');
    expect(s.flag(member.id)).toBe(true);
    const another = s.active(false);
    expect(await error(s.set(another.id, true, token))).toEqual(STEP_UP_REQUIRED);
    expect(s.flag(another.id)).toBe(false);
    expect(await s.set(member.id, false, s.grant('organization.admin.revoke', 'webauthn'))).toBe(
      'done',
    );
    expect(s.flag(member.id)).toBe(false);
  });

  it('refuses a missing, wrong-purpose or secret-key step-up (403) and changes nothing', async () => {
    const s = roles();
    const member = s.active(false);
    for (const token of [
      '',
      s.grant('organization.admin.revoke'),
      s.grant('admin_invitation.create'),
      s.grant('organization.admin.grant', 'secret_key'),
    ])
      expect(await error(s.set(member.id, true, token))).toEqual(STEP_UP_REQUIRED);
    expect(s.flag(member.id)).toBe(false);
  });

  it('answers 404 without spending the step-up for a role already in place, then accepts it for an eligible member', async () => {
    const s = roles();
    const admin = s.active(true);
    const token = s.grant('organization.admin.grant');
    expect((await error(s.set(admin.id, true, token))).status).toBe(404);
    const member = s.active(false);
    expect(await s.set(member.id, true, token)).toBe('done');
  });

  it('gives operators the collapsed 404 before any step-up, and changes nothing', async () => {
    const s = roles('normal', DEMO_OPERATOR_IDS.school, 'operator');
    const member = s.active(false);
    expect((await error(s.set(member.id, true, s.grant('organization.admin.grant')))).status).toBe(
      404,
    );
    expect(s.flag(member.id)).toBe(false);
    expect((await error(s.set(s.active(true).id, false, 'x', ANDALOUS))).status).toBe(404);
  });

  it('simulates a competing change (404), a lost answer (applied, step-up spent), a full bucket and an outage', async () => {
    let s = roles('decidedElsewhere');
    let member = s.active(false);
    expect((await error(s.set(member.id, true, s.grant('organization.admin.grant')))).status).toBe(
      404,
    );
    expect(s.flag(member.id)).toBe(true);
    TestBed.resetTestingModule();
    s = roles('outcomeUnknown');
    member = s.active(false);
    const token = s.grant('organization.admin.grant');
    expect((await error(s.set(member.id, true, token))).kind).toBe('network');
    expect(s.flag(member.id)).toBe(true);
    expect(await error(s.set(s.active(false).id, true, token))).toEqual(STEP_UP_REQUIRED);
    for (const scenario of ['rateLimited', 'unavailable'] as const) {
      TestBed.resetTestingModule();
      s = roles(scenario);
      member = s.active(false);
      const fresh = s.grant('organization.admin.grant');
      expect((await error(s.set(member.id, true, fresh))).status).toBe(
        scenario === 'rateLimited' ? 429 : 503,
      );
      expect(s.flag(member.id)).toBe(false);
    }
  });
});
