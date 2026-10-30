import { Actor } from '../../../core/auth/actor';
import { AdminScope, CompanyId, PlatformId } from '../../../core/context/scope.model';

/**
 * Which records an assistance read may cover (Assistance A2): the owner's Company, and one of its Platforms when the
 * administrative scope is a Platform. Context selection, never authorization: Core checks the owner and the Platform on every
 * request (`RefundOwnerGuard`, `platformAllowed`) and answers `404` for anything outside them.
 */
export interface AssistanceReadContext {
  readonly companyId: CompanyId;
  /** `null`: company scope ("All platforms"). */
  readonly platformId: PlatformId | null;
}

/**
 * Why no read is made, decided before any request:
 * - `signedOut`: no session;
 * - `notOwner`: an operator (Core's owner routes refuse operators, `403 operation_not_permitted`);
 * - `noScope`: the administrative scope is not known yet;
 * - `platformsUnknown`: a Platform scope while the Company's Platforms are not known (never guessed);
 * - `platformNotInCompany`: a Platform the Company does not have.
 */
export type AssistanceContextRefusal =
  'signedOut' | 'notOwner' | 'noScope' | 'platformsUnknown' | 'platformNotInCompany';

export type AssistanceContextResult =
  | { readonly ok: true; readonly context: AssistanceReadContext }
  | { readonly ok: false; readonly refusal: AssistanceContextRefusal };

/** Pure: the read context of the signed-in actor in a scope, or why there is none. */
export function assistanceReadContext(
  actor: Actor | null,
  scope: AdminScope | null,
  companyPlatforms: readonly PlatformId[] | null,
): AssistanceContextResult {
  if (actor === null) return { ok: false, refusal: 'signedOut' };
  if (actor.kind !== 'owner') return { ok: false, refusal: 'notOwner' };
  if (scope === null) return { ok: false, refusal: 'noScope' };
  if (scope.kind === 'company')
    return { ok: true, context: { companyId: actor.companyId, platformId: null } };
  if (companyPlatforms === null) return { ok: false, refusal: 'platformsUnknown' };
  if (!companyPlatforms.includes(scope.platformId))
    return { ok: false, refusal: 'platformNotInCompany' };
  return { ok: true, context: { companyId: actor.companyId, platformId: scope.platformId } };
}

/**
 * Whether a filter's Platform agrees with the context: under a Platform scope a filter can only narrow to that Platform.
 * `false`: refused locally, never widened and never sent.
 */
export const filterInContext = (
  context: AssistanceReadContext,
  filter: { readonly platformId?: PlatformId },
): boolean =>
  context.platformId === null ||
  filter.platformId === undefined ||
  filter.platformId === context.platformId;

/** One record to open, by its Core id. */
export type AssistanceSelection =
  | { readonly kind: 'case'; readonly requestId: string }
  | { readonly kind: 'lateSettlement'; readonly lateSettlementId: string }
  | { readonly kind: 'recoveryObligation'; readonly obligationId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The selection's id in Core's canonical form (lower case), or `null` when it is not a UUID: Core answers `404` for such an id
 * without reading anything (billing-service `src/assistance/assistance-input.ts:110`), so Admin treats it as not found and sends nothing.
 */
export function selectionId(selection: AssistanceSelection): string | null {
  const id =
    selection.kind === 'case'
      ? selection.requestId
      : selection.kind === 'lateSettlement'
        ? selection.lateSettlementId
        : selection.obligationId;
  return UUID.test(id) ? id.toLowerCase() : null;
}

/**
 * Whether a loaded record belongs to the context's Platform. A record of another Platform is shown as NOT FOUND (Core's one
 * answer for "unknown, or another Company's or Platform's"), never as forbidden, so nothing about it is disclosed.
 */
export const recordInContext = (
  context: AssistanceReadContext,
  record: { readonly platformId: PlatformId },
): boolean => context.platformId === null || record.platformId === context.platformId;
