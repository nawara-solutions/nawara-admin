import { organizationId } from '../../../core/context/scope.model';
import { AdminIdentityId, DemoWorldTables, MembershipRecord } from '../records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../seed';
import {
  activeMembershipCount,
  membershipTotal,
  organizationsOf,
  pendingRequestCount,
  pendingRequestTotal,
} from '../selectors';
import {
  DecideMembershipInput,
  MembershipDecision,
  RevokeMembershipInput,
  decideMembership,
  revokeMembership,
} from './membership.commands';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const LATER = NOW + 60_000;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const RIAD = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c03');

const seed = demoWorldSeed(NOW);
const firstOf = (
  world: DemoWorldTables,
  organization: string,
  status: MembershipRecord['status'],
) => world.memberships.find((m) => m.organizationId === organization && m.status === status)!;

const input = (
  membership: MembershipRecord,
  decision: MembershipDecision,
  change: Partial<DecideMembershipInput> = {},
): DecideMembershipInput => ({
  organizationId: membership.organizationId,
  membershipId: membership.id,
  decision,
  actor: DEMO_OWNER_ID,
  actorUserId: 'owner-user',
  requireContactVerification: false,
  now: LATER,
  ...change,
});

/** A purpose-built world: Horizon's requests replaced by one pending student and one pending teacher. */
function worldWithRequests(): {
  world: DemoWorldTables;
  student: MembershipRecord;
  teacher: MembershipRecord;
} {
  const template = firstOf(seed, HORIZON, 'pending');
  const student: MembershipRecord = { ...template, id: 'request-student', audience: 'student' };
  const teacher: MembershipRecord = {
    ...template,
    id: 'request-teacher',
    userId: seed.members[1]!.id,
    audience: 'teacher',
  };
  const others = seed.memberships.filter(
    (m) => !(m.organizationId === HORIZON && m.status === 'pending'),
  );
  return { world: { ...seed, memberships: [...others, student, teacher] }, student, teacher };
}

function applied(world: DemoWorldTables, command: DecideMembershipInput) {
  const outcome = decideMembership(world, command);
  if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
  return outcome;
}

