import { Params } from '@angular/router';
import { PlatformId, platformId } from '../../../core/context/scope.model';
import {
  ACCOUNT_STATES,
  OperatorAccountState,
  OperatorSummary,
  contactText,
} from '../domain/operator.model';

/**
 * The directory's Platform filter, account-state filter and sort, held in the URL's query parameters (shareable,
 * survives a refresh). The SEARCH is not: it matches contacts (emails and phones), which never go into a URL; it lives
 * in the page only. Machine values, never translated; anything unknown falls back to the default.
 */
export type OperatorSort = 'contact' | 'platforms' | 'newest';

/** `any`: every operator; `none`: operators with no active assignment; else one Platform's operators. */
export type PlatformFilter = 'any' | 'none' | PlatformId;
export type AccountStateFilter = 'any' | OperatorAccountState;

export interface OperatorQuery {
  readonly platform: PlatformFilter;
  readonly state: AccountStateFilter;
  readonly sort: OperatorSort;
}

export const DEFAULT_OPERATOR_QUERY: OperatorQuery = {
  platform: 'any',
  state: 'any',
  sort: 'contact',
};

export const OPERATOR_SORTS: readonly OperatorSort[] = ['contact', 'platforms', 'newest'];
export const STATE_FILTERS: readonly AccountStateFilter[] = ['any', ...ACCOUNT_STATES];

/** A Platform id is UUID-shaped; anything else in the URL is ignored. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/** Query parameters → the query; malformed values fall back to defaults. */
export function parseOperatorQuery(params: Params): OperatorQuery {
  const platform: unknown = params['platform'];
  return {
    platform:
      platform === 'none'
        ? 'none'
        : typeof platform === 'string' && UUID.test(platform)
          ? platformId(platform.toLowerCase())
          : 'any',
    state: oneOf(STATE_FILTERS, params['state'], 'any'),
    sort: oneOf(OPERATOR_SORTS, params['sort'], 'contact'),
  };
}

/** The query → query parameters; defaults are left out, so the plain URL is the default view. */
export function toOperatorQueryParams(query: OperatorQuery): Params {
  const params: Params = {};
  if (query.platform !== 'any') params['platform'] = query.platform;
  if (query.state !== 'any') params['state'] = query.state;
  if (query.sort !== 'contact') params['sort'] = query.sort;
  return params;
}

const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/** Digits only, so `+999 (0000) 0001` finds `+99900000001`. */
const digits = (text: string): string => text.replace(/\D/g, '');

function matchesSearch(operator: OperatorSummary, search: string): boolean {
  const q = fold(search.trim());
  if (q === '') return true;
  const contact = fold(contactText(operator.contact));
  if (contact.includes(q)) return true;
  const d = digits(q);
  return operator.contact.kind === 'phone' && d !== '' && digits(contact).includes(d);
}

function matchesPlatform(operator: OperatorSummary, filter: PlatformFilter): boolean {
  if (filter === 'any') return true;
  if (filter === 'none') return operator.activePlatformIds.length === 0;
  return operator.activePlatformIds.includes(filter);
}

/**
 * Pure: searches, filters and sorts the loaded operators (nothing is requested). Ties keep a stable order by contact,
 * then id.
 */
export function applyOperatorQuery(
  operators: readonly OperatorSummary[],
  query: OperatorQuery,
  search: string,
  collator: Intl.Collator,
): readonly OperatorSummary[] {
  const byContact = (a: OperatorSummary, b: OperatorSummary) =>
    collator.compare(contactText(a.contact), contactText(b.contact)) || a.id.localeCompare(b.id);
  const compare: Record<OperatorSort, (a: OperatorSummary, b: OperatorSummary) => number> = {
    contact: byContact,
    platforms: (a, b) => b.activePlatformIds.length - a.activePlatformIds.length || byContact(a, b),
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || byContact(a, b),
  };
  return operators
    .filter((o) => matchesSearch(o, search))
    .filter((o) => matchesPlatform(o, query.platform))
    .filter((o) => query.state === 'any' || o.accountState === query.state)
    .sort(compare[query.sort]);
}
