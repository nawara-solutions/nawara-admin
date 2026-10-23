import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { Metric, Section } from '../../../shared/dashboard/metric';

/**
 * The Platform dashboard (`/platforms/:platformId`, platform scope; docs/ARCHITECTURE.md §6, §7): what one Platform
 * holds, for its owner or an operator assigned to it.
 *
 * Provisional frontend model. Core V1 has no human route that lists a Platform's Organizations or aggregates them
 * (docs/CORE-INTEGRATION.md §7, CF-02, CF-03, CF-11, CF-13), and no platform-level audit read (CF-04); the only adapter
 * is a mock with fictional data. Commercial facts are a separate domain with their own gateway
 * (platform-commercial.model.ts). Sections an actor has no authority to read come back `unavailable` and are not shown.
 */
export interface PlatformFigures {
  readonly organizations: Metric;
  /** Organizations created within the reporting period. */
  readonly organizationsAdded: Metric;
  /** Memberships in this Platform's Organizations: per Platform, never a count of distinct people. */
  readonly memberships: Metric;
  /** Membership requests awaiting approval, and in how many Organizations. */
  readonly membershipRequests: Metric;
  readonly organizationsWithRequests: Metric;
}

/** One Organization of the Platform, as the dashboard lists it (newest first). */
export interface RecentOrganization {
  readonly id: OrganizationId;
  /** User data: rendered isolated, never translated. */
  readonly name: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly createdAt: string;
  readonly memberships: Metric;
  readonly pendingRequests: Metric;
}

/** Administrative actions of the activity feed (machine values; labels come from the catalog). */
export type PlatformActivityAction =
  | 'platform.created'
  | 'organization.created'
  | 'admin_invitation.sent'
  | 'membership.approved'
  | 'operator.assigned';

export interface PlatformActivityEntry {
  readonly id: string;
  readonly action: PlatformActivityAction;
  /** The affected Organization, if any (user data). */
  readonly organizationName: string | null;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

export interface PlatformDashboard {
  readonly platformId: PlatformId;
  /** Length of the reporting period, in days. */
  readonly periodDays: number;
  readonly figures: Section<PlatformFigures>;
  /** The newest five Organizations; the full directory is Organization management (P3). */
  readonly recentOrganizations: Section<readonly RecentOrganization[]>;
  /** Owner only: active operator ASSIGNMENTS to this Platform (not unique operators). */
  readonly operatorAssignments: Section<Metric>;
  /** Owner only: organization-admin invitations awaiting acceptance (operators cannot manage invitations). */
  readonly adminInvitationsAwaiting: Section<Metric>;
  /** Owner only: an owner reads audit per Organization; operators have no audit read (CF-04). */
  readonly activity: Section<readonly PlatformActivityEntry[]>;
}
