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

/** An Organization's subscription state (a frontend view value, not a Core enum). */
export type SubscriptionState = 'active' | 'grace' | 'none';

/** Entitled now: active entitles; grace entitles temporarily; none does not. Never derived from memberships. */
export type EntitlementState = 'entitled' | 'entitledInGrace' | 'notEntitled';

/** One Organization of a Platform's subscription directory (`/licenses/platforms/:platformId`, P7-S2). */
export interface OrganizationSubscriptionEntry {
  readonly organizationId: OrganizationId;
  /** User data: never translated. */
  readonly organizationName: string;
  readonly state: SubscriptionState;
  /** `active`: when it ends; `grace`: when it ended (UTC instants). `null` without a subscription. */
  readonly endsAt: string | null;
  /** `grace`: when the grace period ends; otherwise `null`. */
  readonly graceEndsAt: string | null;
  /** Active and ending within `endingWithinDays` (counted in the distribution's `endingSoon`). */
  readonly endingSoon: boolean;
  readonly entitlement: EntitlementState;
}

/**
 * One Platform's Organization subscriptions (P7-S2), for the Company owner only. Every Organization of the Platform is
 * listed, with or without a subscription; `distribution` is the same canonical count as the Company overview's row.
 * No plan, price, identifier or payment history exists here (none is offered by Core).
 */
export interface PlatformSubscriptions {
  readonly platform: PlatformRef;
  readonly endingWithinDays: number;
  readonly graceHours: number;
  readonly distribution: SubscriptionDistribution;
  readonly organizations: readonly OrganizationSubscriptionEntry[];
}
