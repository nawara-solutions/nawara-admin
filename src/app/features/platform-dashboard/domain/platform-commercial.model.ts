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

/**
 * Assisted payments, as Admin can state them (A31-04 / X34, OD-07, WP-2.2). They are not a Platform setting: Core decides
 * each assistance request from its own member, restriction, Billing-configuration, catalog, open-request and fee facts
 * (BIL-13, nawara-core `8d89bed` billing-service `src/assistance/assistance.service.ts:103-141`). Admin holds none of them,
 * so it states only that eligibility is not verified, never enabled, disabled, eligible or ineligible.
 */
export interface AssistanceEligibility {
  readonly status: 'notVerified';
}

export interface PlatformCommercial {
  readonly platformId: PlatformId;
  /** One entry per Organization of the Platform. */
  readonly organizationSubscriptions: Section<readonly OrganizationSubscription[]>;
  /** People's own Personal Premium subscriptions active in this product. */
  readonly personalPremium: Section<Metric>;
  /** Payments that failed or await action (Payment facts). */
  readonly paymentIssues: Section<Metric>;
  /** Never a policy: eligibility is Core's, per request (see `AssistanceEligibility`). */
  readonly assistedPayments: Section<AssistanceEligibility>;
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
