import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { CompanyOverviewFacade } from '../application/company-overview.facade';
import { AccessSummaryList } from '../components/access-summary/access-summary';
import { ActivityList } from '../components/activity-list/activity-list';
import { AttentionList } from '../components/attention-list/attention-list';
import { CardLink } from '../components/card-link/card-link';
import { CommercialSummaryPanel } from '../components/commercial-summary/commercial-summary';
import { GrowthPanel } from '../components/growth-panel/growth-panel';
import { OverviewCard } from '../components/overview-card/overview-card';
import { OverviewHeader } from '../components/overview-header/overview-header';
import { PlatformList } from '../components/platform-list/platform-list';
import { ServiceHealthStrip } from '../components/service-health-strip/service-health-strip';
import { SummaryCard } from '../components/summary-card/summary-card';
import { ServiceHealthSummary } from '../domain/service-health.model';

/**
 * Company Overview (`/overview`): the owner's company-wide view, built to the owner's design (claude.ai design
 * "Nawara Owner Dashboard", 2026-10-02). It orchestrates; the facade owns state, and every section shows "not
 * available" rather than a made-up zero when data is missing. Actions whose destination is not built are shown
 * disabled and say so.
 */
@Component({
  selector: 'adm-company-overview-page',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    NwNumberPipe,
    NwButton,
    NwDataState,
    NwIcon,
    AccessSummaryList,
    ActivityList,
    AttentionList,
    CardLink,
    CommercialSummaryPanel,
    GrowthPanel,
    OverviewCard,
    OverviewHeader,
    PlatformList,
    ServiceHealthStrip,
    SummaryCard,
  ],
  templateUrl: './company-overview.page.html',
  styleUrl: './company-overview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'company-overview' },
})
export class CompanyOverviewPage {
  protected readonly facade = inject(CompanyOverviewFacade);
  private readonly session = inject(AuthSession);
  protected readonly isDemo = this.session.isDemo;
  protected readonly adapterUnavailable = ADAPTER_UNAVAILABLE;

  protected readonly platformRefs = computed<readonly PlatformRef[]>(() => {
    const state = this.facade.state();
    return state.status === 'success' ? state.data.platforms.map((p) => p.platform) : [];
  });

  /** The Platforms card caption: their names (user data, never translated). */
  protected readonly platformNames = computed(() =>
    this.platformRefs()
      .map((p) => p.name)
      .join(' · '),
  );

  protected readonly ownerName = computed(() => {
    const actor = this.session.actor();
    return actor ? (actor.displayName ?? actor.email) : null;
  });

  protected readonly operationalCount = (summary: ServiceHealthSummary): number =>
    summary.services.filter((s) => s.status === 'operational').length;
}
