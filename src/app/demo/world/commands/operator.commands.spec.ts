import { platformId } from '../../../core/context/scope.model';
import { CommandOutcome } from '../demo-world';
import { DemoWorldTables, adminIdentityId } from '../records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../seed';
import {
  activeAssignments,
  assignmentHistoryOf,
  assignmentsOf,
  grantsOf,
  platformViewerOf,
  uniqueAssignedOperators,
} from '../selectors';
import {
  PlatformAssignmentChange,
  createdAssignmentId,
  grantPlatformAssignment,
  revokePlatformAssignment,
} from './operator.commands';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;
const ID = DEMO_OPERATOR_IDS;

const change = (over: Partial<PlatformAssignmentChange> = {}): PlatformAssignmentChange => ({
  actor: DEMO_OWNER_ID,
  operatorId: ID.unassigned,
  platformId: S,
  now: NOW,
  ...over,
});

function ok<R>(outcome: CommandOutcome<R>): { world: DemoWorldTables; result: R } {
  if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
  return outcome;
}

/** The tables a Platform access change must never touch. */
const UNTOUCHED = [
  'company',
  'platforms',
  'organizations',
  'identities',
  'operators',
  'subscriptions',
  'adminInvitations',
  'members',
  'memberships',
  'paymentIssues',
  'platformCommercial',
  'inboxes',
  'idempotency',
] as const;

describe('grantPlatformAssignment (P6-S2)', () => {
  const seed = demoWorldSeed(NOW);

  it('appends exactly one active record, owned by the owner, and one activity; the history is kept', () => {
    const { world, result } = ok(grantPlatformAssignment(change())(seed));
    expect(world.assignments).toHaveLength(seed.assignments.length + 1);
    expect(world.assignments.slice(0, -1)).toEqual(seed.assignments);
    expect(result).toEqual({
      id: createdAssignmentId(1),
      operatorId: ID.unassigned,
      platformId: S,
      assignedBy: DEMO_OWNER_ID,
      assignedAt: new Date(NOW).toISOString(),
      revokedAt: null,
      revokedBy: null,
    });
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(seed.assignments.some((a) => a.id === result.id)).toBe(false);
    // The earlier removed School record is untouched; the operator now has two School records, one active.
    expect(assignmentHistoryOf(world, ID.unassigned).map((a) => a.revokedAt === null)).toEqual([
      false,
      true,
    ]);
    expect(world.sequence).toBe(seed.sequence + 1);
    expect(world.activity.at(-1)).toEqual({
      id: 'operator-activity-assigned-1',
      platformId: S,
      organizationId: null,
      action: 'operator.assigned',
      occurredAt: new Date(NOW).toISOString(),
    });
    for (const table of UNTOUCHED) expect(world[table]).toEqual(seed[table]);
    // Grants and counts follow the active records.
    expect(grantsOf(world, ID.unassigned).platformAssignments).toEqual([S]);
    expect(assignmentsOf(world, S)).toHaveLength(4);
    expect(uniqueAssignedOperators(world)).toBe(5);
  });

  it('refuses an already active assignment with 409 assignment_conflict and changes nothing', () => {
    const outcome = grantPlatformAssignment(change({ operatorId: ID.school }))(seed);
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'conflict', code: 'assignment_conflict', status: 409 },
    });
    const once = ok(grantPlatformAssignment(change())(seed)).world;
    // A second grant of the same pair (a competing request that committed first) is the same 409.
    expect(grantPlatformAssignment(change())(once).ok).toBe(false);
    expect(activeAssignments(once).filter((a) => a.operatorId === ID.unassigned)).toHaveLength(1);
  });

  it('is the owner’s only: an operator (even for themselves) or no actor gets 403', () => {
    for (const actor of [ID.multi, ID.unassigned, null, adminIdentityId('nobody')]) {
      const outcome = grantPlatformAssignment(change({ actor }))(seed);
      expect(outcome.ok ? null : outcome.error.status).toBe(403);
    }
  });

  it('answers the collapsed 404 for an unknown or foreign operator or Platform', () => {
    for (const over of [
      { operatorId: adminIdentityId('another-company-operator') },
      { operatorId: DEMO_OWNER_ID },
      { platformId: platformId('another-company-platform') },
    ]) {
      const outcome = grantPlatformAssignment(change(over))(seed);
      expect(outcome.ok ? null : outcome.error).toEqual({
        kind: 'not_found',
        code: 'not_found',
        status: 404,
      });
    }
  });

  it('grants a blocked operator as Core does (the block still denies everything)', () => {
    const { world } = ok(
      grantPlatformAssignment(change({ operatorId: ID.blocked, platformId: D }))(seed),
    );
    expect(activeAssignments(world).some((a) => a.operatorId === ID.blocked)).toBe(true);
    expect(world.operators).toEqual(seed.operators);
  });
});

