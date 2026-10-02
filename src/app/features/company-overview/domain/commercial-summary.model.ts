import { Metric } from './company-overview.model';

/**
 * Commercial summary of the Company, shown on the overview. A separate domain from the hierarchy overview, behind its
 * own gateway, because its owners in Core are Billing and Payment (docs/CORE-INTEGRATION.md §5, §6).
 *
 * Core status 🟡: there is no `License` entity in Core; entitlement is Billing's Subscription/Entitlement (ADR-0038,
 * ADR-0044), readable only by service token per organization (`{ valid, expiresAt }`), and there is no staff/operator
 * API for Billing or Payment before Core V2 A10/A11. "Licenses" here are FRONTEND VIEW-MODEL terms, not Core fields.
 */
export interface CommercialSummary {
  /** Organizations with a currently valid entitlement ("active licenses" in the view). */
  readonly activeLicenses: Metric;
  /** Valid entitlements whose end falls within `expiringWithinDays`. */
  readonly expiringSoon: Metric;
  readonly expiringWithinDays: number;
  /** Payments needing attention (failed or awaiting action). */
  readonly paymentIssues: Metric;
}
