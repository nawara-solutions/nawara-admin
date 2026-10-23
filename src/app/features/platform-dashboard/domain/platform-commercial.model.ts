import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { Metric, Section } from '../../../shared/dashboard/metric';

/**
 * Commercial facts of one Platform, for its owner (operators have no confirmed commercial read authority, so the
 * dashboard never asks for them). A separate domain from the hierarchy figures, behind its own gateway, because its
 * owners in Core are Billing (subscriptions, entitlements, Personal Premium) and Payment (payment facts).
 *
 * Core status 🟡: no staff/owner read route exists before Core V2 A10/A11 (docs/CORE-INTEGRATION.md §5, §6). The rules
 * the model keeps apart come from the Core V2 architecture (owner handoff, 2026-10-23), not from a published contract:
 * - an Organization subscription belongs to an Organization and has a 24-hour grace period once it ends;
 * - Personal Premium belongs to a person within a product, has no grace period and needs settled payment; it is never
 *   counted with Organization subscriptions;
 * - payment issues are Payment facts, separate from subscription states.
 * The states below are FRONTEND view values, not Core enums.
 */
export type OrganizationSubscriptionState = 'active' | 'grace' | 'none';

export interface OrganizationSubscription {
  readonly organizationId: OrganizationId;
  /** The Organization's name, joined for display (user data, never translated). */
  readonly organizationName: string;
  readonly state: OrganizationSubscriptionState;
  /** `grace` only: when the 24-hour grace period ends (UTC instant, ISO 8601 with `Z`). */
  readonly graceEndsAt?: string;
}

/** A Platform setting (Core V2 architecture): Organizations inherit it, or are set to `disabled`; never `enabled` alone. */
export type AssistedPaymentsSetting = 'enabled' | 'disabled';

export interface AssistedPaymentsPolicy {
  readonly platform: AssistedPaymentsSetting;
  /** Organizations whose override is `disabled` (only meaningful while the Platform enables it). */
  readonly organizationsDisabled: number;
  readonly organizations: number;
}

export interface PlatformCommercial {
  readonly platformId: PlatformId;
  /** One entry per Organization of the Platform. */
  readonly organizationSubscriptions: Section<readonly OrganizationSubscription[]>;
  /** People's own Personal Premium subscriptions active in this product. */
  readonly personalPremium: Section<Metric>;
  /** Payments that failed or await action (Payment facts). */
  readonly paymentIssues: Section<Metric>;
  /** Read-only here; changing it needs authority and a Core route that do not exist yet. */
  readonly assistedPayments: Section<AssistedPaymentsPolicy>;
}

/** Organization subscriptions by state; derived from the list, so the figures always add up to the Organizations. */
export interface SubscriptionCounts {
  readonly active: number;
  readonly grace: number;
  readonly none: number;
  readonly total: number;
}

export function subscriptionCounts(
  subscriptions: readonly OrganizationSubscription[],
): SubscriptionCounts {
  const count = (state: OrganizationSubscriptionState) =>
    subscriptions.filter((s) => s.state === state).length;
  return {
    active: count('active'),
    grace: count('grace'),
    none: count('none'),
    total: subscriptions.length,
  };
}
