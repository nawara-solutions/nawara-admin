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
