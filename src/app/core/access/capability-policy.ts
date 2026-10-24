import { Actor } from '../auth/actor';
import { PlatformId } from '../context/scope.model';

/**
 * UX capabilities (docs/ARCHITECTURE.md §10). They decide what the interface offers, never what is allowed: Core
 * authorizes every request and answers `403`/`404` whatever the UI showed. Each rule mirrors a documented Core rule.
 */
export type Capability =
  /**
   * The Company's company-wide destinations as a whole (docs/ARCHITECTURE.md §7: company scope is the owner's only).
   * Navigation uses it for destinations that are not built yet; each one gets its own capability when it is built.
   */
  | 'company.scope'
  /** Company-wide administration ("All platforms"): the owner of the Company only. */
  | 'company.overview.view'
  /** The Company's Platform directory (`/platforms`): company scope, so the owner only. */
  | 'company.platforms.view'
  /**
   * The Company's operators and their Platform access (`/operators`): the owner only. Core's operator routes are all
   * `@Actors('owner')` (an operator gets `403`); an operator's own authority is their assignments, never this list.
   */
  | 'company.operators.view'
  /**
   * Giving and removing an operator's Platform access: Core's `POST|DELETE …/operators/:id/platform-assignments` are
   * `@Actors('owner')` with step-up `platform_assignment.grant` / `.revoke`; an operator (even on their own record) gets
   * `403`, and memberships or the organization-admin role never confer it.
   */
  | 'operator.platformAccess.change'
  /**
   * Creating a Platform: Core `POST /organization/admin/platforms` allows only the owner of the Company
   * (`canCreatePlatform`), with step-up `platform.create` and an `Idempotency-Key`.
   */
  | 'platform.create'
  /**
   * Creating an Organization under a Platform: Core `POST /organization/admin/organizations` allows the owner of the
   * Platform's Company and an operator assigned to it (`canCreateOrganization`), with step-up `organization.create` and
   * an `Idempotency-Key`. Core has no step-up for operators (CF-08), so only the owner can complete it: an operator sees
   * the action disabled, with that reason.
   */
  | 'organization.create'
  /**
   * A Platform's commercial facts and policies (subscriptions, Personal Premium, payments, assisted payments): the owner.
   * No commercial read authority is confirmed for operators (Billing/Payment staff routes are Core V2 A10/A11).
   */
  | 'platform.commercial.view'
  /** A Platform's administrative activity: Core's owner audit read; operators have no audit read (CF-04). */
  | 'platform.activity.view'
  /** Operator assignments and admin invitations of a Platform: the owner manages both; operators manage neither. */
  | 'platform.access.view';

const OWNER_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'company.scope',
  'company.overview.view',
  'company.platforms.view',
  'company.operators.view',
  'operator.platformAccess.change',
  'platform.create',
  'organization.create',
  'platform.commercial.view',
  'platform.activity.view',
  'platform.access.view',
]);
const NONE: ReadonlySet<Capability> = new Set<Capability>();

/** Pure: `(actor) → capabilities`. An operator's Platform assignments never grant a company-wide capability. */
export function capabilitiesOf(actor: Actor | null): ReadonlySet<Capability> {
  return actor?.kind === 'owner' ? OWNER_CAPABILITIES : NONE;
}

export const can = (actor: Actor | null, capability: Capability): boolean =>
  capabilitiesOf(actor).has(capability);

/**
 * Whether the actor may enter a Platform's scope, mirroring Core's `GET /auth/platform-access/:platformId`: the owner
 * for any Platform of their Company, an operator only for a Platform actively assigned to them.
 *
 * @param companyPlatforms the Platforms of the owner's Company, as far as the UI knows them
 */
export function canEnterPlatform(
  actor: Actor | null,
  platform: PlatformId,
  companyPlatforms: readonly PlatformId[],
): boolean {
  if (actor === null) return false;
  if (actor.kind === 'owner') return companyPlatforms.includes(platform);
  return actor.platformAssignments.includes(platform);
}
