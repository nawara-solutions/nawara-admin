import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { Metric, Section } from '../../../shared/dashboard/metric';

/**
 * Organizations of one Platform (`/platforms/:platformId/organizations[/:organizationId]`; docs/ARCHITECTURE.md §6, §7):
 * an Organization is an entity inside platform scope, never a scope of its own.
 *
 * Provisional frontend model. Core has a single-Organization read (`GET /auth/admin/organizations/:id`, owner and
 * operator; its response shape is not verified here) and no human list route (CF-02); the only adapter is a mock with
 * fictional data. Commercial facts are a separate domain with their own gateway (organization-commercial.model.ts).
 * No lifecycle state is modelled: Core has none yet (BD-5, CF-09).
 */

/** One Organization as the directory lists it. */
export interface OrganizationSummary {
  readonly id: OrganizationId;
  readonly platformId: PlatformId;
  /** User data: rendered isolated, never translated. */
  readonly name: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly createdAt: string;
  /** Memberships in this Organization (one person may hold memberships in several). */
  readonly memberships: Metric;
  /** Membership requests awaiting approval. */
  readonly pendingRequests: Metric;
}

export interface OrganizationDirectory {
  readonly platformId: PlatformId;
  readonly organizations: readonly OrganizationSummary[];
}

/** Administrative actions on one Organization (machine values; labels come from the catalog). */
export type OrganizationActivityAction =
  'organization.created' | 'admin_invitation.sent' | 'membership.approved';

export interface OrganizationActivityEntry {
  readonly id: string;
  readonly action: OrganizationActivityAction;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

export interface OrganizationDetail extends OrganizationSummary {
  /** Owner only: organization-admin invitations awaiting acceptance (operators cannot manage invitations). */
  readonly adminInvitationsAwaiting: Section<Metric>;
  /** Owner only: Core's owner audit read, per Organization; operators have no audit read (CF-04). */
  readonly activity: Section<readonly OrganizationActivityEntry[]>;
}
