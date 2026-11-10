import { A11yModule } from '@angular/cdk/a11y';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { GrantsRefreshNotice } from '../../../layout/grants-refresh-notice/grants-refresh-notice';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { SummaryCard } from '../../../shared/dashboard/summary-card/summary-card';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import {
  PlatformAttentionKind,
  PlatformDashboardFacade,
} from '../application/platform-dashboard.facade';
import {
  PlatformActivity,
  PLATFORM_ACTIVITY_ACTIONS,
} from '../components/platform-activity/platform-activity';
import { PlatformActivityAction } from '../domain/platform-dashboard.model';
import { NwIconButton } from '../../../shared/ui/icon-button/icon-button';
import {
  PlatformAttention,
  PLATFORM_ATTENTION_KINDS,
} from '../components/platform-attention/platform-attention';
import { OrganizationDirectoryPage } from '../../organizations/pages/organization-directory.page';
import { SubscriptionSummary } from '../components/subscription-summary/subscription-summary';
import { CreateOrganizationButton } from '../../organizations/components/create-organization-button/create-organization-button';
import { AccordionPreferences } from '../../../core/preferences/accordion-preferences';

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
    A11yModule,
    GrantsRefreshNotice,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwIcon,
    NwIconButton,
    PlatformActivity,
    SummaryCard,
    PlatformAttention,
    OrganizationDirectoryPage,
    SubscriptionSummary,
    CreateOrganizationButton,
  ],
  templateUrl: './platform-dashboard.page.html',
  styleUrl: './platform-dashboard.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-dashboard' },
})
export class PlatformDashboardPage {
  protected readonly preferences = inject(AccordionPreferences);
  protected readonly facade = inject(PlatformDashboardFacade);
  private readonly session = inject(AuthSession);
  private readonly translations = inject(TranslocoService);
  private readonly language = toSignal(this.translations.langChanges$);
  protected readonly historySearch = signal('');
  protected readonly historyOpen = signal(false);
  protected readonly attentionOpen = signal(false);
  protected readonly attentionSearch = signal('');
  protected readonly attentionMenu = signal<'filter' | 'sort' | null>(null);
  protected readonly attentionFilter = signal<PlatformAttentionKind | 'all'>('all');
  protected readonly attentionSort = signal<'priority' | 'count'>('priority');
  protected readonly attentionLabels = PLATFORM_ATTENTION_KINDS;
  protected readonly attentionItems = computed(() => {
    const state = this.facade.attention();
    return state.status === 'available' ? state.data : [];
  });
  protected readonly filteredAttention = computed(() => {
    const search = this.attentionSearch().trim().toLocaleLowerCase();
    const filter = this.attentionFilter();
    this.language();
    const items = this.attentionItems().filter((item) => {
      const text =
        `${this.translations.translate(PLATFORM_ATTENTION_KINDS[item.kind].key, { count: item.count })} ${item.organizationName ?? ''}`.toLocaleLowerCase();
      return (filter === 'all' || filter === item.kind) && (!search || text.includes(search));
    });
    return items
      .slice()
      .sort((a, b) =>
        this.attentionSort() === 'count'
          ? b.count - a.count
          : Number(b.tone === 'warning') - Number(a.tone === 'warning'),
      );
  });
  protected onAttentionSearch(event: Event): void {
    this.attentionSearch.set((event.target as HTMLInputElement).value);
  }

  protected readonly historyMenu = signal<'filter' | 'sort' | null>(null);
  protected readonly historyFilter = signal<PlatformActivityAction | 'all'>('all');
  protected readonly historySort = signal<'newest' | 'oldest'>('newest');
  protected readonly historyActionLabels = PLATFORM_ACTIVITY_ACTIONS;
  protected readonly historyEntries = computed(() => {
    const state = this.facade.state();
    return state.status === 'success' && state.data.activity.status === 'available'
      ? state.data.activity.data
      : [];
  });
  protected readonly historyActions = computed(() => [
    ...new Set(this.historyEntries().map((entry) => entry.action)),
  ]);
  protected readonly filteredHistory = computed(() => {
    const filter = this.historyFilter();
    const search = this.historySearch().trim().toLocaleLowerCase();
    this.language();
    const direction = this.historySort() === 'newest' ? -1 : 1;
    return this.historyEntries()
      .filter((entry) => {
        const matchesAction = filter === 'all' || entry.action === filter;
        const text =
          `${this.translations.translate(PLATFORM_ACTIVITY_ACTIONS[entry.action].key)} ${entry.organizationName ?? ''}`.toLocaleLowerCase();
        return matchesAction && (!search || text.includes(search));
      })
      .slice()
      .sort((a, b) => direction * (Date.parse(a.occurredAt) - Date.parse(b.occurredAt)));
  });
  protected onHistorySearch(event: Event): void {
    this.historySearch.set((event.target as HTMLInputElement).value);
  }
  protected readonly adapterUnavailable = ADAPTER_UNAVAILABLE;

  /** The actor's own home (their Platforms for an operator), offered when a Platform cannot be shown. */
  protected readonly home = computed(() => homePath(this.session.actor()));

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
