import { CompanyId, PlatformId, platformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, DemoWorldTables, PlatformRecord } from '../records';

/**
 * Platform commands of the demo world (development builds only): pure functions of the tables, applied through
 * `DemoWorld.commit`. They follow the documented Core contract of `POST /organization/admin/platforms`
 * (docs/CORE-INTEGRATION.md §5: body `{ companyId, name }`, name 1–200, `404 company_not_found` before authority, the owner
 * of that Company only, `403 admin_forbidden` otherwise, `Idempotency-Key` required, a replay answering the first
 * result) and invent nothing else: no slug, product, lifecycle or commercial record. PROVISIONAL: Core's DTO is not
 * verified, and whether Core trims the name is not known (the demo trims it).
 */

export const PLATFORM_NAME_MAX_LENGTH = 200;
export const CREATE_PLATFORM_COMMAND = 'platform.create';

export interface CreatePlatformInput {
  readonly companyId: CompanyId;
  readonly name: string;
  readonly idempotencyKey: string;
  readonly actor: AdminIdentityId;
  /** The instant the command runs at (the injected clock). */
  readonly now: number;
}

export interface CreatePlatformResult {
  readonly platform: PlatformRecord;
  /** A repeat of an already applied request (the same key, actor and request): nothing new was created. */
  readonly replayed: boolean;
}

/** The ids of run-time Platforms: UUID-shaped like the seed's, numbered from the world's sequence, never a seed id. */
export const runtimePlatformId = (n: number): PlatformId =>
  platformId(`5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a${(0x1000 + n).toString(16)}`);

export function createPlatform(
  world: DemoWorldTables,
  input: CreatePlatformInput,
): CommandOutcome<CreatePlatformResult> {
  if (input.companyId !== world.company.id)
    return { ok: false, error: { kind: 'not_found', code: 'company_not_found', status: 404 } };
  if (world.company.ownerId !== input.actor)
    return { ok: false, error: { kind: 'forbidden', code: 'admin_forbidden', status: 403 } };
  const name = input.name.trim();
  if (name.length === 0 || name.length > PLATFORM_NAME_MAX_LENGTH)
    return {
      ok: false,
      error: {
        kind: 'validation',
        messages: [`name must be 1 to ${PLATFORM_NAME_MAX_LENGTH} characters`],
        status: 400,
      },
    };

  const request = JSON.stringify({ companyId: input.companyId, name });
  // Scoped like Core's: (caller, operation, key).
  const previous = world.idempotency.find(
    (r) =>
      r.key === input.idempotencyKey &&
      r.command === CREATE_PLATFORM_COMMAND &&
      r.actor === input.actor,
  );
  if (previous) {
    const platform = world.platforms.find((p) => p.id === previous.resultId);
    if (previous.request === request && platform)
      return { ok: true, world, result: { platform, replayed: true } };
    // The key was used for another request: refused, never a silent success or a second Platform.
    return { ok: false, error: { kind: 'conflict', code: 'idempotency_key_reused', status: 422 } };
  }

  const sequence = world.sequence + 1;
  const platform: PlatformRecord = {
    id: runtimePlatformId(sequence),
    companyId: world.company.id,
    name,
    key: null,
    product: null,
  };
  return {
    ok: true,
    result: { platform, replayed: false },
    world: {
      ...world,
      sequence,
      platforms: [...world.platforms, platform],
      activity: [
        ...world.activity,
        {
          id: `platform-activity-created-${sequence}`,
          platformId: platform.id,
          organizationId: null,
          action: 'platform.created',
          occurredAt: new Date(input.now).toISOString(),
        },
      ],
      idempotency: [
        ...world.idempotency,
        {
          key: input.idempotencyKey,
          command: CREATE_PLATFORM_COMMAND,
          actor: input.actor,
          request,
          resultId: platform.id,
        },
      ],
    },
  };
}

