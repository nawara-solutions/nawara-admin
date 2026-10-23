import { AppError } from '../../../core/errors/app-error';
import { OrganizationId, PlatformId, organizationId } from '../../../core/context/scope.model';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, DemoWorldTables, OrganizationRecord } from '../records';
import { assignedPlatformsOf } from '../selectors';

/**
 * Organization commands of the demo world (development builds only), applied through `DemoWorld.commit`. They follow
 * the source-verified Core contract of `POST /organization/admin/organizations` (P3b-0; organization-service
 * `admin.controller.ts`, `organization-input.ts`, `input.ts`, `authorization-evaluator.ts`,
 * `organization.repository.ts`, `idempotency.service.ts`): the request, then the parent Platform, then authority (owner
 * of its Company, or an operator assigned to it), then the replay record. A record only: no status, provisioning,
 * readiness or activation exists in Core, so none is created here.
 */

export const CREATE_ORGANIZATION_COMMAND = 'organization.create';

/** Core's limits (organization-service `domain/input.ts` `LIMITS`). */
export const ORGANIZATION_LIMITS = {
  name: 200,
  taxCode: 64,
  address: 500,
  phone: 32,
  type: 64,
} as const;

export const ORGANIZATION_OPTIONAL_FIELDS = ['taxCode', 'address', 'phone', 'type'] as const;
export type OrganizationOptionalField = (typeof ORGANIZATION_OPTIONAL_FIELDS)[number];

/** The request as Core normalises it: trimmed text, `null` for an absent optional field. */
export interface NormalisedOrganizationRequest {
  readonly platformId: PlatformId;
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly type: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = ['platformId', 'name', ...ORGANIZATION_OPTIONAL_FIELDS];

const invalid = (field: string): AppError => ({
  kind: 'validation',
  messages: [`${field} is not valid`],
  status: 400,
});

/**
 * Core's `normaliseCreateOrganization`: an object with only the known fields; `platformId` a UUID; `name` non-blank and
 * at most 200 characters once trimmed; each optional field absent, `null`, or a non-blank string within its limit
 * (an empty string is refused, as in Core). Answers the normalised request, or Core's `400`.
 */
export function normaliseOrganizationRequest(
  raw: unknown,
): NormalisedOrganizationRequest | AppError {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalid('body');
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!ALLOWED.includes(key)) return invalid(key);
  const platform = body['platformId'];
  if (typeof platform !== 'string' || !UUID.test(platform)) return invalid('platformId');
  const text = (
    field: keyof typeof ORGANIZATION_LIMITS,
    required: boolean,
  ): string | null | AppError => {
    const value = body[field];
    if (!required && (value === undefined || value === null)) return null;
    if (
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.trim().length > ORGANIZATION_LIMITS[field]
    )
      return invalid(field);
    return value.trim();
  };
  const name = text('name', true);
  if (typeof name !== 'string') return name ?? invalid('name');
  const optional: Partial<Record<OrganizationOptionalField, string | null>> = {};
  for (const field of ORGANIZATION_OPTIONAL_FIELDS) {
    const value = text(field, false);
    if (value !== null && typeof value !== 'string') return value;
    optional[field] = value;
  }
  return {
    platformId: platform.toLowerCase() as PlatformId,
    name,
    taxCode: optional.taxCode ?? null,
    address: optional.address ?? null,
    phone: optional.phone ?? null,
    type: optional.type ?? null,
  };
}

/**
 * Core's authority over a Platform's Organizations (`canCreateOrganization`, and the same rule for editing one): the
 * owner of the Platform's Company, or an operator assigned to the Platform. Organization admins are not Admin actors.
 */
export function organizationAuthority(
  world: DemoWorldTables,
  actor: AdminIdentityId,
  platform: PlatformId,
): 'owner' | 'operator' | null {
  const record = world.platforms.find((p) => p.id === platform);
  if (record === undefined) return null;
  if (world.company.ownerId === actor && record.companyId === world.company.id) return 'owner';
  const identity = world.identities.find((i) => i.id === actor);
  if (identity?.kind === 'operator' && assignedPlatformsOf(world, actor).includes(platform))
    return 'operator';
  return null;
}

export interface CreateOrganizationInput {
  readonly request: NormalisedOrganizationRequest;
  readonly idempotencyKey: string;
  readonly actor: AdminIdentityId;
  readonly now: number;
}

export interface CreateOrganizationResult {
  readonly organization: OrganizationRecord;
  readonly replayed: boolean;
}

