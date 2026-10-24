import { OrganizationId, PlatformId, PlatformRef } from '../../../core/context/scope.model';

/**
 * The Company owner's administrative activity browser (`/audit`, P8-S1). SIMULATED: the demo world's administrative
 * events, NOT Nawara Core's immutable audit evidence. Core's only human audit read is the owner's, for one Organization
 * at a time (docs/CORE-INTEGRATION.md §5 Audit); a Company-wide or Platform-wide read does not exist (CF-04), so no HTTP
 * adapter is implied by this model. An entry carries only what the demo record holds: no audit id, actor, outcome,
 * request origin, signature or change payload.
 *
 * Scope comes from the record itself, never inferred from a parent: an Organization event names its Organization; a
 * Platform event names its Platform and no Organization; a Company event names neither.
 */
export type ActivityScope = 'company' | 'platform' | 'organization';

/** Machine values; labels come from the catalog. */
export type ActivityAction =
  | 'platform.created'
  | 'organization.created'
  | 'organization.updated'
  | 'admin_invitation.created'
  | 'admin_invitation.revoked'
  | 'membership.approved'
  | 'membership.rejected'
  | 'membership.revoked'
  | 'organization.admin.granted'
  | 'organization.admin.revoked'
  | 'operator.assigned'
  | 'operator.unassigned'
  | 'operator.created'
  | 'operator.blocked'
  | 'operator.unblocked';

export interface ActivityEntry {
  /** The demo record's id: for identity in lists only, never shown (it is not a Core audit id). */
  readonly id: string;
  readonly scope: ActivityScope;
  readonly action: ActivityAction;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
  readonly platformId: PlatformId | null;
  readonly organizationId: OrganizationId | null;
  /** Company events: the operator the event is about (an id, never a contact). */
  readonly operatorId: string | null;
}

export interface ActivityOrganization {
  readonly id: OrganizationId;
  readonly platformId: PlatformId;
  /** User data: never translated. */
  readonly name: string;
}

/** The Company's hierarchy (for the filters) and its simulated events, newest first. */
export interface AdministrativeActivity {
  readonly platforms: readonly PlatformRef[];
  readonly organizations: readonly ActivityOrganization[];
  readonly entries: readonly ActivityEntry[];
}