describe('decideMembership (P5-S2, Core’s decide)', () => {
  it('approves a pending request: exactly that record becomes active, nothing else changes', () => {
    const request = firstOf(seed, HORIZON, 'pending');
    expect(request.audience).toBe('teacher');
    const { world, result } = applied(seed, input(request, 'approve'));
    expect(result).toEqual({
      ...request,
      status: 'active',
      approvedAt: new Date(LATER).toISOString(),
    });
    const changed = world.memberships.filter((m, i) => m !== seed.memberships[i]);
    expect(changed).toEqual([result]);
    // No new person, no new membership, no admin privilege, the audience kept.
    expect(world.members).toBe(seed.members);
    expect(world.memberships).toHaveLength(seed.memberships.length);
    expect(result.isOrganizationAdmin).toBe(false);
    expect(result.audience).toBe(request.audience);
    // Nothing commercial, no access, no invitation is touched.
    for (const table of [
      'company',
      'platforms',
      'organizations',
      'identities',
      'assignments',
      'subscriptions',
      'adminInvitations',
      'paymentIssues',
      'platformCommercial',
      'inboxes',
      'idempotency',
    ] as const)
      expect(world[table]).toBe(seed[table]);
    expect(world.activity.at(-1)).toMatchObject({
      action: 'membership.approved',
      organizationId: HORIZON,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
    });
  });

  it('moves every derived figure by exactly one, for the Organization, its Platform and no other', () => {
    const request = firstOf(seed, HORIZON, 'pending');
    const school = (w: DemoWorldTables) => organizationsOf(w, DEMO_SCHOOL_PLATFORM_ID);
    const drive = (w: DemoWorldTables) => organizationsOf(w, DEMO_DRIVE_PLATFORM_ID);
    const approved = applied(seed, input(request, 'approve')).world;
    expect([
      activeMembershipCount(approved, HORIZON),
      pendingRequestCount(approved, HORIZON),
    ]).toEqual([65, 2]);
    expect([
      membershipTotal(approved, school(approved)),
      pendingRequestTotal(approved, school(approved)),
    ]).toEqual([921, 11]);
    expect([activeMembershipCount(approved, RIAD), pendingRequestCount(approved, RIAD)]).toEqual([
      87, 5,
    ]);
    expect([
      membershipTotal(approved, drive(approved)),
      pendingRequestTotal(approved, drive(approved)),
    ]).toEqual([460, 4]);
    const rejected = applied(seed, input(request, 'reject')).world;
    expect([
      activeMembershipCount(rejected, HORIZON),
      pendingRequestCount(rejected, HORIZON),
    ]).toEqual([64, 2]);
    expect(
      rejected.memberships.filter((m) => m.organizationId === HORIZON && m.status === 'rejected'),
    ).toHaveLength(2);
    expect(rejected.activity.at(-1)?.action).toBe('membership.rejected');
  });

  it('decides a pending student exactly as a pending teacher: the audience is never read', () => {
    const { world, student, teacher } = worldWithRequests();
    for (const decision of ['approve', 'reject'] as const) {
      const s = applied(world, input(student, decision)).result;
      const t = applied(world, input(teacher, decision)).result;
      expect(s.status).toBe(decision === 'approve' ? 'active' : 'rejected');
      expect({ ...s, id: '', userId: '', audience: '' }).toEqual({
        ...t,
        id: '',
        userId: '',
        audience: '',
      });
      expect([s.audience, t.audience]).toEqual(['student', 'teacher']);
    }
    for (const audience of ['org_admin', 'learner', 'anything-else']) {
      const other = { ...student, audience };
      const custom = {
        ...world,
        memberships: world.memberships.map((m) => (m.id === student.id ? other : m)),
      };
      expect(applied(custom, input(other, 'approve')).result.status).toBe('active');
    }
  });

  it('refuses a request that is not pending, and a repeated or competing decision: 409', () => {
    const request = firstOf(seed, HORIZON, 'pending');
    const once = applied(seed, input(request, 'approve')).world;
    for (const decision of ['approve', 'reject'] as const)
      expect(decideMembership(once, input(request, decision))).toEqual({
        ok: false,
        error: { kind: 'conflict', code: 'membership_already_decided', status: 409 },
      });
    for (const status of ['active', 'rejected', 'revoked'] as const) {
      const decided = firstOf(seed, HORIZON, status);
      const outcome = decideMembership(seed, input(decided, 'approve'));
      expect(outcome.ok ? null : outcome.error.status).toBe(409);
    }
  });

  it('collapses unknown, another Organization’s, someone else’s Platform and one’s own membership into one 404', () => {
    const request = firstOf(seed, HORIZON, 'pending');
    const notFound = { ok: false, error: { kind: 'not_found', code: 'not_found', status: 404 } };
    expect(decideMembership(seed, input(request, 'approve', { membershipId: 'unknown' }))).toEqual(
      notFound,
    );
    // The id exists, but in another Organization than the URL's.
    expect(decideMembership(seed, input(request, 'approve', { organizationId: RIAD }))).toEqual(
      notFound,
    );
    // An operator of another Platform, and one with no assignment.
    for (const actor of [
      DEMO_OPERATOR_IDS.phone,
      DEMO_OPERATOR_IDS.unassigned,
    ] as AdminIdentityId[])
      expect(decideMembership(seed, input(request, 'approve', { actor }))).toEqual(notFound);
    // Nobody decides their own membership, the owner included.
    expect(
      decideMembership(seed, input(request, 'approve', { actorUserId: request.userId })),
    ).toEqual(notFound);
  });

  it('lets the Company owner and an operator assigned to the Platform decide; no step-up or subscription involved', () => {
    const school = firstOf(seed, HORIZON, 'pending');
    const drive = seed.memberships.find(
      (m) =>
        m.status === 'pending' &&
        seed.organizations.find((o) => o.id === m.organizationId)?.platformId ===
          DEMO_DRIVE_PLATFORM_ID,
    )!;
    expect(
      applied(seed, input(school, 'approve', { actor: DEMO_OPERATOR_IDS.school })).result.status,
    ).toBe('active');
    expect(
      applied(seed, input(drive, 'reject', { actor: DEMO_OPERATOR_IDS.phone })).result.status,
    ).toBe('rejected');
    expect(
      applied(seed, input(drive, 'approve', { actor: DEMO_OPERATOR_IDS.multi })).result.status,
    ).toBe('active');
    // A School operator cannot reach Drive.
    expect(
      decideMembership(seed, input(drive, 'approve', { actor: DEMO_OPERATOR_IDS.school })).ok,
    ).toBe(false);
  });

  it('asks for a verified contact before approval only when Core is configured to', () => {
    const unverifiedPerson = seed.members.find((p) => !p.contactVerified)!;
    const template = firstOf(seed, HORIZON, 'pending');
    const request = { ...template, userId: unverifiedPerson.id };
    const world = {
      ...seed,
      memberships: seed.memberships.map((m) => (m.id === template.id ? request : m)),
    };
    expect(
      decideMembership(world, input(request, 'approve', { requireContactVerification: true })),
    ).toEqual({
      ok: false,
      error: { kind: 'conflict', code: 'contact_not_verified', status: 409 },
    });
    expect(
      applied(world, input(request, 'reject', { requireContactVerification: true })).result.status,
    ).toBe('rejected');
    expect(applied(world, input(request, 'approve')).result.status).toBe('active');
  });
});

