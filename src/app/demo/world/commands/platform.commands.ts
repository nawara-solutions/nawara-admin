import { CompanyId, PlatformId, platformId } from '../../../core/context/scope.model';
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
  const previous = world.idempotency.find((r) => r.key === input.idempotencyKey);
  if (previous) {
    const platform = world.platforms.find((p) => p.id === previous.resultId);
    if (
      previous.command === CREATE_PLATFORM_COMMAND &&
      previous.actor === input.actor &&
      previous.request === request &&
      platform
    )
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
