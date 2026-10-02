import { CompanyId, PlatformId, PlatformRef } from '../../../core/context/scope.model';

/**
 * Company Overview: the owner's company-wide view (docs/ARCHITECTURE.md §6 `/overview`, §7 company scope).
 *
 * Provisional frontend model. Core V1 has no human contract for any of these aggregates (docs/CORE-INTEGRATION.md
 * §7, follow-ups CF-02, CF-03, CF-04, CF-11 to CF-13); the only adapter is a mock with fictional data. When Core defines
 * the contracts, this model changes deliberately where their semantics differ. Commercial and service-health summaries
 * are separate domains with their own gateways (commercial-summary.model.ts, service-health.model.ts).
 */

/** A count that may be unknown. An unavailable value is shown as unavailable and never becomes zero. */
export type Metric =
  { readonly status: 'available'; readonly value: number } | { readonly status: 'unavailable' };

/** A section whose data may not exist for this actor or build. */
export type Section<T> =
  { readonly status: 'available'; readonly data: T } | { readonly status: 'unavailable' };

export interface CompanySummary {
  readonly platforms: Metric;
  readonly organizations: Metric;
  /**
   * UNIQUE identities: distinct accounts across the Company's Platforms. Never the sum of platform memberships: one
   * account can hold memberships in several Platforms and Organizations.
   */
  readonly uniqueIdentities: Metric;
  /**
   * PROVISIONAL DEMO DEFINITION: organization-admin invitations (Core Auth `admin-invitations`, derived status
   * `active`) awaiting acceptance, across the Company's Organizations. Core lists them per Organization only; no
   * company-wide aggregate exists (CF-11). Shown as "awaiting acceptance", never as a trend.
   */
  readonly pendingAdminInvitations: Metric;
}

export interface PlatformSummary {
  readonly platform: PlatformRef;
  readonly organizations: Metric;
  /** Memberships in this Platform's Organizations. Per platform; summing them across Platforms is not an identity count. */
  readonly memberships: Metric;
  /** Operators with an active assignment to this Platform. */
  readonly operators: Metric;
}

/**
 * Access & security summary. Platform operator ACCESS is counted two ways that must not be confused:
 * an operator assigned to two Platforms is two assignments but one unique operator.
 */
export interface AccessSummary {
  /** Active Platform assignments across the Company (Core Auth `platform_assignment`, per operator only; CF-03). */
  readonly operatorAssignments: Metric;
  /** Distinct operators holding at least one active assignment. */
  readonly uniqueOperators: Metric;
  /** Platforms with at least one assigned operator. */
  readonly platformsWithOperators: Metric;
}

/** Attention items of the company overview itself; the commercial item comes from the commercial summary. */
export type AttentionKind = 'admin_invitations_awaiting' | 'access_assignments_to_review';

export interface AttentionItem {
  readonly kind: AttentionKind;
  readonly count: number;
}

export interface GrowthPoint {
  /** Calendar day (`YYYY-MM-DD`), never routed through `Date` as a local time (§23). */
  readonly day: string;
  readonly organizations: number;
}

/** One Platform's organization count over the same days as the total. */
export interface PlatformGrowth {
  readonly platformId: PlatformId;
  readonly points: readonly GrowthPoint[];
}

export interface GrowthSeries {
  /** Total organizations across the Company's Platforms. */
  readonly points: readonly GrowthPoint[];
  /** Per Platform, so the chart can be filtered; on each day the platform counts add up to the total. */
  readonly platforms: readonly PlatformGrowth[];
}

/** Administrative actions shown in the activity feed (machine values; labels come from the catalog). */
export type ActivityAction =
  'organization.created' | 'operator.assigned' | 'admin_invitation.sent' | 'license.renewed';

export interface ActivityEntry {
  readonly id: string;
  readonly action: ActivityAction;
  /** Name of the affected Organization, if any (user data: rendered isolated, never translated). */
  readonly organizationName: string | null;
  readonly platformName: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

export interface CompanyOverview {
  readonly company: { readonly id: CompanyId; readonly name: string };
  /** Length of the reporting period, in days. */
  readonly periodDays: number;
  readonly summary: CompanySummary;
  readonly platforms: readonly PlatformSummary[];
  readonly access: Section<AccessSummary>;
  readonly attention: Section<readonly AttentionItem[]>;
  readonly growth: Section<GrowthSeries>;
  readonly activity: Section<readonly ActivityEntry[]>;
}