/** The ids of run-time Organizations: UUID-shaped like the seed's, numbered from the world's sequence. */
export const runtimeOrganizationId = (n: number) =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b${(0x1000 + n).toString(16)}`);

export function createOrganization(
  world: DemoWorldTables,
  input: CreateOrganizationInput,
): CommandOutcome<CreateOrganizationResult> {
  const { request } = input;
  if (!world.platforms.some((p) => p.id === request.platformId))
    return { ok: false, error: { kind: 'not_found', code: 'not_found', status: 404 } };
  if (organizationAuthority(world, input.actor, request.platformId) === null)
    return { ok: false, error: { kind: 'forbidden', code: 'admin_forbidden', status: 403 } };

  // Replay: scoped like Core's (caller, operation, key) and compared on the normalised request.
  const fingerprint = JSON.stringify(request);
  const previous = world.idempotency.find(
    (r) =>
      r.key === input.idempotencyKey &&
      r.command === CREATE_ORGANIZATION_COMMAND &&
      r.actor === input.actor,
  );
  if (previous) {
    const organization = world.organizations.find((o) => o.id === previous.resultId);
    if (previous.request === fingerprint && organization)
      return { ok: true, world, result: { organization, replayed: true } };
    return { ok: false, error: { kind: 'conflict', code: 'idempotency_key_reused', status: 422 } };
  }

  const sequence = world.sequence + 1;
  const createdAt = new Date(input.now).toISOString();
  const organization: OrganizationRecord = {
    id: runtimeOrganizationId(sequence),
    platformId: request.platformId,
    name: request.name,
    createdAt,
    // Organizations inherit their Platform's assisted-payments setting until overridden.
    assistedPayments: 'inherit',
    taxCode: request.taxCode,
    address: request.address,
    phone: request.phone,
    type: request.type,
    updatedAt: createdAt,
  };
  return {
    ok: true,
    result: { organization, replayed: false },
    world: {
      ...world,
      sequence,
      organizations: [...world.organizations, organization],
      activity: [
        ...world.activity,
        {
          id: `organization-activity-created-${sequence}`,
          platformId: request.platformId,
          organizationId: organization.id,
          action: 'organization.created',
          occurredAt: createdAt,
        },
      ],
      idempotency: [
        ...world.idempotency,
        {
          key: input.idempotencyKey,
          command: CREATE_ORGANIZATION_COMMAND,
          actor: input.actor,
          request: fingerprint,
          resultId: organization.id,
        },
      ],
    },
  };
}

export const UPDATE_ORGANIZATION_COMMAND = 'organization.update';

/** The editable fields of `PATCH /organization/admin/organizations/:id`; anything else (id, platformId, …) is refused. */
export const EDITABLE_ORGANIZATION_FIELDS = ['name', ...ORGANIZATION_OPTIONAL_FIELDS] as const;
export type EditableOrganizationField = (typeof EDITABLE_ORGANIZATION_FIELDS)[number];

/** A normalised patch: only the supplied fields; `name` a non-blank string, an optional field a string or `null`. */
export type NormalisedOrganizationPatch = Partial<{
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly type: string | null;
}>;

/**
 * The verified PATCH rules (docs/CORE-INTEGRATION.md §5): an object with at least one editable field and nothing else;
 * `name` non-blank and within its limit once trimmed (it can never be cleared); an optional field `null` (cleared) or a
 * non-blank string within its limit (an empty string is refused, as on create). Answers the patch, or Core's `400`.
 */
export function normaliseOrganizationPatch(raw: unknown): NormalisedOrganizationPatch | AppError {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return invalid('body');
  const body = raw as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length === 0) return invalid('body');
  for (const key of keys)
    if (!(EDITABLE_ORGANIZATION_FIELDS as readonly string[]).includes(key)) return invalid(key);
  const patch: Record<string, string | null> = {};
  for (const field of EDITABLE_ORGANIZATION_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    if (value === null && field !== 'name') {
      patch[field] = null;
      continue;
    }
    if (
      typeof value !== 'string' ||
      value.trim() === '' ||
      value.trim().length > ORGANIZATION_LIMITS[field]
    )
      return invalid(field);
    patch[field] = value.trim();
  }
  return patch as NormalisedOrganizationPatch;
}

export interface UpdateOrganizationInput {
  readonly organizationId: OrganizationId;
  readonly patch: NormalisedOrganizationPatch;
  readonly actor: AdminIdentityId;
  readonly now: number;
}

export interface UpdateOrganizationResult {
  readonly organization: OrganizationRecord;
  /** Whether anything differed: a patch that changes nothing writes nothing. */
  readonly changed: boolean;
}

/**
 * Updates one Organization's metadata: only the supplied fields, never its id, Platform, creation date, counts,
 * assisted-payments override or any other record. A patch whose values equal the current ones is a no-op (the same
 * world, no `updatedAt` change, no activity), as in Core; a real change sets `updatedAt` and appends one simulated
 * `organization.updated` activity record. No idempotency record: the PATCH has no key.
 */
export function updateOrganization(
  world: DemoWorldTables,
  input: UpdateOrganizationInput,
): CommandOutcome<UpdateOrganizationResult> {
  const current = world.organizations.find((o) => o.id === input.organizationId);
  if (current === undefined)
    return { ok: false, error: { kind: 'not_found', code: 'not_found', status: 404 } };
  if (organizationAuthority(world, input.actor, current.platformId) === null)
    return { ok: false, error: { kind: 'forbidden', code: 'admin_forbidden', status: 403 } };

  const changes = (Object.keys(input.patch) as EditableOrganizationField[]).filter(
    (field) => input.patch[field] !== current[field],
  );
  if (changes.length === 0)
    return { ok: true, world, result: { organization: current, changed: false } };

  const sequence = world.sequence + 1;
  const updatedAt = new Date(input.now).toISOString();
  const organization: OrganizationRecord = { ...current, ...input.patch, updatedAt };
  return {
    ok: true,
    result: { organization, changed: true },
    world: {
      ...world,
      sequence,
      organizations: world.organizations.map((o) => (o.id === current.id ? organization : o)),
      activity: [
        ...world.activity,
        {
          id: `organization-activity-updated-${sequence}`,
          platformId: current.platformId,
          organizationId: current.id,
          action: 'organization.updated',
          occurredAt: updatedAt,
        },
      ],
    },
  };
}
