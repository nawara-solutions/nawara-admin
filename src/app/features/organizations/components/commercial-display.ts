import { NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import {
  EffectiveAssistedPayments,
  OrganizationSubscription,
  OrganizationSubscriptionState,
  daysUntilEnd,
} from '../domain/organization-commercial.model';

/** How a subscription state reads (catalog keys; tones as on the Platform dashboard). */
export const SUBSCRIPTION_BADGES = {
  active: { tone: 'success', key: 'organizations.subscription.active' },
  grace: { tone: 'warning', key: 'organizations.subscription.grace' },
  none: { tone: 'info', key: 'organizations.subscription.none' },
} as const satisfies Record<
  OrganizationSubscriptionState,
  { readonly tone: NwStatusTone; readonly key: string }
>;

/** The line under a subscription badge: when an expiring subscription ends, or when a grace period ends. */
export type SubscriptionNote =
  | { readonly kind: 'ends'; readonly at: string }
  | { readonly kind: 'graceEnds'; readonly at: string }
  | null;

/** Pure: an active subscription ending within the 14-day threshold, or a grace period, gets a note. */
export function subscriptionNote(
  subscription: OrganizationSubscription,
  now: number,
): SubscriptionNote {
  if (subscription.state === 'grace' && subscription.graceEndsAt)
    return { kind: 'graceEnds', at: subscription.graceEndsAt };
  if (subscription.endsAt && daysUntilEnd(subscription, now) !== null)
    return { kind: 'ends', at: subscription.endsAt };
  return null;
}

/** The effective assisted-payments policy and where it comes from (catalog keys). */
export function policyKeys(policy: EffectiveAssistedPayments): {
  readonly value: string;
  readonly source: string;
} {
  if (policy.effective === 'enabled')
    return { value: 'organizations.policy.enabled', source: 'organizations.policy.inherited' };
  return {
    value: 'organizations.policy.disabled',
    source:
      policy.platform === 'disabled'
        ? 'organizations.policy.platformDisabled'
        : 'organizations.policy.organizationDisabled',
  };
}
