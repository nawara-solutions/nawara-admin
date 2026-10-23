import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { organizationPath } from '../../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../../core/context/scope.model';
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
 * subscription column is the owner's only: without `subscriptions` it is not rendered at all. Each name links to the
 * Organization's detail.
 */
@Component({
  selector: 'adm-recent-organizations',
  imports: [RouterLink, TranslocoPipe, MetricValue, NwStatusBadge],
  templateUrl: './recent-organizations.html',
  styleUrl: './recent-organizations.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'recent-organizations' },
})
export class RecentOrganizations {
  readonly platformId = input.required<PlatformId>();
  readonly organizations = input.required<readonly RecentOrganization[]>();
  /** The owner's subscription state per Organization id; `null` hides the column (operators). */
  readonly subscriptions = input<ReadonlyMap<string, OrganizationSubscriptionState> | null>(null);
  protected readonly subscription = SUBSCRIPTION;

  protected pathOf(organization: OrganizationId): string {
    return organizationPath(this.platformId(), organization);
  }
}
