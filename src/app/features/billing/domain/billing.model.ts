import { OrganizationId, PlatformRef } from '../../../core/context/scope.model';

/**
 * The Company's payment follow-ups (`/billing`, P7-S3), for the Company owner only. Payment owns payment attempts and
 * settlement; Billing owns invoices and subscriptions (docs/CORE-INTEGRATION.md §5).
 *
 * Core status 🟡: payment facts are readable only by their payer before Core V2 A11 (proposed CF-40). PROVISIONAL
 * frontend model, served only by a mock in demo builds. A follow-up says only THAT an Organization has a payment that
 * failed or awaits action: no amount, currency, invoice, provider reference, method, date, balance or settlement is
 * known, and none is shown. It never changes, or follows from, the Organization's subscription or entitlement, which
 * are listed beside it as separate facts.
 */

/** A frontend view value, not a Core enum. */
export type PaymentIssueKind = 'failed' | 'awaiting_action';

export type FollowUpSubscriptionState = 'active' | 'grace' | 'none';
export type FollowUpEntitlement = 'entitled' | 'entitledInGrace' | 'notEntitled';

export interface PaymentFollowUp {
  readonly organizationId: OrganizationId;
  /** User data: never translated. */
  readonly organizationName: string;
  readonly platform: PlatformRef;
  readonly kind: PaymentIssueKind;
  /** The Organization's own subscription state now: a separate fact, never changed by the payment issue. */
  readonly subscription: FollowUpSubscriptionState;
  /** Whether the Organization is entitled now: a separate fact, never changed by the payment issue. */
  readonly entitlement: FollowUpEntitlement;
}

export interface PaymentFollowUps {
  /** Failed first, then awaiting action; each by Organization name. */
  readonly followUps: readonly PaymentFollowUp[];
}
