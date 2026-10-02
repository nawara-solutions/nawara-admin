import { Actor } from '../auth/actor';
import { PlatformId } from '../context/scope.model';

/**
 * UX capabilities (docs/ARCHITECTURE.md §10). They decide what the interface offers, never what is allowed: Core
 * authorizes every request and answers `403`/`404` whatever the UI showed. Each rule mirrors a documented Core rule.
 */
export type Capability =
  /** Company-wide administration ("All platforms"): the owner of the Company only. */
  | 'company.overview.view'
  /** The Company's Platform directory (`/platforms`): company scope, so the owner only. */
  | 'company.platforms.view'
  /**
   * Creating a Platform: Core `POST /organization/admin/platforms` allows only the owner of the Company
   * (`canCreatePlatform`), with step-up `platform.create` and an `Idempotency-Key`.
   */
  | 'platform.create';

const OWNER_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'company.overview.view',
  'company.platforms.view',
  'platform.create',
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
