import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Metric, Section } from '../../../../shared/dashboard/metric';
import { MetricValue } from '../../../../shared/dashboard/metric-value/metric-value';
import { SubscriptionCounts } from '../../domain/platform-commercial.model';

/**
 * The owner's commercial summary of one Platform. Organization subscriptions (by state, adding up to the Platform's
 * Organizations), then two separate facts: people's Personal Premium in this product, and payment issues. They are
 * never added together. A missing figure shows "—" and "Not available", never zero.
 */
@Component({
  selector: 'adm-subscription-summary',
  imports: [TranslocoPipe, MetricValue],
  templateUrl: './subscription-summary.html',
  styleUrl: './subscription-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'subscription-summary' },
})
export class SubscriptionSummary {
  readonly subscriptions = input.required<Section<SubscriptionCounts>>();
  readonly personalPremium = input.required<Section<Metric>>();
  readonly paymentIssues = input.required<Section<Metric>>();

  /** Bar segment widths, in percent of the Platform's Organizations. */
  protected readonly shares = computed(() => {
    const section = this.subscriptions();
    if (section.status !== 'available' || section.data.total === 0) return null;
    const { active, grace, total } = section.data;
    return { active: (active / total) * 100, grace: (grace / total) * 100 };
  });

  protected metricOf(section: Section<Metric>): Metric {
    return section.status === 'available' ? section.data : { status: 'unavailable' };
  }
}
