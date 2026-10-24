import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationPath, platformSubscriptionsPath } from '../../../core/context/scope-context';
import { Metric } from '../../../shared/dashboard/metric';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { SummaryCard } from '../../../shared/dashboard/summary-card/summary-card';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { LicensesFacade } from '../application/licenses.facade';

const count = (value: number): Metric => ({ status: 'available', value });

/**
 * Licenses & entitlements (`/licenses`; P7 design, artboards Main, MobileEn): the Company owner's read-only overview of
 * Organization subscriptions across their Platforms. PROVISIONAL (proposed CF-36, CF-37): Core has no owner read of
 * subscriptions, so a demo build reads the demo world and any other build says it is not available.
 *
 * The subscription state (active, in grace, none), the entitlement (entitled now) and the timeline (when a subscription
 * or a grace period ends) are shown apart; Personal Premium is a separate, declared demo count per Platform. Nothing
 * here can be changed, and what Core does not offer is said in one short section, without controls.
 */
@Component({
  selector: 'adm-licenses-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MetricValue,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwNumberPipe,
    NwStatusBadge,
    SummaryCard,
  ],
  templateUrl: './licenses.page.html',
  styleUrl: './licenses.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'licenses' },
})
export class LicensesPage {
  protected readonly facade = inject(LicensesFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly platformSubscriptionsPath = platformSubscriptionsPath;
  protected readonly organizationPath = organizationPath;
  protected readonly count = count;

  /** The Company's figures as summary metrics (the cards' input). */
  protected readonly figures = computed(() => {
    const view = this.facade.view();
    if (view.status !== 'ready') return null;
    const c = view.overview.company;
    return {
      organizations: count(c.organizations),
      active: count(c.active),
      grace: count(c.grace),
      none: count(c.none),
      endingSoon: count(c.endingSoon),
    };
  });
}
