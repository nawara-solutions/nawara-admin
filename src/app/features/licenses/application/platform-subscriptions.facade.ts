import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { PLATFORM_SCOPE_SEGMENT, ScopeContext } from '../../../core/context/scope-context';
import { CompanyId, PlatformId, platformId } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { LicensesGateway } from '../data-access/licenses.gateway';
import { OrganizationSubscriptionEntry, PlatformSubscriptions } from '../domain/licenses.model';

/** What the Platform subscriptions page shows. `notFound` collapses "unknown" and "not the Company's". */
export type PlatformSubscriptionsView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly subscriptions: PlatformSubscriptions };

/** The state filter, a URL query parameter (`?state=`); machine values, never translated. */
export type SubscriptionStateFilter = 'all' | 'active' | 'endingSoon' | 'grace' | 'none';

export const STATE_FILTERS: readonly SubscriptionStateFilter[] = [
  'all',
  'active',
  'endingSoon',
  'grace',
  'none',
];

/** The longest search kept: an Organization name is at most 200 characters in Core. */
const MAX_SEARCH_LENGTH = 200;

/** The Platform id of a `/licenses/platforms/:platformId` URL, or `null`. */
export function subscriptionsPlatformFromUrl(url: string): PlatformId | null {
  const path = url.split(/[?#]/)[0] ?? '';
  const [first, second, id, extra] = path.split('/').filter((segment) => segment !== '');
  return first === 'licenses' &&
    second === PLATFORM_SCOPE_SEGMENT &&
    id !== undefined &&
    extra === undefined
    ? platformId(decodeURIComponent(id))
    : null;
}

/** A query parameter → the filter; anything unknown is `all`. */
export const parseStateFilter = (value: unknown): SubscriptionStateFilter =>
  typeof value === 'string' && (STATE_FILTERS as readonly string[]).includes(value)
    ? (value as SubscriptionStateFilter)
    : 'all';

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

const matches = (entry: OrganizationSubscriptionEntry, filter: SubscriptionStateFilter) =>
  filter === 'all' || (filter === 'endingSoon' ? entry.endingSoon : entry.state === filter);

/**
 * Pure: the entries matching the state filter and the search (trimmed, case- and accent-insensitive, on the name), by
 * name. Filters only what is loaded; no Core search, sort or pagination contract is assumed.
 */
export function filterEntries(
  entries: readonly OrganizationSubscriptionEntry[],
  filter: SubscriptionStateFilter,
  search: string,
  collator: Intl.Collator,
): readonly OrganizationSubscriptionEntry[] {
  const q = fold(search.trim());
  return entries
    .filter((e) => matches(e, filter) && (q === '' || fold(e.organizationName).includes(q)))
    .sort(
      (a, b) =>
        collator.compare(a.organizationName, b.organizationName) ||
        a.organizationId.localeCompare(b.organizationId),
    );
}

interface Key {
  readonly company: CompanyId;
  readonly platform: PlatformId;
}

/**
 * View state of one Platform's Organization subscriptions (`/licenses/platforms/:platformId`; P7-S2). The Company owner
 * only: for anyone else (an operator assigned to the Platform included) no gateway is called and the view is
 * `forbidden` (UX; the route guard sends an operator away first, and the mock refuses them too). An unknown Platform
 * and another Company's are the same `notFound` (Core's collapsed `404`). The state filter is a URL query parameter;
 * the search is the page's own text. A hierarchy change or "Try again" loads it again. Read only.
 */
@Injectable()
export class PlatformSubscriptionsFacade {
  private readonly gateway = inject(LicensesGateway);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly locale = inject(NW_FORMATTING_LOCALE);
  private readonly reloads = new Subject<void>();

  private readonly key = computed<Key | null>(
    () => {
      const actor = this.session.actor();
      const platform = subscriptionsPlatformFromUrl(this.context.url());
      if (actor?.kind !== 'owner' || !can(actor, 'company.commercial.view') || platform === null)
        return null;
      return { company: actor.companyId, platform };
    },
    { equal: (a, b) => a?.company === b?.company && a?.platform === b?.platform },
  );

  private readonly state = toSignal(
    combineLatest([
      toObservable(this.key),
      toObservable(this.context.revision),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([key]) =>
        key === null
          ? of<ViewState<PlatformSubscriptions>>({ status: 'forbidden' })
          : toViewState(this.gateway.platform(key.company, key.platform)),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<PlatformSubscriptions> },
  );

  readonly view = computed<PlatformSubscriptionsView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', subscriptions: state.data };
      case 'forbidden':
        return { status: 'forbidden' };
      case 'error':
        if (state.error.kind === 'forbidden') return { status: 'forbidden' };
        if (state.error.kind === 'not_found') return { status: 'notFound' };
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild' }
          : { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  /** The state filter, from the URL. */
  readonly filter = computed(() =>
    parseStateFilter(this.router.parseUrl(this.context.url()).queryParams['state']),
  );

  /** The search text (the page's own; it requests nothing). */
  readonly search = signal('');

  /** The entries to show, filtered and by name. */
  readonly rows = computed(() => {
    const view = this.view();
    if (view.status !== 'ready') return [];
    return filterEntries(
      view.subscriptions.organizations,
      this.filter(),
      this.search(),
      new Intl.Collator(this.locale(), { sensitivity: 'base' }),
    );
  });

  setFilter(filter: SubscriptionStateFilter): void {
    const tree = this.router.parseUrl(this.router.url);
    const params = { ...tree.queryParams };
    delete params['state'];
    tree.queryParams = filter === 'all' ? params : { ...params, state: filter };
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  setSearch(text: string): void {
    this.search.set(text.slice(0, MAX_SEARCH_LENGTH));
  }

  reload(): void {
    this.reloads.next();
  }
}
