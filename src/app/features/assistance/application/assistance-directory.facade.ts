import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Params, Router } from '@angular/router';
import { Subject, combineLatest, startWith } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId, PlatformRef, platformId } from '../../../core/context/scope.model';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import {
  AssistanceReadFailure,
  assistanceReadFailureOf,
  noContext,
} from '../data-access/assistance-read-failure';
import {
  AssistanceReadContext,
  assistanceReadContext,
  selectionId,
} from '../domain/assistance-read-context';
import {
  AssistanceCaseFilter,
  AssistanceCaseOrder,
  AssistanceCaseSummary,
} from '../domain/assistance-read.model';
import {
  ASSISTANCE_REQUEST_STATES,
  AssistanceRequestState,
  SETTLEMENT_CHANNEL_STATES,
  SettlementChannelState,
} from '../domain/assistance.model';
import { oneOf, pageQuery, single, writePageQuery } from './assistance-url-state';

/** The indicator filter: machine values, never translated. */
export type AssistanceIndicatorFilter =
  'all' | 'overdue' | 'disputed' | 'cashReturnOwed' | 'lateUnapplied' | 'recoveryOpen';

export const INDICATOR_FILTERS: readonly AssistanceIndicatorFilter[] = [
  'all',
  'overdue',
  'disputed',
  'cashReturnOwed',
  'lateUnapplied',
  'recoveryOpen',
];
export const CASE_ORDERS: readonly AssistanceCaseOrder[] = ['consentNewest', 'consentOldest'];

/** What the owner asks the directory for. `reference`: one case's canonical reference, from the search. */
export interface AssistanceDirectoryQuery {
  readonly platform: PlatformId | null;
  readonly state: AssistanceRequestState | null;
  /** The settlement channel's state (A6). */
  readonly channel: SettlementChannelState | null;
  readonly indicator: AssistanceIndicatorFilter;
  readonly order: AssistanceCaseOrder;
  readonly reference: string | null;
}

export const DEFAULT_DIRECTORY_QUERY: AssistanceDirectoryQuery = {
  platform: null,
  state: null,
  channel: null,
  indicator: 'all',
  order: 'consentNewest',
  reference: null,
};

/** The directory's address (A11): its query string holds the owner's filters, order and search. */
export const ASSISTANCE_DIRECTORY_PATH = '/billing/assistance';

/**
 * The directory query from the address (A11). Untrusted: a value outside Core's closed sets, or a reference that is not a full case
 * reference, is dropped (never sent). A Platform id is kept as written: one outside the Company is Core's not found, as before.
 */
export function directoryQueryOf(params: Params): AssistanceDirectoryQuery {
  const platform = single(params, 'platform');
  const reference = single(params, 'ref');
  return {
    platform: platform === null || platform === '' ? null : platformId(platform),
    state: oneOf(ASSISTANCE_REQUEST_STATES, single(params, 'state')),
    channel: oneOf(SETTLEMENT_CHANNEL_STATES, single(params, 'channel')),
    indicator: oneOf(INDICATOR_FILTERS, single(params, 'attention')) ?? 'all',
    order: oneOf(CASE_ORDERS, single(params, 'order')) ?? 'consentNewest',
    reference: reference === null ? null : selectionId({ kind: 'case', requestId: reference }),
  };
}

/** The address's query of a directory query: defaults are left out, so the plain address is the default view. */
export function directoryParamsOf(
  query: AssistanceDirectoryQuery,
): Readonly<Record<string, string | null>> {
  return {
    ref: query.reference,
    platform: query.platform,
    state: query.state,
    channel: query.channel,
    attention: query.indicator === 'all' ? null : query.indicator,
    order: query.order === 'consentNewest' ? null : query.order,
  };
}

/** Cases per page ("Show more" asks for the next keyset page). */
export const ASSISTANCE_DIRECTORY_PAGE_SIZE = 10;

