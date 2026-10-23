import { CommandOutcome } from '../demo-world';
import { DEMO_COMPANY_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID, demoWorldSeed } from '../seed';
import { assignmentsOf, organizationsOf, platformCommercialOf, platformRefs } from '../selectors';
import { DemoWorldTables } from '../records';
import { CreatePlatformResult, createPlatform, runtimePlatformId } from './platform.commands';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const seed = demoWorldSeed(NOW);
const input = (name: string, key = 'key-1') => ({
  companyId: DEMO_COMPANY_ID,
  name,
  idempotencyKey: key,
  actor: DEMO_OWNER_ID,
  now: NOW,
});
const applied = (
  outcome: CommandOutcome<CreatePlatformResult>,
): { world: DemoWorldTables; result: CreatePlatformResult } => {
  if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
  return outcome;
};

describe('createPlatform (demo world command)', () => {
  it('adds exactly one empty Platform with a stable new id, an activity record and a replay record', () => {
    const { world, result } = applied(createPlatform(seed, input('  Nawara Academy ')));
    expect(result).toEqual({
      replayed: false,
      platform: {
        id: runtimePlatformId(1),
        companyId: DEMO_COMPANY_ID,
        name: 'Nawara Academy',
        key: null,
        product: null,
      },
    });
    expect(world.platforms).toHaveLength(seed.platforms.length + 1);
    expect(new Set(world.platforms.map((p) => p.id)).size).toBe(world.platforms.length);
    expect(organizationsOf(world, result.platform.id)).toEqual([]);
    expect(assignmentsOf(world, result.platform.id)).toEqual([]);
    expect(platformCommercialOf(world, result.platform.id)).toBeUndefined();
    expect(world.activity.at(-1)).toEqual({
      id: 'platform-activity-created-1',
      platformId: result.platform.id,
      organizationId: null,
      action: 'platform.created',
      occurredAt: '2026-10-23T12:00:00.000Z',
    });
    expect(world.sequence).toBe(1);
    // The seed records are untouched.
    expect(world.organizations).toBe(seed.organizations);
    expect(world.platforms.slice(0, 2)).toEqual(seed.platforms);
    expect(platformRefs(world).map((p) => p.name)).toEqual([
      'Nawara School',
      'Nawara Drive',
      'Nawara Academy',
    ]);
  });

  it('is deterministic: the same world and request give the same result', () => {
    expect(createPlatform(seed, input('Nawara Academy'))).toEqual(
      createPlatform(seed, input('Nawara Academy')),
    );
  });

  it('replays a repeat of the same request instead of creating a second Platform', () => {
    const first = applied(createPlatform(seed, input('Nawara Academy')));
    const again = applied(createPlatform(first.world, input('Nawara Academy')));
    expect(again.result).toEqual({ ...first.result, replayed: true });
    expect(again.world).toBe(first.world);
  });

  it('refuses a key reused with different details, or by another actor, without changing anything', () => {
    const first = applied(createPlatform(seed, input('Nawara Academy')));
    expect(createPlatform(first.world, input('Nawara Academy 2'))).toEqual({
      ok: false,
      error: { kind: 'conflict', code: 'idempotency_key_reused', status: 422 },
    });
    expect(
      createPlatform(first.world, { ...input('Nawara Academy'), actor: DEMO_OPERATOR_IDS.multi })
        .ok,
    ).toBe(false);
  });

  it('follows Core’s documented order and bounds: Company first, then authority, then the name', () => {
    expect(
      createPlatform(seed, { ...input('X'), companyId: 'nope' as typeof DEMO_COMPANY_ID }),
    ).toMatchObject({
      ok: false,
      error: { code: 'company_not_found', status: 404 },
    });
    expect(createPlatform(seed, { ...input('X'), actor: DEMO_OPERATOR_IDS.multi })).toMatchObject({
      ok: false,
      error: { code: 'admin_forbidden', status: 403 },
    });
    expect(createPlatform(seed, input('   '))).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    });
    expect(createPlatform(seed, input('x'.repeat(201)))).toMatchObject({
      ok: false,
      error: { kind: 'validation' },
    });
    expect(createPlatform(seed, input('x'.repeat(200))).ok).toBe(true);
  });

  it('numbers later Platforms on, never reusing an id', () => {
    const one = applied(createPlatform(seed, input('A', 'k1')));
    const two = applied(createPlatform(one.world, input('B', 'k2')));
    expect(two.result.platform.id).toBe(runtimePlatformId(2));
    expect(two.world.platforms.map((p) => p.id)).toEqual([
      ...seed.platforms.map((p) => p.id),
      runtimePlatformId(1),
      runtimePlatformId(2),
    ]);
  });
});
