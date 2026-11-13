import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwStatusBadge } from '../ui/status-badge/status-badge';
import {
  SUBSCRIPTION_LIFECYCLE_BADGES,
  SubscriptionLifecycle,
  cancellationScheduled,
} from './subscription-lifecycle';

/**
 * A subscription's lifecycle state as a status badge, with a second badge when a cancellation is scheduled for the period
 * end (access continues until then). Presentation only: no action of any kind.
 */
@Component({
  selector: 'adm-subscription-lifecycle-badge',
  imports: [TranslocoPipe, NwStatusBadge],
  template: `
    <nw-status-badge [tone]="badge().tone" [attr.data-lifecycle]="lifecycle().state">{{
      badge().key | transloco
    }}</nw-status-badge>
    @if (scheduled()) {
      <nw-status-badge tone="info" data-cancellation-scheduled>{{
        'subscriptionLifecycle.condition.cancellationScheduled' | transloco
      }}</nw-status-badge>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      gap: var(--nw-space-1);
      align-items: center;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionLifecycleBadge {
  readonly lifecycle = input.required<SubscriptionLifecycle>();
  protected readonly badge = computed(() => SUBSCRIPTION_LIFECYCLE_BADGES[this.lifecycle().state]);
  protected readonly scheduled = computed(() => cancellationScheduled(this.lifecycle()));
}