describe('revokeMembership (P5-S3a, Core’s revoke)', () => {
  const revoke = (
    membership: MembershipRecord,
    change: Partial<RevokeMembershipInput> = {},
  ): RevokeMembershipInput => ({
    organizationId: membership.organizationId,
    membershipId: membership.id,
    actor: DEMO_OWNER_ID,
    actorUserId: 'owner-user',
    now: LATER,
    ...change,
  });
  const member = seed.memberships.find(
    (m) => m.organizationId === HORIZON && m.status === 'active' && !m.isOrganizationAdmin,
  )!;
  const admin = seed.memberships.find(
    (m) => m.organizationId === HORIZON && m.status === 'active' && m.isOrganizationAdmin,
  )!;
  const applyRevoke = (world: DemoWorldTables, command: RevokeMembershipInput) => {
    const outcome = revokeMembership(world, command);
    if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
    return outcome;
  };

  it('revokes an active membership: exactly that record changes, nothing else does', () => {
    const { world, result } = applyRevoke(seed, revoke(member));
    expect(result).toEqual({
      ...member,
      status: 'revoked',
      revokedAt: new Date(LATER).toISOString(),
    });
    expect(world.memberships.filter((m, i) => m !== seed.memberships[i])).toEqual([result]);
    expect(world.members).toBe(seed.members);
    for (const table of [
      'company',
      'platforms',
      'organizations',
      'identities',
      'assignments',
      'subscriptions',
      'adminInvitations',
      'paymentIssues',
      'platformCommercial',
      'inboxes',
      'idempotency',
    ] as const)
      expect(world[table]).toBe(seed[table]);
    expect(world.activity.at(-1)).toMatchObject({
      action: 'membership.revoked',
      organizationId: HORIZON,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
    });
  });

  it('clears the organization-admin role in the same change, also when an assigned operator revokes it', () => {
    for (const actor of [DEMO_OWNER_ID, DEMO_OPERATOR_IDS.school] as AdminIdentityId[]) {
      const { result } = applyRevoke(seed, revoke(admin, { actor }));
      expect([result.status, result.isOrganizationAdmin]).toEqual(['revoked', false]);
      expect(result.audience).toBe(admin.audience);
    }
  });

  it('lowers the active figures by one for the Organization, its Platform and nothing else', () => {
    const world = applyRevoke(seed, revoke(member)).world;
    const school = organizationsOf(world, DEMO_SCHOOL_PLATFORM_ID);
    const drive = organizationsOf(world, DEMO_DRIVE_PLATFORM_ID);
    expect([activeMembershipCount(world, HORIZON), pendingRequestCount(world, HORIZON)]).toEqual([
      63, 3,
    ]);
    expect([membershipTotal(world, school), pendingRequestTotal(world, school)]).toEqual([919, 12]);
    expect([membershipTotal(world, drive), pendingRequestTotal(world, drive)]).toEqual([460, 4]);
    expect(activeMembershipCount(world, RIAD)).toBe(87);
  });

  it('refuses anything not active, and a repeated or competing revocation: 409 membership_not_active', () => {
    const once = applyRevoke(seed, revoke(member)).world;
    const conflict = {
      ok: false,
      error: { kind: 'conflict', code: 'membership_not_active', status: 409 },
    };
    expect(revokeMembership(once, revoke(member))).toEqual(conflict);
    for (const status of ['pending', 'rejected', 'revoked'] as const)
      expect(revokeMembership(seed, revoke(firstOf(seed, HORIZON, status)))).toEqual(conflict);
  });

  it('collapses unknown, another Organization’s, someone else’s Platform and one’s own membership into one 404', () => {
    const notFound = { ok: false, error: { kind: 'not_found', code: 'not_found', status: 404 } };
    expect(revokeMembership(seed, revoke(member, { membershipId: 'unknown' }))).toEqual(notFound);
    expect(revokeMembership(seed, revoke(member, { organizationId: RIAD }))).toEqual(notFound);
    for (const actor of [
      DEMO_OPERATOR_IDS.phone,
      DEMO_OPERATOR_IDS.unassigned,
    ] as AdminIdentityId[])
      expect(revokeMembership(seed, revoke(member, { actor }))).toEqual(notFound);
    expect(revokeMembership(seed, revoke(member, { actorUserId: member.userId }))).toEqual(
      notFound,
    );
  });

  it('never reads the audience', () => {
    for (const audience of ['student', 'teacher', 'learner', 'org_admin', 'anything']) {
      const other = { ...member, audience };
      const world = {
        ...seed,
        memberships: seed.memberships.map((m) => (m.id === member.id ? other : m)),
      };
      expect(applyRevoke(world, revoke(other)).result.status).toBe('revoked');
    }
  });
});
