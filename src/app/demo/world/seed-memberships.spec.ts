import { organizationId } from '../../core/context/scope.model';
import { demoWorldSeed } from './seed';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from './seed';
import {
  activeMembershipCount,
  membershipTotal,
  organizationsOf,
  pendingRequestCount,
  pendingRequestTotal,
} from './selectors';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const org = (n: number) =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${String(n).padStart(2, '0')}`);

describe('demo world: members and memberships (P5-S1)', () => {
  const world = demoWorldSeed(NOW);

  it('is deterministic', () => {
    expect(demoWorldSeed(NOW).memberships).toEqual(world.memberships);
    expect(demoWorldSeed(NOW).members).toEqual(world.members);
  });

  it('reproduces every figure the views showed before, from the records', () => {
    expect(membershipTotal(world, organizationsOf(world, DEMO_SCHOOL_PLATFORM_ID))).toBe(920);
    expect(membershipTotal(world, organizationsOf(world, DEMO_DRIVE_PLATFORM_ID))).toBe(460);
    expect(pendingRequestTotal(world, organizationsOf(world, DEMO_SCHOOL_PLATFORM_ID))).toBe(12);
    expect(pendingRequestTotal(world, organizationsOf(world, DEMO_DRIVE_PLATFORM_ID))).toBe(4);
    const figures = Object.fromEntries(
      [1, 2, 3, 4, 6, 17, 19, 24].map((n) => [
        n,
        [activeMembershipCount(world, org(n)), pendingRequestCount(world, org(n))],
      ]),
    );
    expect(figures).toEqual({
      1: [64, 3],
      2: [118, 0],
      3: [87, 5],
      4: [41, 1],
      6: [52, 3],
      17: [74, 2],
      19: [61, 2],
      24: [55, 0],
    });
  });

  it('keeps referential integrity, one membership per person and Organization, and valid timestamps', () => {
    const organizations = new Map(world.organizations.map((o) => [o.id, o]));
    const people = new Set(world.members.map((p) => p.id));
    const pairs = new Set<string>();
    const now = new Date(NOW).toISOString();
    for (const m of world.memberships) {
      const organization = organizations.get(m.organizationId);
      expect(organization).toBeDefined();
      expect(people.has(m.userId)).toBe(true);
      const pair = `${m.userId}|${m.organizationId}`;
      expect(pairs.has(pair)).toBe(false);
      pairs.add(pair);
      expect(m.requestedAt >= organization!.createdAt).toBe(true);
      for (const at of [m.requestedAt, m.approvedAt, m.rejectedAt, m.revokedAt])
        if (at !== null) expect(at <= now).toBe(true);
      // Each status carries exactly its own decision instants (ADR-0030).
      expect(m.approvedAt !== null).toBe(m.status === 'active' || m.status === 'revoked');
      expect(m.rejectedAt !== null).toBe(m.status === 'rejected');
      expect(m.revokedAt !== null).toBe(m.status === 'revoked');
      if (m.approvedAt) expect(m.approvedAt >= m.requestedAt).toBe(true);
      // The admin privilege exists only on an active membership.
      if (m.isOrganizationAdmin) expect(m.status).toBe('active');
      expect(m.audience).not.toBe('admin');
    }
  });

  it('gives each Organization exactly one explicit admin, and some people memberships in several Organizations', () => {
    for (const o of world.organizations)
      expect(
        world.memberships.filter((m) => m.organizationId === o.id && m.isOrganizationAdmin),
      ).toHaveLength(1);
    const perPerson = new Map<string, number>();
    for (const m of world.memberships) perPerson.set(m.userId, (perPerson.get(m.userId) ?? 0) + 1);
    expect([...perPerson.values()].some((n) => n > 1)).toBe(true);
    // Rejected and revoked records exist but no figure counts them.
    expect(world.memberships.some((m) => m.status === 'rejected')).toBe(true);
    expect(world.memberships.some((m) => m.status === 'revoked')).toBe(true);
  });

  it('keeps admin identities out of memberships, and uses only fictional contacts, never names', () => {
    const staff = new Set<string>([DEMO_OWNER_ID, ...Object.values(DEMO_OPERATOR_IDS)]);
    expect(world.memberships.some((m) => staff.has(m.userId))).toBe(false);
    expect(world.members.some((p) => staff.has(p.id))).toBe(false);
    for (const p of world.members) {
      expect(Object.keys(p).sort()).toEqual(['contactVerified', 'email', 'id', 'phone']);
      expect(p.email !== null || p.phone !== null).toBe(true);
      if (p.email) expect(p.email).toMatch(/^member-\d{4}@example\.invalid$/);
      if (p.phone) expect(p.phone).toMatch(/^\+999\d{9}$/);
    }
  });

  it('École Horizon’s admin joined when its admin invitation was used', () => {
    const used = world.adminInvitations.find((i) => i.consumedAt !== null)!;
    const admin = world.memberships.find(
      (m) => m.organizationId === used.organizationId && m.isOrganizationAdmin,
    )!;
    expect(admin.approvedAt).toBe(used.consumedAt);
    expect(admin.audience).toBe(used.invitationType);
  });
});
