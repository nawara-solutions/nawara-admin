import { OrganizationId, PlatformId } from '../../../core/context/scope.model';

/**
 * Creating an Organization under a Platform (Core `POST /organization/admin/organizations`, source-verified in P3b-0;
 * docs/CORE-INTEGRATION.md §5). The request holds exactly Core's fields; the step-up token and the idempotency key travel
 * beside it. No lifecycle, provisioning or readiness state exists in Core, so none is modelled.
 */
export interface CreateOrganizationRequest {
  /** The Platform in the URL, once its access is granted; never typed by the person. */
  readonly platformId: PlatformId;
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  /** Opaque free text: Core never validates or interprets it. */
  readonly type: string | null;
}

/** Core's answer (`OrganizationDto`), and whether it was a replay (`200`, `Idempotent-Replayed: true`). */
export interface CreatedOrganization {
  readonly organization: {
    readonly id: OrganizationId;
    readonly platformId: PlatformId;
    readonly name: string;
    readonly taxCode: string | null;
    readonly address: string | null;
    readonly phone: string | null;
    readonly type: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
  };
  readonly replayed: boolean;
}

/** Core's limits (organization-service `domain/input.ts`): every value is checked trimmed. */
export const ORGANIZATION_FIELD_LIMITS = {
  name: 200,
  taxCode: 64,
  address: 500,
  phone: 32,
  type: 64,
} as const;

export type OrganizationField = keyof typeof ORGANIZATION_FIELD_LIMITS;
export const OPTIONAL_ORGANIZATION_FIELDS = ['taxCode', 'address', 'phone', 'type'] as const;
export type OptionalOrganizationField = (typeof OPTIONAL_ORGANIZATION_FIELDS)[number];

export type FieldProblem = 'required' | 'tooLong';

/** The person's values, as typed. */
export type OrganizationDraft = Readonly<Record<OrganizationField, string>>;

/** Pure: each field's problem (name required; every field within its limit once trimmed). */
export function draftProblems(
  draft: OrganizationDraft,
): Partial<Record<OrganizationField, FieldProblem>> {
  const problems: Partial<Record<OrganizationField, FieldProblem>> = {};
  if (draft.name.trim() === '') problems.name = 'required';
  for (const field of Object.keys(ORGANIZATION_FIELD_LIMITS) as OrganizationField[])
    if (draft[field].trim().length > ORGANIZATION_FIELD_LIMITS[field]) problems[field] = 'tooLong';
  return problems;
}

/** The request for a valid draft: trimmed values; a blank optional field is sent as `null` (Core refuses ""). */
export function requestFrom(
  platformId: PlatformId,
  draft: OrganizationDraft,
): CreateOrganizationRequest {
  const optional = (value: string) => (value.trim() === '' ? null : value.trim());
  return {
    platformId,
    name: draft.name.trim(),
    taxCode: optional(draft.taxCode),
    address: optional(draft.address),
    phone: optional(draft.phone),
    type: optional(draft.type),
  };
}
