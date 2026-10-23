import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MetricValue } from '../../../../shared/dashboard/metric-value/metric-value';
import { NwStatusBadge, NwStatusTone } from '../../../../shared/ui/status-badge/status-badge';
import { OrganizationSubscriptionState } from '../../domain/platform-commercial.model';
import { RecentOrganization } from '../../domain/platform-dashboard.model';

const SUBSCRIPTION = {
  active: { tone: 'success', key: 'platformDashboard.organizations.subscription.active' },
  grace: { tone: 'warning', key: 'platformDashboard.organizations.subscription.grace' },
  none: { tone: 'info', key: 'platformDashboard.organizations.subscription.none' },
} as const satisfies Record<
  OrganizationSubscriptionState,
  { readonly tone: NwStatusTone; readonly key: string }
>;

/**
 * The newest Organizations of the Platform: a table on a wide card, a list on a narrow one (container query). The
 * subscription column is the owner's only: without `subscriptions` it is not rendered at all.
 */
@Component({
  selector: 'adm-recent-organizations',
  imports: [TranslocoPipe, MetricValue, NwStatusBadge],
  templateUrl: './recent-organizations.html',
  styleUrl: './recent-organizations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'recent-organizations' },
})
export class RecentOrganizations {
  readonly organizations = input.required<readonly RecentOrganization[]>();
  /** The owner's subscription state per Organization id; `null` hides the column (operators). */
  readonly subscriptions = input<ReadonlyMap<string, OrganizationSubscriptionState> | null>(null);
  protected readonly subscription = SUBSCRIPTION;
}
