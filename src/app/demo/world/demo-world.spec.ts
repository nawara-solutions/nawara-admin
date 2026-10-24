import { TestBed } from '@angular/core/testing';
import { NW_CLOCK } from '../../shared/format/clock';
import { DEMO_WORLD_SEED, DemoWorld } from './demo-world';
import { DemoWorldTables } from './records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from './seed';
import {
  activeAssignments,
  assignedPlatformsOf,
  assignmentHistoryOf,
  assignmentsOf,
  companyActivity,
  createdWithin,
  grantsOf,
  growthSeries,
  membershipTotal,
  organizationsOf,
  pendingRequestTotal,
  platformsWithOperators,
  subscriptionStateOf,
  subscriptionsEndingWithin,
  uniqueAssignedOperators,
} from './selectors';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const world = demoWorldSeed(NOW);
const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;

const unique = (values: readonly string[]) => new Set(values).size === values.length;

describe('demo world: canonical seed invariants', () => {
  it('gives every entity a unique, stable id', () => {
    expect(unique(world.platforms.map((p) => p.id))).toBe(true);
    expect(unique(world.organizations.map((o) => o.id))).toBe(true);
    expect(unique(world.identities.map((i) => i.id))).toBe(true);
    expect(unique(world.adminInvitations.map((i) => i.id))).toBe(true);
    expect(unique(world.paymentIssues.map((i) => i.id))).toBe(true);
    expect(unique(world.activity.map((e) => e.id))).toBe(true);
    expect(world.organizations.every((o) => /^[0-9a-f-]{36}$/.test(o.id))).toBe(true);
    // The same clock gives the same world.
    expect(demoWorldSeed(NOW)).toEqual(world);
  });

  it('references only records that exist: Platforms of the Company, Organizations of a Platform', () => {
    const platforms = new Set(world.platforms.map((p) => p.id));
    const organizations = new Set(world.organizations.map((o) => o.id));
    expect(world.platforms.every((p) => p.companyId === world.company.id)).toBe(true);
    expect(world.organizations.every((o) => platforms.has(o.platformId))).toBe(true);
    for (const records of [world.subscriptions, world.adminInvitations, world.paymentIssues])
      expect(records.every((r) => organizations.has(r.organizationId))).toBe(true);
    // Every event is a Company Platform's, or Company-level (`platformId: null`, P6-S3: none in the seed).
    expect(world.activity.every((e) => e.platformId === null || platforms.has(e.platformId))).toBe(
      true,
    );
    expect(
      world.activity.every((e) => e.organizationId === null || organizations.has(e.organizationId)),
    ).toBe(true);
    expect(world.platformCommercial.map((c) => c.platformId).sort()).toEqual([...platforms].sort());
  });

  it('has one owner, and assigns only operators to Platforms of the Company, once each', () => {
    expect(world.identities.filter((i) => i.kind === 'owner').map((i) => i.id)).toEqual([
      world.company.ownerId,
    ]);
    const operators = new Set(
      world.identities.filter((i) => i.kind === 'operator').map((i) => i.id),
    );
    const platforms = new Set(world.platforms.map((p) => p.id));
    expect(
      world.assignments.every((a) => operators.has(a.operatorId) && platforms.has(a.platformId)),
    ).toBe(true);
    // Core's `platform_assignment_one_active`: at most one ACTIVE assignment per operator and Platform; the history
    // may hold removed ones too (a re-grant is a new record).
    expect(unique(activeAssignments(world).map((a) => `${a.operatorId}/${a.platformId}`))).toBe(
      true,
    );
    expect(unique(world.assignments.map((a) => a.id))).toBe(true);
    expect(world.assignments.every((a) => /^[0-9a-f-]{36}$/.test(a.id))).toBe(true);
  });

  it('keeps an append-only assignment history, granted and removed by the owner, in order', () => {
    for (const a of world.assignments) {
      expect(a.assignedBy).toBe(world.company.ownerId);
      expect(a.revokedBy === null).toBe(a.revokedAt === null);
      if (a.revokedAt !== null) expect(a.revokedAt >= a.assignedAt).toBe(true);
      if (a.revokedBy !== null) expect(a.revokedBy).toBe(world.company.ownerId);
    }
    expect(world.assignments.filter((a) => a.revokedAt !== null)).toHaveLength(3);
    // The phone operator's Drive access was removed, then given again: two records, one active.
    const phoneDrive = assignmentHistoryOf(world, DEMO_OPERATOR_IDS.phone);
    expect(phoneDrive.map((a) => a.revokedAt === null)).toEqual([false, true]);
    expect(phoneDrive.map((a) => a.assignedAt)).toEqual(
      [...phoneDrive.map((a) => a.assignedAt)].sort(),
    );
  });

  it('gives every operator identity exactly one account, with one fictional contact', () => {
    const operators = world.identities.filter((i) => i.kind === 'operator').map((i) => i.id);
    expect(world.operators.map((o) => o.id).sort()).toEqual([...operators].sort());
    for (const o of world.operators) {
      expect((o.email === null) !== (o.phone === null)).toBe(true);
      expect(o.email === null || o.email.endsWith('.invalid')).toBe(true);
      expect(o.phone === null || o.phone.startsWith('+999')).toBe(true);
      expect(o.contactConfirmedAt === null || o.contactConfirmedAt > o.createdAt).toBe(true);
      // An account exists before any of its assignments.
      expect(assignmentHistoryOf(world, o.id).every((a) => a.assignedAt > o.createdAt)).toBe(true);
    }
    expect(unique(world.operators.map((o) => o.email ?? o.phone ?? ''))).toBe(true);
    expect(world.operators.filter((o) => o.blocked).map((o) => o.id)).toEqual([
      DEMO_OPERATOR_IDS.blocked,
    ]);
    expect(world.operators.filter((o) => o.contactConfirmedAt === null).map((o) => o.id)).toEqual([
      DEMO_OPERATOR_IDS.awaitingConfirmation,
    ]);
    // Blocked and unassigned operators keep only removed assignments: they count nowhere.
    expect(assignedPlatformsOf(world, DEMO_OPERATOR_IDS.blocked)).toEqual([]);
    expect(assignedPlatformsOf(world, DEMO_OPERATOR_IDS.unassigned)).toEqual([]);
  });

  it('gives an Organization at most one subscription', () => {
    expect(unique(world.subscriptions.map((s) => s.organizationId))).toBe(true);
  });
});

