import { NwStatusTone } from '../ui/status-badge/status-badge';

/**
 * An Organization subscription's lifecycle, for presentation (WP-4.1): one shared reading so the Licenses and Organization
 * screens say the same thing. It is derived from the subscription record's dates by the demo world's
 * `subscriptionLifecycleOf` (WP-3.1 entitlement window); a frontend view value, not a Core enum.
 * - `none`: no record; `pending`: a record whose first period never started (never entitled);
 * - `notStarted`: a period that starts later (not entitled yet);
 * - `active` / `grace`: entitled, before the period end / after it until the grace ends;
 * - `expired`: the entitlement window ended; `terminated`: an effective termination ended access.
 * Cancellation at period end is a CONDITION of an active or grace subscription, never a state: access is not lost early.
 * Nothing here says a renewal, an invoice or a payment happened.
 */
export type SubscriptionLifecycleState =
  'none' | 'pending' | 'notStarted' | 'active' | 'grace' | 'expired' | 'terminated';

/** Billing's stored subscription status (a Core machine value, never translated). */
export type StoredSubscriptionStatus = 'pending' | 'active' | 'grace' | 'expired';

export interface SubscriptionLifecycle {
  readonly state: SubscriptionLifecycleState;
  /** As recorded; it may lag the clock (Core has no sweeper): shown, never trusted for access. `null` without a record. */
  readonly storedStatus: StoredSubscriptionStatus | null;
  readonly storedStatusLags: boolean;
  /** UTC instants, ISO 8601 with `Z`; `null` when absent. */
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  readonly graceUntil: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly effectiveTerminationAt: string | null;
  /** While entitled: when access ends (grace end, or an earlier termination). Otherwise `null`. */
  readonly accessEndsAt: string | null;
}

/** How each state reads: catalog key and badge tone. */
export const SUBSCRIPTION_LIFECYCLE_BADGES = {
  none: { tone: 'info', key: 'subscriptionLifecycle.state.none' },
  pending: { tone: 'info', key: 'subscriptionLifecycle.state.pending' },
  notStarted: { tone: 'info', key: 'subscriptionLifecycle.state.notStarted' },
  active: { tone: 'success', key: 'subscriptionLifecycle.state.active' },
  grace: { tone: 'warning', key: 'subscriptionLifecycle.state.grace' },
  expired: { tone: 'danger', key: 'subscriptionLifecycle.state.expired' },
  terminated: { tone: 'danger', key: 'subscriptionLifecycle.state.terminated' },
} as const satisfies Record<
  SubscriptionLifecycleState,
  { readonly tone: NwStatusTone; readonly key: string }
>;

/** Whether access is still running while a cancellation is scheduled for the period end. */
export const cancellationScheduled = (lifecycle: SubscriptionLifecycle): boolean =>
  lifecycle.cancelAtPeriodEnd && (lifecycle.state === 'active' || lifecycle.state === 'grace');

/** A termination that will end access later than now (while still entitled). */
export const terminationScheduled = (lifecycle: SubscriptionLifecycle): boolean =>
  lifecycle.effectiveTerminationAt !== null &&
  (lifecycle.state === 'active' || lifecycle.state === 'grace');
