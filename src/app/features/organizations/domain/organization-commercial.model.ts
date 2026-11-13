import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { SubscriptionLifecycle } from '../../../shared/subscription/subscription-lifecycle';

/**
 * Commercial facts of Organizations, for the Company owner only (operators have no confirmed commercial read authority,
 * so the UI never asks for them). Billing owns subscriptions, Payment owns payment facts. Assisted payments are not a
 * setting of anything (see `AssistanceEligibility`).
 *
 * Core status 🟡: no staff or owner read route before Core V2 A10/A11 (docs/CORE-INTEGRATION.md §5, §6). PROVISIONAL mock
 * contract: the rules come from the Core V2 architecture (one subscription per Organization, a 24-hour grace period
 * once it ends), not from a published API. The states below are
 * FRONTEND view values, not Core enums.
 */
export type OrganizationSubscriptionState = 'active' | 'grace' | 'none';

export interface OrganizationSubscription {
  readonly state: OrganizationSubscriptionState;
  /** `active`: when it ends; `grace`: when it ended (UTC instants). */
  readonly endsAt?: string;
  /** `grace`: when the 24-hour grace period ends (UTC instant). */
  readonly graceEndsAt?: string;
  /**
   * The full lifecycle reading (WP-4.1), for presentation: `state` above stays the three-way view the figures and filters
   * count; this tells "no subscription" apart from pending, not started, expired and terminated, and carries the dates.
   */
  readonly lifecycle: SubscriptionLifecycle;
}

/**
 * Whether the Organization is entitled now, a separate fact from its subscription state (P7-S2): active entitles, grace
 * entitles temporarily, none does not. Billing's (proposed CF-37); never derived from memberships or payments.
 */
export type OrganizationEntitlement = 'entitled' | 'entitledInGrace' | 'notEntitled';

/**
 * Assisted payments, as Admin can state them (A31-04 / X34, OD-07, WP-2.2). There is no Platform or Organization policy:
 * Core decides each assistance request itself (BIL-13, nawara-core `8d89bed` billing-service
 * `src/assistance/assistance.service.ts:103-141`: an active ordinary member with an active membership, no T1-T3
 * restriction, a configured Billing Platform, an available product and price, no open request, a usable fee). Admin holds
 * none of these facts, so it never says enabled, disabled, eligible or ineligible: only that eligibility is not verified.
 * The demo world's old `assistedPayments` flags are never read here.
 */
export interface AssistanceEligibility {
  readonly status: 'notVerified';
}

/** One row of the owner's directory columns. */
export interface OrganizationCommercialSummary {
  readonly organizationId: OrganizationId;
  readonly subscription: OrganizationSubscription;
  readonly assistedPayments: AssistanceEligibility;
}

export interface PlatformOrganizationsCommercial {
  readonly platformId: PlatformId;
  readonly organizations: readonly OrganizationCommercialSummary[];
}

export interface OrganizationCommercial {
  readonly organizationId: OrganizationId;
  readonly platformId: PlatformId;
  readonly subscription: Section<OrganizationSubscription>;
  readonly entitlement: Section<OrganizationEntitlement>;
  /** Payments of this Organization that failed or await action (a Payment fact; details are not available). */
  readonly paymentIssues: Section<Metric>;
  readonly assistedPayments: Section<AssistanceEligibility>;
  /** Unresolved financial records of this Organization (WP-4.2), as counts only: never a refund, recovery or settlement. */
  readonly financialCases: Section<OrganizationFinancialCases>;
}

/**
 * Counts of this Organization's unresolved financial records (WP-4.2; nawara-core `8d89bed` shapes, illustrative demo data):
 * open reconciliation cases, open payment disputes, refund cases not completed. A count states no outcome, and Admin offers
 * no resolution, refund or dispute action.
 */
export interface OrganizationFinancialCases {
  readonly openReconciliationCases: Metric;
  readonly openPaymentDisputes: Metric;
  readonly openRefundCases: Metric;
}

/** "Expiring soon": an active subscription that ends within this many days (as on the Company Overview). */
export const EXPIRING_WITHIN_DAYS = 14;

const DAY_MS = 86_400_000;

/** Whole days until an active subscription ends, when it ends within `EXPIRING_WITHIN_DAYS`; otherwise `null`. */
export function daysUntilEnd(subscription: OrganizationSubscription, now: number): number | null {
  if (subscription.state !== 'active' || subscription.endsAt === undefined) return null;
  const left = Date.parse(subscription.endsAt) - now;
  if (left <= 0 || left > EXPIRING_WITHIN_DAYS * DAY_MS) return null;
  return Math.max(1, Math.ceil(left / DAY_MS));
}