describe('demo world: derived figures', () => {
  it('counts Organizations and memberships per Platform from the records', () => {
    expect(organizationsOf(world, S)).toHaveLength(16);
    expect(organizationsOf(world, D)).toHaveLength(8);
    expect(membershipTotal(world, organizationsOf(world, S))).toBe(920);
    expect(membershipTotal(world, organizationsOf(world, D))).toBe(460);
    expect(pendingRequestTotal(world, organizationsOf(world, S))).toBe(12);
    expect(createdWithin(organizationsOf(world, S), NOW, 30)).toHaveLength(2);
  });

  it('derives operator assignments from the canonical assignment records', () => {
    expect(assignmentsOf(world, S)).toHaveLength(3);
    expect(assignmentsOf(world, D)).toHaveLength(2);
    expect(activeAssignments(world)).toHaveLength(5);
    expect(world.assignments).toHaveLength(8);
    expect(uniqueAssignedOperators(world)).toBe(4);
    expect(platformsWithOperators(world)).toBe(2);
  });

  it('keeps every operator’s grants from active assignments only (P6-S1: history does not grant)', () => {
    const platformsOf = (id: (typeof DEMO_OPERATOR_IDS)[keyof typeof DEMO_OPERATOR_IDS]) =>
      grantsOf(world, id).platformAssignments;
    expect(platformsOf(DEMO_OPERATOR_IDS.school)).toEqual([S]);
    expect(platformsOf(DEMO_OPERATOR_IDS.multi)).toEqual([S, D]);
    expect(platformsOf(DEMO_OPERATOR_IDS.phone)).toEqual([D]);
    expect(platformsOf(DEMO_OPERATOR_IDS.unassigned)).toEqual([]);
    expect(platformsOf(DEMO_OPERATOR_IDS.awaitingConfirmation)).toEqual([S]);
    expect(platformsOf(DEMO_OPERATOR_IDS.blocked)).toEqual([]);
  });

  it('answers grants live from the records, and none for an identity that is not staff', () => {
    expect(grantsOf(world, DEMO_OWNER_ID)).toEqual({
      companyId: DEMO_COMPANY_ID,
      platformAssignments: [],
    });
    expect(grantsOf(world, DEMO_OPERATOR_IDS.multi)).toEqual({
      companyId: null,
      platformAssignments: [S, D],
    });
    expect(grantsOf(world, DEMO_OPERATOR_IDS.unassigned)).toEqual({
      companyId: null,
      platformAssignments: [],
    });
    expect(grantsOf(world, null)).toEqual({ companyId: null, platformAssignments: [] });
  });

  it('derives subscription states and expiry from end dates and the clock', () => {
    const states = (platform: typeof S) =>
      organizationsOf(world, platform).map((o) => subscriptionStateOf(world, o.id, NOW).state);
    const count = (list: readonly string[], state: string) =>
      list.filter((s) => s === state).length;
    const school = states(S);
    expect([count(school, 'active'), count(school, 'grace'), count(school, 'none')]).toEqual([
      13, 1, 2,
    ]);
    const drive = states(D);
    expect([count(drive, 'active'), count(drive, 'grace'), count(drive, 'none')]).toEqual([
      7, 0, 1,
    ]);
    // Grace ends 24 hours after the subscription did.
    const alAmal = world.organizations.find((o) => o.name === 'Lycée Al Amal');
    expect(alAmal && subscriptionStateOf(world, alAmal.id, NOW)).toEqual({
      state: 'grace',
      graceEndsAt: '2026-10-24T06:00:00.000Z',
    });
    expect(subscriptionsEndingWithin(world, organizationsOf(world, S), NOW, 14)).toBe(3);
    expect(subscriptionsEndingWithin(world, organizationsOf(world, D), NOW, 14)).toBe(1);
    // A day later, the grace has run out: the Organization has no subscription any more.
    expect(alAmal && subscriptionStateOf(world, alAmal.id, NOW + 25 * 3_600_000).state).toBe(
      'none',
    );
  });

  it('derives growth from creation dates at explicit UTC day boundaries', () => {
    const series = growthSeries(world.organizations, NOW, [30, 21, 14, 7, 0]);
    expect(series).toEqual([
      { day: '2026-09-23', organizations: 21 },
      { day: '2026-10-02', organizations: 21 },
      { day: '2026-10-09', organizations: 22 },
      { day: '2026-10-16', organizations: 23 },
      { day: '2026-10-23', organizations: 24 },
    ]);
  });

  it('orders the Company activity as one stream, newest first', () => {
    const activity = companyActivity(world);
    expect(activity).toHaveLength(7);
    expect(activity.map((e) => e.occurredAt)).toEqual(
      [...activity.map((e) => e.occurredAt)].sort().reverse(),
    );
    expect(new Set(activity.map((e) => e.action))).not.toContain('license.renewed');
  });
});

describe('DemoWorld', () => {
  it('seeds once from the injected clock', () => {
    TestBed.configureTestingModule({ providers: [{ provide: NW_CLOCK, useValue: () => NOW }] });
    expect(TestBed.inject(DemoWorld).snapshot()).toEqual(world);
  });

  it('gives each TestBed a fresh world, and accepts a variant seed', () => {
    TestBed.configureTestingModule({ providers: [{ provide: NW_CLOCK, useValue: () => NOW }] });
    const first = TestBed.inject(DemoWorld);
    TestBed.resetTestingModule();
    const empty = (now: number): DemoWorldTables => ({ ...demoWorldSeed(now), organizations: [] });
    TestBed.configureTestingModule({
      providers: [
        { provide: NW_CLOCK, useValue: () => NOW },
        { provide: DEMO_WORLD_SEED, useValue: empty },
      ],
    });
    const second = TestBed.inject(DemoWorld);
    expect(second).not.toBe(first);
    expect(second.snapshot().organizations).toEqual([]);
    expect(first.snapshot().organizations).toHaveLength(24);
  });
});