describe('revokePlatformAssignment (P6-S2)', () => {
  const seed = demoWorldSeed(NOW);

  it('marks exactly the current active record removed by the owner, keeps every other, records one activity', () => {
    const before = seed.assignments.find((a) => a.operatorId === ID.phone && a.revokedAt === null)!;
    const { world, result } = ok(
      revokePlatformAssignment(change({ operatorId: ID.phone, platformId: D }))(seed),
    );
    expect(result).toEqual({
      ...before,
      revokedAt: new Date(NOW).toISOString(),
      revokedBy: DEMO_OWNER_ID,
    });
    expect(world.assignments).toHaveLength(seed.assignments.length);
    expect(world.assignments.filter((a, i) => a !== seed.assignments[i]).map((a) => a.id)).toEqual([
      before.id,
    ]);
    expect(result.revokedAt! >= result.assignedAt).toBe(true);
    expect(world.activity.at(-1)).toMatchObject({
      id: 'operator-activity-unassigned-1',
      action: 'operator.unassigned',
      platformId: D,
      organizationId: null,
    });
    for (const table of UNTOUCHED) expect(world[table]).toEqual(seed[table]);
    // The removed Platform no longer authorizes the operator: grants and every Platform check say so at once.
    expect(grantsOf(world, ID.phone).platformAssignments).toEqual([]);
    expect(platformViewerOf(world, ID.phone, D)).toBeNull();
    expect(assignmentsOf(world, D)).toHaveLength(1);
  });

  it('answers the collapsed 404 when nothing is active: never assigned, or already removed (a repeat)', () => {
    const notFound = { kind: 'not_found', code: 'not_found', status: 404 };
    const never = revokePlatformAssignment(change({ operatorId: ID.school, platformId: D }))(seed);
    expect(never.ok ? null : never.error).toEqual(notFound);
    const onlyRemoved = revokePlatformAssignment(
      change({ operatorId: ID.unassigned, platformId: S }),
    )(seed);
    expect(onlyRemoved.ok ? null : onlyRemoved.error).toEqual(notFound);
    const once = ok(
      revokePlatformAssignment(change({ operatorId: ID.school, platformId: S }))(seed),
    ).world;
    const again = revokePlatformAssignment(change({ operatorId: ID.school, platformId: S }))(once);
    expect(again.ok ? null : again.error).toEqual(notFound);
  });

  it('is the owner’s only, Company-scoped, like grant', () => {
    const asOperator = revokePlatformAssignment(
      change({ actor: ID.school, operatorId: ID.school }),
    )(seed);
    expect(asOperator.ok ? null : asOperator.error.status).toBe(403);
    const foreign = revokePlatformAssignment(change({ operatorId: adminIdentityId('x') }))(seed);
    expect(foreign.ok ? null : foreign.error.status).toBe(404);
  });

  it('keeps at most one active record per operator and Platform through grant, removal and re-grant', () => {
    let world = seed;
    const pair = change({ operatorId: ID.multi, platformId: D });
    world = ok(revokePlatformAssignment({ ...pair, now: NOW })(world)).world;
    world = ok(grantPlatformAssignment({ ...pair, now: NOW + 1000 })(world)).world;
    world = ok(revokePlatformAssignment({ ...pair, now: NOW + 2000 })(world)).world;
    world = ok(grantPlatformAssignment({ ...pair, now: NOW + 3000 })(world)).world;
    const records = assignmentHistoryOf(world, ID.multi).filter((a) => a.platformId === D);
    expect(records).toHaveLength(3);
    expect(records.filter((a) => a.revokedAt === null)).toHaveLength(1);
    const keys = activeAssignments(world).map((a) => `${a.operatorId}/${a.platformId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(world.assignments.map((a) => a.id)).size).toBe(world.assignments.length);
  });
});
