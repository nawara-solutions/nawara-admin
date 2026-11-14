import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { platformSubscriptionsPath } from '../../../core/context/scope-context';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { LicensesFacade } from '../application/licenses.facade';
import { LicensesOverview } from '../domain/licenses.model';
import { LicensesAttentionData, LicensesAttentionDialog } from './licenses-attention-dialog';
import { LicensesStatusDialog } from './licenses-status-dialog';

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
  imports: [RouterLink, TranslocoPipe, MetricValue, NwButton, NwDataState, NwIcon, NwNumberPipe],
  templateUrl: './licenses.page.html',
  styleUrl: './licenses.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'licenses' },
})
export class LicensesPage {
  protected readonly facade = inject(LicensesFacade);
  protected readonly platformSubscriptionsPath = platformSubscriptionsPath;
  private readonly dialogs = inject(NwDialogService);
  /** Demo builds say the figures are fictional (as every demo page does). */
  protected readonly isDemo = inject(AuthSession).isDemo;

  protected openStatuses(graceHours: number): void {
    this.dialogs.open(LicensesStatusDialog, { data: { graceHours }, sidePanel: true });
  }

  protected openAttention(overview: LicensesOverview, filter: 'graceEnds' | 'ends'): void {
    const data: LicensesAttentionData = {
      items: overview.attention.map((attention) => ({
        attention,
        platformName: this.facade.platformName(attention.platformId),
      })),
      endingWithinDays: overview.endingWithinDays,
      initialFilter: filter,
    };
    this.dialogs.open(LicensesAttentionDialog, { data });
  }
}
