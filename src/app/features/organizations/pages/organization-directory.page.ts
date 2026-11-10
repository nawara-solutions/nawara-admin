import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GrantsRefreshNotice } from '../../../layout/grants-refresh-notice/grants-refresh-notice';
import { can } from '../../../core/access/capability-policy';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { platformPath } from '../../../core/context/scope-context';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { OrganizationDirectoryFacade } from '../application/organization-directory.facade';
import {
  DEFAULT_QUERY,
  OrganizationQuery,
  OrganizationSort,
  SORTS,
  SUBSCRIPTION_FILTERS,
  SubscriptionFilter,
} from '../application/organization-query';
import {
  OrganizationFilterData,
  OrganizationFilterDialog,
} from '../components/organization-filter-dialog';
import { CreateOrganizationButton } from '../components/create-organization-button/create-organization-button';
import { OrganizationTable } from '../components/organization-table/organization-table';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';

/** How long typing pauses before the search is written to the URL (and the list filtered). */
const SEARCH_DELAY_MS = 250;

/** Catalog keys of the selects' options, listed in full (never built at runtime). */
const SORT_KEYS = {
  newest: 'organizations.sort.newest',
  oldest: 'organizations.sort.oldest',
  name: 'organizations.sort.name',
  memberships: 'organizations.sort.memberships',
  requests: 'organizations.sort.requests',
} as const satisfies Record<OrganizationSort, string>;

const FILTER_KEYS = {
  any: 'organizations.subscriptionFilter.any',
  active: 'organizations.subscriptionFilter.active',
  ending: 'organizations.subscriptionFilter.ending',
  grace: 'organizations.subscriptionFilter.grace',
  none: 'organizations.subscriptionFilter.none',
} as const satisfies Record<SubscriptionFilter, string>;

/**
 * Organizations of a Platform (`/platforms/:platformId/organizations`; P3a design, artboards 1, 3, 5, 6, 9), for the
 * owner and an operator assigned to the Platform. The one action is "Create organization" (P3b-S1; live for the owner
 * only). Search, the requests filter, the owner's subscription filter
 * and the sort are URL query parameters; they filter the loaded list and request nothing. The count is announced
 * politely.
 */
