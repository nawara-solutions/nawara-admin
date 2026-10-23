import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { OrganizationMetadata } from './organization.model';
import {
  OPTIONAL_ORGANIZATION_FIELDS,
  OrganizationDraft,
  OrganizationField,
} from './create-organization.model';

/**
 * Editing an Organization's metadata (Core `PATCH /organization/admin/organizations/:id`, verified in P3b-0;
 * docs/CORE-INTEGRATION.md §5): any of the five editable fields, at least one; `null` clears an optional field; the
 * name can never be cleared; no step-up, no idempotency key, no version. Everything here is pure.
 */

/** The fields the PATCH accepts, in the dialog's order. */
export const EDITABLE_FIELDS = [
  'name',
  'type',
  'taxCode',
  'phone',
  'address',
] as const satisfies readonly OrganizationField[];

/** An Organization's editable values as loaded: the name, and each optional field or `null` when not set. */
export type OrganizationValues = { readonly name: string } & OrganizationMetadata;

/** What is sent: only the fields that change; a cleared optional field is `null`. Never an immutable field. */
export type OrganizationPatch = Partial<{
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly type: string | null;
}>;

/** Core's answer (`200`, `OrganizationDto`). */
export interface UpdatedOrganization {
  readonly id: OrganizationId;
  readonly platformId: PlatformId;
  readonly name: string;
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly type: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** How a field compares with the loaded value: the same, a new value, or a value that saving removes. */
export type FieldChange = 'unchanged' | 'changed' | 'removed';

/** The draft the dialog starts from: the loaded values, an unset field as empty text. */
export function draftOf(values: OrganizationValues): OrganizationDraft {
  return {
    name: values.name,
    taxCode: values.taxCode ?? '',
    address: values.address ?? '',
    phone: values.phone ?? '',
    type: values.type ?? '',
  };
}

const isOptional = (field: OrganizationField) =>
  (OPTIONAL_ORGANIZATION_FIELDS as readonly string[]).includes(field);

/** A typed value as it would be stored: trimmed; an empty optional field is `null`. */
function normalised(field: OrganizationField, typed: string): string | null {
  const value = typed.trim();
  return value === '' && isOptional(field) ? null : value;
}

export function fieldChange(
  original: OrganizationValues,
  draft: OrganizationDraft,
  field: OrganizationField,
): FieldChange {
  const next = normalised(field, draft[field]);
  if (next === original[field]) return 'unchanged';
  return next === null ? 'removed' : 'changed';
}

/** The minimal patch: the fields whose normalised value differs from the loaded one. Empty when nothing changes. */
export function patchFrom(
  original: OrganizationValues,
  draft: OrganizationDraft,
): OrganizationPatch {
  const patch: Record<string, string | null> = {};
  for (const field of EDITABLE_FIELDS)
    if (fieldChange(original, draft, field) !== 'unchanged')
      patch[field] = normalised(field, draft[field]);
  return patch as OrganizationPatch;
}

export const isEmptyPatch = (patch: OrganizationPatch) => Object.keys(patch).length === 0;

/**
 * Moves a draft onto newer values (after reloading the Organization): a field the person did not change takes the
 * current value; a field they changed keeps their value, so it is compared with the current one and only re-sent if
 * they save again. Nothing of anyone else's change is overwritten by a field the person never touched.
 */
export function rebaseDraft(
  previous: OrganizationValues,
  current: OrganizationValues,
  draft: OrganizationDraft,
): OrganizationDraft {
  const next = draftOf(current);
  const rebased: Record<string, string> = { ...draft };
  for (const field of EDITABLE_FIELDS)
    if (fieldChange(previous, draft, field) === 'unchanged') rebased[field] = next[field];
  return rebased as OrganizationDraft;
}

/** The values after a successful update, for a dialog that keeps editing (e.g. after recovering an unknown outcome). */
export const valuesOf = (organization: UpdatedOrganization): OrganizationValues => ({
  name: organization.name,
  taxCode: organization.taxCode,
  address: organization.address,
  phone: organization.phone,
  type: organization.type,
});
