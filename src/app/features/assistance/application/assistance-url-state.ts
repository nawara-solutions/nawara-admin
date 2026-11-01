import { Signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router } from '@angular/router';
import { distinctUntilChanged, filter, map } from 'rxjs';

/**
 * URL-backed view state of the Assistance pages (A11): the filters, order and search of each overview live in the address's query
 * string, so a deep link, a reload, the browser's back and forward buttons and a return from a case all show the same view.
 *
 * - Only machine values the owner already sees are written (states, reasons, order, a Platform id, a case reference): no secret, no
 *   receipt, no step-up data. Nothing is kept in browser storage.
 * - Every value read from the URL is untrusted: each page parses it against Core's closed sets and drops anything else (never sent).
 * - A filter change REPLACES the current history entry: back leaves the page instead of stepping through every filter.
 * - Keyset pages ("Show more") are not restored: a cursor is only valid for the list it came from, so the first page is read again.
 */

const pathOf = (url: string): string => url.split(/[?#]/)[0] ?? '';

/**
 * The parsed query of one page, kept while the address is that page (a navigation away never changes it, so no read is made while
 * the page is being left). Starts from the navigation in progress when the page is created, else the current address.
 */
export function pageQuery<Q>(
  router: Router,
  path: string,
  parse: (params: Params) => Q,
  equal: (a: Q, b: Q) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
): Signal<Q> {
  const read = (url: string): Q => parse(router.parseUrl(url).queryParams);
  const pending = router.currentNavigation()?.finalUrl;
  const initialUrl = pending ? router.serializeUrl(pending) : router.url;
  const initial = read(pathOf(initialUrl) === path ? initialUrl : path);
  return toSignal(
    router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      filter((url) => pathOf(url) === path),
      map(read),
      distinctUntilChanged(equal),
    ),
    { initialValue: initial },
  );
}

/** Writes a page's query (absent and `null` values are left out), replacing the current history entry. */
export function writePageQuery(
  router: Router,
  path: string,
  params: Readonly<Record<string, string | null>>,
): void {
  const queryParams = Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string] => entry[1] !== null),
  );
  void router.navigateByUrl(router.createUrlTree([path], { queryParams }), { replaceUrl: true });
}

/** One query value as a single string (a repeated parameter is refused, never guessed). */
export const single = (params: Params, name: string): string | null => {
  const value: unknown = params[name];
  return typeof value === 'string' ? value : null;
};

/** One of a closed set, else `null`. */
export const oneOf = <T extends string>(values: readonly T[], value: string | null): T | null =>
  values.find((v) => v === value) ?? null;

// ── Returning from a case ─────────────────────────────────────────────────────────────────────────────────────────────

/** The Assistance list pages a case can be opened from, and the key of each one's back link. */
export const ASSISTANCE_LIST_PAGES = {
  '/billing/assistance': 'directory',
  '/billing/assistance/disputes': 'disputes',
  '/billing/assistance/settlements': 'settlements',
  '/billing/assistance/recovery': 'recovery',
} as const;
export type AssistanceListPage = (typeof ASSISTANCE_LIST_PAGES)[keyof typeof ASSISTANCE_LIST_PAGES];

/** The history-state key a case link carries: the list address (with its filters) to return to. */
export const RETURN_STATE_KEY = 'assistanceReturn';

/** The navigation state of a link to a case: where to come back to (the current list, with its filters). */
export const returnStateOf = (router: Router): Record<string, string> => ({
  [RETURN_STATE_KEY]: router.url,
});

export interface AssistanceReturn {
  readonly page: AssistanceListPage;
  /** The list address to go back to, query included. */
  readonly url: string;
}

/**
 * Where a case page's back link goes: the list it was opened from, with its filters, when the history entry says so and that
 * address is one of the Assistance lists; otherwise (a deep link, a bookmark, anything else) the case directory. The value comes
 * from history state and is untrusted: only a known list path is accepted, never another address.
 */
export function assistanceReturnOf(state: unknown): AssistanceReturn {
  const fallback: AssistanceReturn = { page: 'directory', url: '/billing/assistance' };
  if (typeof state !== 'object' || state === null || !(RETURN_STATE_KEY in state)) return fallback;
  const url: unknown = (state as Record<string, unknown>)[RETURN_STATE_KEY];
  if (typeof url !== 'string' || !url.startsWith('/')) return fallback;
  const page = (ASSISTANCE_LIST_PAGES as Record<string, AssistanceListPage | undefined>)[
    pathOf(url)
  ];
  return page === undefined || url.includes('#') ? fallback : { page, url };
}
