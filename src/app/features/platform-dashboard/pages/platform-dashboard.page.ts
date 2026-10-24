import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GrantsRefreshNotice } from '../../../layout/grants-refresh-notice/grants-refresh-notice';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationsPath } from '../../../core/context/scope-context';
import { PlatformProduct } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { CardLink } from '../../../shared/dashboard/card-link/card-link';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { OverviewCard } from '../../../shared/dashboard/overview-card/overview-card';
import { SummaryCard } from '../../../shared/dashboard/summary-card/summary-card';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { PlatformDashboardFacade } from '../application/platform-dashboard.facade';
import { AssistedPaymentsPolicyCard } from '../components/assisted-payments-policy/assisted-payments-policy';
import { PlatformActivity } from '../components/platform-activity/platform-activity';
import { PlatformAttention } from '../components/platform-attention/platform-attention';
import { RecentOrganizations } from '../components/recent-organizations/recent-organizations';
import { SubscriptionSummary } from '../components/subscription-summary/subscription-summary';

const PRODUCT_KEYS = {
  school: 'platforms.product.school',
  drive: 'platforms.product.drive',
} as const satisfies Record<PlatformProduct, string>;

const UNAVAILABLE: Metric = { status: 'unavailable' };

/**
 * The Platform dashboard (`/platforms/:platformId`; P2 design "P2 Platform Dashboard", 2026-10-23), for the owner and
 * for an operator assigned to the Platform. It orchestrates; the facade owns state. Each section loads and fails on its
 * own and shows "not available" rather than a made-up zero; owner-only sections are not rendered for an operator.
 * Everything is read only: actions whose destination is not built are shown unavailable and say so.
 */
@Component({
  selector: 'adm-platform-dashboard-page',
  imports: [
    GrantsRefreshNotice,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwIcon,
    CardLink,
    OverviewCard,
    SummaryCard,
    AssistedPaymentsPolicyCard,
    PlatformActivity,
    PlatformAttention,
    RecentOrganizations,
    SubscriptionSummary,
  ],
  templateUrl: './platform-dashboard.page.html',
  styleUrl: './platform-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-dashboard' },
})
export class PlatformDashboardPage {
  protected readonly facade = inject(PlatformDashboardFacade);
  private readonly session = inject(AuthSession);
  protected readonly isDemo = this.session.isDemo;
  protected readonly adapterUnavailable = ADAPTER_UNAVAILABLE;
  protected readonly productKeys = PRODUCT_KEYS;
  protected readonly organizationsPath = organizationsPath;

  /** The actor's own home (their Platforms for an operator), offered when a Platform cannot be shown. */
  protected readonly home = computed(() => homePath(this.session.actor()));

  protected readonly accessKey = computed(() =>
    this.session.actor()?.kind === 'operator'
      ? 'platformDashboard.header.accessOperator'
      : 'platformDashboard.header.accessOwner',
  );

  /** Core refused the Platform (collapsed `404`, or `403`): the same "not found or not accessible" state. */
  protected readonly refused = computed(() => {
    const state = this.facade.state();
    return (
      state.status === 'forbidden' || (state.status === 'error' && state.error.kind === 'not_found')
    );
  });

  protected metricOf(section: Section<Metric>): Metric {
    return section.status === 'available' ? section.data : UNAVAILABLE;
  }
}