// ── Platform edit (M4) ─────────────────────────────────────────────────────────────────────────────────────────────
// Core, verified at nawara-core `b1baacc`: `PATCH /organization/admin/platforms/:id` (organization-service
// `admin/admin.controller.ts` `updatePlatform`): the body holds `name` only (`domain/platform-input.ts`
// `normaliseUpdatePlatform`: unknown fields refused, `id`, `companyId`, `createdAt`, `updatedAt` refused as immutable,
// at least one field, the name 1–200 after trimming and stored trimmed); the Platform (`404`), then authority (the owner
// of its Company only, `canUpdatePlatform`; `403 admin_forbidden`); NOT sensitive, so no step-up and no idempotency key;
// no version check. The same name changes nothing and records nothing (`platform.repository.ts` `update`).

export const UPDATE_PLATFORM_COMMAND = 'platform.update';

/** The one field Core's PATCH accepts, trimmed. */
export interface NormalisedPlatformPatch {
  readonly name: string;
}

const PLATFORM_IMMUTABLE_FIELDS: readonly string[] = ['id', 'companyId', 'createdAt', 'updatedAt'];

const invalidPlatformRequest = (message: string): AppError => ({
  kind: 'validation',
  code: 'invalid_platform_request',
  messages: [message],
  status: 400,
});

/** The body as Core's `normaliseUpdatePlatform` reads it: `{ name }` only, a non-blank name of at most 200 characters. */
export function normalisePlatformPatch(raw: unknown): NormalisedPlatformPatch | AppError {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    return invalidPlatformRequest('body must be an object');
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (PLATFORM_IMMUTABLE_FIELDS.includes(key))
      return invalidPlatformRequest(`${key} cannot be changed`);
    if (key !== 'name') return invalidPlatformRequest(`unknown field ${key}`);
  }
  if (!('name' in body)) return invalidPlatformRequest('at least one field is required');
  const name = body['name'];
  if (
    typeof name !== 'string' ||
    name.trim() === '' ||
    name.trim().length > PLATFORM_NAME_MAX_LENGTH
  )
    return invalidPlatformRequest(`name must be 1 to ${PLATFORM_NAME_MAX_LENGTH} characters`);
  return { name: name.trim() };
}

/** Core's `platformAuthority`: the owner of the Platform's Company, never an operator (an assignment confers nothing). */
export const mayUpdatePlatform = (
  world: DemoWorldTables,
  actor: AdminIdentityId,
  platform: PlatformRecord,
): boolean => platform.companyId === world.company.id && world.company.ownerId === actor;

export interface UpdatePlatformInput {
  readonly platformId: PlatformId;
  readonly patch: NormalisedPlatformPatch;
  readonly actor: AdminIdentityId;
  readonly now: number;
}

export interface UpdatePlatformResult {
  readonly platform: PlatformRecord;
  /** Whether the name really changed (the same name is a no-op, as in Core). */
  readonly changed: boolean;
}

/**
 * Renames one Platform: only its name. Its id, Company, key, product, Organizations, assignments, subscriptions and
 * financial facts are untouched. The same name returns the world unchanged (no activity); a real change appends one
 * simulated `platform.updated` activity record. No idempotency record: the PATCH has no key.
 */
export function updatePlatform(
  world: DemoWorldTables,
  input: UpdatePlatformInput,
): CommandOutcome<UpdatePlatformResult> {
  const current = world.platforms.find((p) => p.id === input.platformId);
  if (current === undefined)
    return { ok: false, error: { kind: 'not_found', code: 'not_found', status: 404 } };
  if (!mayUpdatePlatform(world, input.actor, current))
    return { ok: false, error: { kind: 'forbidden', code: 'admin_forbidden', status: 403 } };
  if (input.patch.name === current.name)
    return { ok: true, world, result: { platform: current, changed: false } };

  const sequence = world.sequence + 1;
  const platform: PlatformRecord = { ...current, name: input.patch.name };
  return {
    ok: true,
    result: { platform, changed: true },
    world: {
      ...world,
      sequence,
      platforms: world.platforms.map((p) => (p.id === current.id ? platform : p)),
      activity: [
        ...world.activity,
        {
          id: `platform-activity-updated-${sequence}`,
          platformId: current.id,
          organizationId: null,
          action: 'platform.updated',
          occurredAt: new Date(input.now).toISOString(),
        },
      ],
    },
  };
}
