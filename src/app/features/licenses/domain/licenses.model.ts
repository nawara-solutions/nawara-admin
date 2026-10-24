import { OrganizationId, PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { Metric } from '../../../shared/dashboard/metric';

/**
 * The Company's Licenses & entitlements overview (`/licenses`, P7-S1), for the Company owner only. Billing owns
 * Organization subscriptions, entitlement and Personal Premium (docs/CORE-INTEGRATION.md §5, §6).
 *
 * Core status 🟡: Core has no `License` entity and no owner read of subscriptions or entitlements before Core V2 A10
 * (proposed CF-36, CF-37). PROVISIONAL frontend model, served only by a mock in demo builds. "Licenses" is the
 * navigation's name for the area; the facts are Organization subscriptions and their entitlement. Three concepts stay
 * apart:
 * - the subscription STATE (`active`, `grace`, `none`): at most one subscription per Organization;
 * - the effective ENTITLEMENT (entitled now or not): active entitles, grace entitles temporarily, none does not;
 * - the TIMELINE: when an active subscription ends, when a grace period ends.
 * Memberships are never paid access, and no count here is a count of customers or people.
 */

/** How the Organizations' subscriptions are distributed. `active + grace + none = organizations`. */
export interface SubscriptionDistribution {
  readonly organizations: number;
  readonly active: number;
  /** Ended, within the 24-hour grace period: NOT counted as active. */
  readonly grace: number;
  readonly none: number;
  /** Active subscriptions ending within `endingWithinDays` (a subset of `active`). */
  readonly endingSoon: number;
  /** Entitled now: `active + grace`. A separate fact, never added to the states. */
  readonly entitled: number;
}

/** One Platform's distribution, and its people's own Personal Premium subscriptions (never added to it). */
export interface PlatformLicenses {
  readonly platform: PlatformRef;
  readonly distribution: SubscriptionDistribution;
  /** A declared demo count of people's Personal Premium in this product; unavailable without a record. */
  readonly personalPremium: Metric;
}

/** An Organization whose entitlement needs attention: in grace (it ends soon), or an active subscription ending soon. */
export interface SubscriptionAttention {
  readonly organizationId: OrganizationId;
  readonly platformId: PlatformId;
  /** User data: never translated. */
  readonly organizationName: string;
  readonly reason: 'graceEnds' | 'ends';
  /** When the grace period, or the subscription, ends (UTC instant, ISO 8601 with `Z`). */
  readonly at: string;
}

export interface LicensesOverview {
  /** The "ending soon" threshold, in days. */
  readonly endingWithinDays: number;
  /** The grace period after a subscription ends, in hours. */
  readonly graceHours: number;
  readonly company: SubscriptionDistribution;
  readonly platforms: readonly PlatformLicenses[];
  /** Grace first, then ending soon; each by when it ends. */
  readonly attention: readonly SubscriptionAttention[];
}
