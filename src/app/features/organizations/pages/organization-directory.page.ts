import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../../core/access/capability-policy';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { platformPath } from '../../../core/context/scope-context';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { OrganizationDirectoryFacade } from '../application/organization-directory.facade';
import {
  DEFAULT_QUERY,
  OrganizationSort,
  SORTS,
  SUBSCRIPTION_FILTERS,
  SubscriptionFilter,
} from '../application/organization-query';
import { OrganizationTable } from '../components/organization-table/organization-table';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';
import { EXPIRING_WITHIN_DAYS } from '../domain/organization-commercial.model';

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

const pick = <T extends string>(values: readonly T[], value: string): T | null =>
  (values as readonly string[]).includes(value) ? (value as T) : null;

/**
 * Organizations of a Platform (`/platforms/:platformId/organizations`; P3a design, artboards 1, 3, 5, 6, 9), for the
 * owner and an operator assigned to the Platform. Read only. Search, the requests filter, the owner's subscription filter
 * and the sort are URL query parameters; they filter the loaded list and request nothing. The count is announced
 * politely.
 */
@Component({
  selector: 'adm-organization-directory-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    MetricValue,
    NwButton,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    OrganizationTable,
    OrganizationsHeader,
  ],
  templateUrl: './organization-directory.page.html',
  styleUrl: './organization-directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-directory' },
})
export class OrganizationDirectoryPage {
  protected readonly facade = inject(OrganizationDirectoryFacade);
  private readonly session = inject(AuthSession);
  protected readonly sorts = SORTS;
  protected readonly sortKeys = SORT_KEYS;
  protected readonly filterKeys = FILTER_KEYS;
  protected readonly subscriptionFilters = SUBSCRIPTION_FILTERS;
  protected readonly expiringDays = EXPIRING_WITHIN_DAYS;
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

  constructor() {
    effect(() => {
      const q = this.facade.query().q;
      if (this.pending === null) untracked(() => this.search.set(q));
    });
    inject(DestroyRef).onDestroy(() => this.cancelPending());
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

  protected onSubscription(event: Event): void {
    const value = pick<SubscriptionFilter>(
      SUBSCRIPTION_FILTERS,
      (event.target as HTMLSelectElement).value,
    );
    if (value !== null) this.facade.setQuery({ subscription: value });
  }

  protected onSort(event: Event): void {
    const value = pick<OrganizationSort>(SORTS, (event.target as HTMLSelectElement).value);
    if (value !== null) this.facade.setQuery({ sort: value });
  }

  protected clearAll(): void {
    this.cancelPending();
    this.search.set('');
    this.facade.setQuery({ q: '', requests: false, subscription: 'any' });
  }
}