@Component({
  selector: 'adm-organization-directory-page',
  imports: [
    GrantsRefreshNotice,
    NgTemplateOutlet,
    RouterLink,
    CreateOrganizationButton,
    TranslocoPipe,
    MetricValue,
    NwButton,
    NwDataState,
    NwIcon,
    OrganizationTable,
    OrganizationFilterDialog,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    OrganizationsHeader,
  ],
  templateUrl: './organization-directory.page.html',
  styleUrl: './organization-directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'organization-directory',
    '[class.organization-directory--embedded]': 'embedded()',
  },
})
export class OrganizationDirectoryPage {
  readonly embedded = input(false);
  protected readonly facade = inject(OrganizationDirectoryFacade);
  protected readonly popup = signal<OrganizationFilterData | null>(null);
  protected readonly popupOrigin = signal<CdkOverlayOrigin | undefined>(undefined);
  protected readonly popupPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];
  protected readonly pageSize = signal<10 | 50 | 'all'>(10);
  protected readonly pageSizes = [10, 50, 'all'] as const;
  protected readonly pageSizeOpen = signal(false);
  protected readonly requestedPage = signal(0);
  protected readonly pageCount = computed(() =>
    this.pageSize() === 'all'
      ? 1
      : Math.max(1, Math.ceil(this.facade.rows().length / (this.pageSize() as number))),
  );
  protected readonly pageIndex = computed(() =>
    Math.min(this.requestedPage(), this.pageCount() - 1),
  );
  protected readonly pageRows = computed(() => {
    const rows = this.facade.rows();
    const size = this.pageSize();
    return size === 'all'
      ? rows
      : rows.slice(this.pageIndex() * size, (this.pageIndex() + 1) * size);
  });
  private readonly resetPageOnQuery = effect(() => {
    this.facade.query();
    this.requestedPage.set(0);
  });

  protected setPageSize(value: 10 | 50 | 'all'): void {
    this.pageSize.set(value);
    this.requestedPage.set(0);
    this.pageSizeOpen.set(false);
  }

  protected openFilters(mode: 'filters' | 'sort', origin: CdkOverlayOrigin): void {
    if (this.popup()?.mode === mode) {
      this.closePopup();
      return;
    }
    this.popupOrigin.set(origin);
    const groups: OrganizationFilterData['groups'] =
      mode === 'sort'
        ? [
            {
              field: 'sort',
              label: 'organizations.toolbar.sort',
              options: SORTS.map((value) => ({ value, key: SORT_KEYS[value] })),
            },
          ]
        : [
            {
              field: 'requests',
              label: 'organizations.toolbar.show',
              options: [
                { value: 'false', key: 'organizations.toolbar.all' },
                { value: 'true', key: 'organizations.toolbar.requestsOnly' },
              ],
            },
            ...(this.facade.showsCommercial() && this.facade.subscriptionFilterAvailable()
              ? [
                  {
                    field: 'subscription' as const,
                    label: 'organizations.toolbar.subscription',
                    options: SUBSCRIPTION_FILTERS.map((value) => ({
                      value,
                      key: FILTER_KEYS[value],
                    })),
                  },
                ]
              : []),
          ];
    this.popup.set({ mode, query: this.facade.query(), groups });
  }

  protected closePopup(query?: OrganizationQuery): void {
    this.popup.set(null);
    if (query) this.facade.setQuery(query);
  }
  private readonly session = inject(AuthSession);
  protected readonly platformPath = platformPath;

  /** The actor's own home (their Platforms for an operator), offered when a Platform cannot be shown. */
  protected readonly home = computed(() => homePath(this.session.actor()));
  protected readonly canOpenPlatforms = computed(() =>
    can(this.session.actor(), 'company.platforms.view'),
  );

  protected readonly filtered = computed(() => {
    const query = this.facade.query();
    return (
      query.q.trim() !== '' || query.requests || query.subscription !== DEFAULT_QUERY.subscription
    );
  });

  /**
   * The search box's own text. Typing updates it at once and the URL after a pause (`SEARCH_DELAY_MS`), so a navigation
   * that completes late never writes older text back into the box; the box follows the URL only when the URL changes
   * for another reason (a link, clearing).
   */
  protected readonly search = signal('');
  private pending: ReturnType<typeof setTimeout> | null = null;
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    effect(() => {
      const q = this.facade.query().q;
      if (this.pending === null) untracked(() => this.search.set(q));
    });
    this.destroyRef.onDestroy(() => this.cancelPending());
    afterNextRender(() => this.observeEmbeddedLayout());
  }

  private observeEmbeddedLayout(): void {
    if (!this.embedded() || typeof ResizeObserver === 'undefined') return;
    const host = this.hostElement.nativeElement;
    const topBar = document.querySelector<HTMLElement>('adm-top-bar');
    const main = host.closest<HTMLElement>('.shell__main');
    if (!topBar || !main) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const padding = parseFloat(getComputedStyle(main).paddingBottom) || 0;
        const available = Math.max(
          0,
          window.innerHeight - topBar.getBoundingClientRect().height - padding,
        );
        const controls = [
          '.organization-directory__embedded-header',
          '.organization-directory__toolbar',
          '.organization-directory__pagination',
        ].reduce(
          (total, selector) =>
            total +
            (host.querySelector<HTMLElement>(selector)?.getBoundingClientRect().height ?? 0),
          0,
        );
        // On very short screens, allow the document to scroll instead of hiding controls or rows.
        host.style.setProperty(
          '--directory-available-height',
          `${Math.max(available, controls + 96)}px`,
        );
      });
    };
    const resize = new ResizeObserver(update);
    resize.observe(topBar);
    resize.observe(main);
    const mutations = new MutationObserver(() => {
      for (const selector of [
        '.organization-directory__embedded-header',
        '.organization-directory__toolbar',
        '.organization-directory__pagination',
      ]) {
        const element = host.querySelector<HTMLElement>(selector);
        if (element) resize.observe(element);
      }
      update();
    });
    mutations.observe(host, { childList: true, subtree: true });
    window.addEventListener('resize', update);
    mutations.takeRecords();
    for (const selector of [
      '.organization-directory__embedded-header',
      '.organization-directory__toolbar',
      '.organization-directory__pagination',
    ]) {
      const element = host.querySelector<HTMLElement>(selector);
      if (element) resize.observe(element);
    }
    update();
    this.destroyRef.onDestroy(() => {
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener('resize', update);
      cancelAnimationFrame(frame);
    });
  }

  protected onSearch(event: Event): void {
    const q = (event.target as HTMLInputElement).value;
    this.search.set(q);
    this.cancelPending();
    this.pending = setTimeout(() => {
      this.pending = null;
      this.facade.setQuery({ q });
    }, SEARCH_DELAY_MS);
  }

  protected clearSearch(): void {
    this.cancelPending();
    this.search.set('');
    this.facade.setQuery({ q: '' });
  }

  private cancelPending(): void {
    if (this.pending !== null) clearTimeout(this.pending);
    this.pending = null;
  }

  protected clearAll(): void {
    this.cancelPending();
    this.search.set('');
    this.facade.setQuery(DEFAULT_QUERY);
  }
}