/** What the Assistance case directory shows. */
export type AssistanceDirectoryView =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  /** No adapter in this build (every non-demo build: Core has no owner read, CF-70). */
  | { readonly status: 'notInBuild' }
  /** Billing answered that it is unavailable, or no answer came: nothing was read. */
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' }
  /** The searched reference, the Platform or the Company is not in this scope (Core's one answer: not found). */
  | { readonly status: 'notFound' }
  /** The Company has no assistance case at all. */
  | { readonly status: 'empty' }
  /** No case matches the filters. */
  | { readonly status: 'noMatch' }
  | {
      readonly status: 'ready';
      readonly rows: readonly AssistanceCaseSummary[];
      readonly more: boolean;
      readonly loadingMore: boolean;
      readonly moreFailed: boolean;
    };

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: AssistanceReadFailure }
  | {
      readonly status: 'loaded';
      readonly rows: readonly AssistanceCaseSummary[];
      readonly next: string | null;
      readonly loadingMore: boolean;
      readonly moreFailed: boolean;
    };

/**
 * The owner's Assistance case directory (`/billing/assistance`; Assistance A4). READ ONLY: it reads through the A2 gateway and
 * offers no decision, command or payment. The Company owner only; anyone else gets `forbidden` and no request (UX: the route
 * guard already sends an operator away, and Core refuses them). Filters, order and search are sent to the gateway; nothing is
 * computed from amounts, and nothing is counted beyond the cases shown. Since A11 the query lives in the address.
 */
@Injectable()
export class AssistanceDirectoryFacade {
  private readonly gateway = inject(AssistanceGateway);
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly reloads = new Subject<void>();
  private readonly loaded = signal<Loaded>({ status: 'loading' });
  /** Increments with every new first page: a late "Show more" answer of an earlier query is dropped. */
  private generation = 0;

  /** The owner's query, from the address (A11): a deep link, a reload, back and forward all show the same view. */
  readonly query = pageQuery(this.router, ASSISTANCE_DIRECTORY_PATH, directoryQueryOf);

  /** The Company's Platforms, for the Platform filter and the Platform column (owner only). */
  readonly platforms = computed<readonly PlatformRef[]>(() => {
    const platforms = this.scope.platforms();
    return platforms.status === 'success' ? platforms.data : [];
  });

  /** Equal by value, so a reload of the Company's Platforms with the same answer reads nothing again. */
  private readonly context = computed<AssistanceReadContext | AssistanceReadFailure>(
    () => {
      const actor = this.session.actor();
      if (!can(actor, 'company.assistance.view')) return noContext('notOwner');
      const platform = this.query().platform;
      const known = this.scope.platforms();
      const result = assistanceReadContext(
        actor,
        platform === null ? { kind: 'company' } : { kind: 'platform', platformId: platform },
        known.status === 'success' ? known.data.map((p) => p.id) : null,
      );
      return result.ok ? result.context : noContext(result.refusal);
    },
    {
      equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
    },
  );

  readonly view = computed<AssistanceDirectoryView>(() => {
    const loaded = this.loaded();
    const query = this.query();
    switch (loaded.status) {
      case 'loading':
        return { status: 'loading' };
      case 'failed':
        return viewOf(loaded.failure);
      case 'loaded':
        if (loaded.rows.length > 0)
          return {
            status: 'ready',
            rows: loaded.rows,
            more: loaded.next !== null,
            loadingMore: loaded.loadingMore,
            moreFailed: loaded.moreFailed,
          };
        if (query.reference !== null) return { status: 'notFound' };
        return filtered(query) ? { status: 'noMatch' } : { status: 'empty' };
    }
  });

  /** Every change of context or query reads the first page again. */
  private readonly request = computed(() => ({ context: this.context(), query: this.query() }));

  constructor() {
    combineLatest([toObservable(this.request), this.reloads.pipe(startWith(undefined))])
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(([{ context, query }]) => this.loadFirst(context, query));
  }

  /** Changes the query (filters, order or search); the first page is read again. */
  update(change: Partial<AssistanceDirectoryQuery>): void {
    this.write({ ...this.query(), ...change });
  }

  /** Back to every case of the Company, newest first. */
  clear(): void {
    this.write(DEFAULT_DIRECTORY_QUERY);
  }

