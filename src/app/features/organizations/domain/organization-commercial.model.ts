import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { Metric, Section } from '../../../shared/dashboard/metric';

/**
 * Commercial facts of Organizations, for the Company owner only (operators have no confirmed commercial read authority,
 * so the UI never asks for them). Billing owns subscriptions, Payment owns payment facts, the Platform owns the
 * assisted-payments setting.
 *
 * Core status 🟡: no staff or owner read route before Core V2 A10/A11 (docs/CORE-INTEGRATION.md §5, §6). PROVISIONAL mock
 * contract: the rules come from the Core V2 architecture (one subscription per Organization, a 24-hour grace period
 * once it ends, an Organization can only turn assisted payments off), not from a published API. The states below are
 * FRONTEND view values, not Core enums.
 */
export type OrganizationSubscriptionState = 'active' | 'grace' | 'none';

export interface OrganizationSubscription {
  readonly state: OrganizationSubscriptionState;
  /** `active`: when it ends; `grace`: when it ended (UTC instants). */
  readonly endsAt?: string;
  /** `grace`: when the 24-hour grace period ends (UTC instant). */
  readonly graceEndsAt?: string;
}

/**
 * Whether the Organization is entitled now, a separate fact from its subscription state (P7-S2): active entitles, grace
 * entitles temporarily, none does not. Billing's (proposed CF-37); never derived from memberships or payments.
 */
export type OrganizationEntitlement = 'entitled' | 'entitledInGrace' | 'notEntitled';

export type AssistedPaymentsSetting = 'enabled' | 'disabled';

/** The policy that applies to one Organization, and where it comes from. */
export interface EffectiveAssistedPayments {
  readonly effective: AssistedPaymentsSetting;
  readonly platform: AssistedPaymentsSetting;
  /** The Organization's own override: inherit the Platform's setting, or disabled. */
  readonly organization: 'inherit' | 'disabled';
}

/** One row of the owner's directory columns. */
export interface OrganizationCommercialSummary {
  readonly organizationId: OrganizationId;
  readonly subscription: OrganizationSubscription;
  readonly assistedPayments: EffectiveAssistedPayments;
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
  readonly assistedPayments: Section<EffectiveAssistedPayments>;
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
