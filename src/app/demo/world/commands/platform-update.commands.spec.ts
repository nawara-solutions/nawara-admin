import { companyId, platformId } from '../../../core/context/scope.model';
import { DemoWorldTables } from '../records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../seed';
import { normalisePlatformPatch, updatePlatform } from './platform.commands';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const seed = demoWorldSeed(NOW);
const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;

const rename = (world: DemoWorldTables, name: string, actor = DEMO_OWNER_ID, id = SCHOOL) =>
  updatePlatform(world, { platformId: id, patch: { name }, actor, now: NOW });

describe('normalisePlatformPatch (Core normaliseUpdatePlatform, M4)', () => {
  it('accepts { name } only, trimmed, 1 to 200 characters', () => {
    expect(normalisePlatformPatch({ name: '  Nawara École  ' })).toEqual({ name: 'Nawara École' });
    expect(normalisePlatformPatch({ name: 'x' })).toEqual({ name: 'x' });
    expect(normalisePlatformPatch({ name: 'x'.repeat(200) })).toEqual({ name: 'x'.repeat(200) });
  });

  it('refuses an empty, blank or too long name, and a missing one, as invalid_platform_request', () => {
    for (const body of [{ name: '' }, { name: '   ' }, { name: 'x'.repeat(201) }, { name: 7 }, {}])
      expect(normalisePlatformPatch(body)).toMatchObject({
        kind: 'validation',
        code: 'invalid_platform_request',
        status: 400,
      });
  });

  it('refuses every other field: the Company, key, product and dates are never editable', () => {
    for (const field of ['companyId', 'id', 'createdAt', 'updatedAt', 'key', 'product'])
      expect(normalisePlatformPatch({ name: 'N', [field]: 'x' })).toMatchObject({
        code: 'invalid_platform_request',
      });
    expect(normalisePlatformPatch(null)).toMatchObject({ status: 400 });
    expect(normalisePlatformPatch(['name'])).toMatchObject({ status: 400 });
  });
});

describe('updatePlatform (demo world command, M4)', () => {
  it('renames only the Platform and records one platform.updated activity', () => {
    const outcome = rename(seed, 'Nawara École');
    if (!outcome.ok) throw new Error('expected success');
    const { world, result } = outcome;
    const before = seed.platforms.find((p) => p.id === SCHOOL)!;
    expect(result).toEqual({ platform: { ...before, name: 'Nawara École' }, changed: true });
    expect(world.platforms.find((p) => p.id === SCHOOL)).toEqual({
      id: SCHOOL,
      companyId: before.companyId,
      name: 'Nawara École',
      key: 'nawara-school',
      product: 'school',
    });
    // Every other record is the same object: nothing is reassigned or recomputed.
    expect(world.platforms.find((p) => p.id === DEMO_DRIVE_PLATFORM_ID)).toBe(
      seed.platforms.find((p) => p.id === DEMO_DRIVE_PLATFORM_ID),
    );
    for (const table of [
      'organizations',
      'assignments',
      'subscriptions',
      'memberships',
      'adminInvitations',
      'invoices',
      'paymentRequests',
      'reconciliationCases',
      'platformCommercial',
      'idempotency',
    ] as const)
      expect(world[table], table).toBe(seed[table]);
    expect(world.company).toBe(seed.company);
    expect(world.sequence).toBe(seed.sequence + 1);
    expect(world.activity).toHaveLength(seed.activity.length + 1);
    expect(world.activity.at(-1)).toEqual({
      id: `platform-activity-updated-${seed.sequence + 1}`,
      platformId: SCHOOL,
      organizationId: null,
      action: 'platform.updated',
      occurredAt: new Date(NOW).toISOString(),
    });
  });

  it('is a no-op for the same name: the same world, no activity', () => {
    const outcome = rename(seed, 'Nawara School');
    expect(outcome).toEqual({
      ok: true,
      world: seed,
      result: { platform: seed.platforms.find((p) => p.id === SCHOOL), changed: false },
    });
  });

  it('refuses an unknown Platform (404) before authority, and anyone but the Company owner (403)', () => {
    expect(
      rename(seed, 'X', DEMO_OWNER_ID, platformId('00000000-0000-4000-8000-000000000000')),
    ).toEqual({
      ok: false,
      error: { kind: 'not_found', code: 'not_found', status: 404 },
    });
    // An operator assigned to the Platform has no configuration authority.
    expect(rename(seed, 'X', DEMO_OPERATOR_IDS.school)).toEqual({
      ok: false,
      error: { kind: 'forbidden', code: 'admin_forbidden', status: 403 },
    });
    // Another Company's Platform is refused, never renamed.
    const foreign = platformId('9e9e9e9e-0000-4000-8000-000000000001');
    const withForeign: DemoWorldTables = {
      ...seed,
      platforms: [
        ...seed.platforms,
        {
          id: foreign,
          companyId: companyId('9e9e9e9e-0000-4000-8000-0000000000c0'),
          name: 'Elsewhere',
          key: null,
          product: null,
        },
      ],
    };
    expect(rename(withForeign, 'Mine now', DEMO_OWNER_ID, foreign)).toMatchObject({
      ok: false,
      error: { code: 'admin_forbidden', status: 403 },
    });
  });
});
