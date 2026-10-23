import { Params } from '@angular/router';
import { Metric } from '../../../shared/dashboard/metric';
import {
  OrganizationCommercialSummary,
  daysUntilEnd,
} from '../domain/organization-commercial.model';
import { OrganizationSummary } from '../domain/organization.model';

/**
 * The directory's search, filters and sort, held in the URL's query parameters (docs/ARCHITECTURE.md §6) so a view is
 * deep-linkable and survives a refresh. Machine values, never translated. Anything unknown falls back to the default.
 *
 * The subscription filter is the owner's only, and a PROVISIONAL mock capability: it filters, in the browser, the
 * mock commercial facts already loaded; no Core route offers it (CF-02, Billing V2 A10).
 */
export type OrganizationSort = 'newest' | 'oldest' | 'name' | 'memberships' | 'requests';
export type SubscriptionFilter = 'any' | 'active' | 'ending' | 'grace' | 'none';

export interface OrganizationQuery {
  /** Free text matched against the name (trimmed, case- and accent-insensitive). */
  readonly q: string;
  /** Only Organizations with membership requests awaiting approval. */
  readonly requests: boolean;
  readonly subscription: SubscriptionFilter;
  readonly sort: OrganizationSort;
}

export const DEFAULT_QUERY: OrganizationQuery = {
  q: '',
  requests: false,
  subscription: 'any',
  sort: 'newest',
};

export const SORTS: readonly OrganizationSort[] = [
  'newest',
  'oldest',
  'name',
  'memberships',
  'requests',
];
export const SUBSCRIPTION_FILTERS: readonly SubscriptionFilter[] = [
  'any',
  'active',
  'ending',
  'grace',
  'none',
];

/** The longest search kept from a URL: a name is at most 200 characters in Core. */
const MAX_QUERY_LENGTH = 200;

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/** Query parameters (a URL's, as the router parses them) → the query; malformed values fall back to defaults. */
export function parseQuery(params: Params): OrganizationQuery {
  const q: unknown = params['q'];
  return {
    q: typeof q === 'string' ? q.slice(0, MAX_QUERY_LENGTH) : '',
    requests: params['requests'] === '1',
    subscription: oneOf(SUBSCRIPTION_FILTERS, params['subscription'], 'any'),
    sort: oneOf(SORTS, params['sort'], 'newest'),
  };
}

/** The query → query parameters; defaults are left out, so the plain URL is the default view. */
export function toQueryParams(query: OrganizationQuery): Params {
  const params: Params = {};
  if (query.q.trim() !== '') params['q'] = query.q;
  if (query.requests) params['requests'] = '1';
  if (query.subscription !== 'any') params['subscription'] = query.subscription;
  if (query.sort !== 'newest') params['sort'] = query.sort;
  return params;
}

/** One directory row: the Organization, and the owner's commercial facts when they are loaded (else `null`). */
export interface DirectoryRow {
  readonly organization: OrganizationSummary;
  readonly commercial: OrganizationCommercialSummary | null;
}

const value = (metric: Metric): number => (metric.status === 'available' ? metric.value : -1);

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

function matchesSubscription(row: DirectoryRow, filter: SubscriptionFilter, now: number): boolean {
  if (filter === 'any') return true;
  const subscription = row.commercial?.subscription;
  if (subscription === undefined) return false;
  if (filter === 'ending') return daysUntilEnd(subscription, now) !== null;
  return subscription.state === filter;
}

/**
 * Pure: filters and sorts the rows. `subscriptionFilter` is applied only when the caller has the commercial facts
 * (the owner's); otherwise it is ignored. Ties keep a stable order by name, then id. Unknown counts sort last.
 */
export function applyQuery(
  rows: readonly DirectoryRow[],
  query: OrganizationQuery,
  options: {
    readonly now: number;
    readonly collator: Intl.Collator;
    readonly subscriptions: boolean;
  },
): readonly DirectoryRow[] {
  const q = fold(query.q.trim());
  const byName = (a: DirectoryRow, b: DirectoryRow) =>
    options.collator.compare(a.organization.name, b.organization.name) ||
    a.organization.id.localeCompare(b.organization.id);
  const compare: Record<OrganizationSort, (a: DirectoryRow, b: DirectoryRow) => number> = {
    newest: (a, b) =>
      b.organization.createdAt.localeCompare(a.organization.createdAt) || byName(a, b),
    oldest: (a, b) =>
      a.organization.createdAt.localeCompare(b.organization.createdAt) || byName(a, b),
    name: byName,
    memberships: (a, b) =>
      value(b.organization.memberships) - value(a.organization.memberships) || byName(a, b),
    requests: (a, b) =>
      value(b.organization.pendingRequests) - value(a.organization.pendingRequests) || byName(a, b),
  };
  return rows
    .filter((row) => q === '' || fold(row.organization.name).includes(q))
    .filter((row) => !query.requests || value(row.organization.pendingRequests) > 0)
    .filter(
      (row) => !options.subscriptions || matchesSubscription(row, query.subscription, options.now),
    )
    .sort(compare[query.sort]);
}