  private write(query: AssistanceDirectoryQuery): void {
    writePageQuery(this.router, ASSISTANCE_DIRECTORY_PATH, directoryParamsOf(query));
  }

  reload(): void {
    this.reloads.next();
  }

  /** Reads the next keyset page and appends it (single flight). */
  loadMore(): void {
    const loaded = this.loaded();
    const context = this.context();
    if (loaded.status !== 'loaded' || loaded.next === null || loaded.loadingMore) return;
    if ('kind' in context) return;
    const generation = this.generation;
    this.loaded.set({ ...loaded, loadingMore: true, moreFailed: false });
    this.gateway
      .cases(context, filterOf(this.query()), {
        after: loaded.next,
        limit: ASSISTANCE_DIRECTORY_PAGE_SIZE,
      })
      .subscribe({
        next: (page) => {
          if (generation !== this.generation) return;
          this.loaded.set({
            status: 'loaded',
            rows: [...loaded.rows, ...page.items],
            next: page.next,
            loadingMore: false,
            moreFailed: false,
          });
        },
        error: () => {
          if (generation !== this.generation) return;
          this.loaded.set({ ...loaded, loadingMore: false, moreFailed: true });
        },
      });
  }

  private loadFirst(
    context: AssistanceReadContext | AssistanceReadFailure,
    query: AssistanceDirectoryQuery,
  ): void {
    this.generation += 1;
    const generation = this.generation;
    if ('kind' in context) {
      // The Company's Platforms are still loading: wait, never guess.
      this.loaded.set(
        context.kind === 'noContext' && context.refusal === 'platformsUnknown'
          ? { status: 'loading' }
          : { status: 'failed', failure: context },
      );
      return;
    }
    this.loaded.set({ status: 'loading' });
    this.gateway
      .cases(context, filterOf(query), {
        after: null,
        limit: ASSISTANCE_DIRECTORY_PAGE_SIZE,
      })
      .subscribe({
        next: (page) => {
          if (generation !== this.generation) return;
          this.loaded.set({
            status: 'loaded',
            rows: page.items,
            next: page.next,
            loadingMore: false,
            moreFailed: false,
          });
        },
        error: (error: unknown) => {
          if (generation !== this.generation) return;
          this.loaded.set({ status: 'failed', failure: assistanceReadFailureOf(error) });
        },
      });
  }
}

const filtered = (query: AssistanceDirectoryQuery): boolean =>
  query.platform !== null ||
  query.state !== null ||
  query.channel !== null ||
  query.indicator !== 'all';

/** The query as the gateway's filter: absent fields are no filter. */
function filterOf(query: AssistanceDirectoryQuery): AssistanceCaseFilter {
  return {
    order: query.order,
    ...(query.reference === null ? {} : { requestId: query.reference }),
    ...(query.platform === null ? {} : { platformId: query.platform }),
    ...(query.state === null ? {} : { state: query.state }),
    ...(query.indicator === 'overdue' ? { overdue: true } : {}),
    ...(query.indicator === 'disputed' ? { disputed: true } : {}),
    ...(query.indicator === 'cashReturnOwed' ? { cashReturnOwed: true } : {}),
    ...(query.indicator === 'lateUnapplied' ? { lateUnapplied: true } : {}),
    ...(query.indicator === 'recoveryOpen' ? { recoveryOpen: true } : {}),
    ...(query.channel === null ? {} : { channel: query.channel }),
  };
}

function viewOf(failure: AssistanceReadFailure): AssistanceDirectoryView {
  switch (failure.kind) {
    case 'notInBuild':
      return { status: 'notInBuild' };
    case 'noContext':
      return failure.refusal === 'platformNotInCompany'
        ? { status: 'notFound' }
        : { status: 'forbidden' };
    case 'signedOut':
    case 'forbidden':
      return { status: 'forbidden' };
    case 'notFound':
      return { status: 'notFound' };
    case 'unavailable':
    case 'rateLimited':
    case 'network':
      return { status: 'unavailable' };
    case 'invalidRequest':
    case 'unexpected':
      return { status: 'error' };
  }
}
