import { DestroyRef, Injectable, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, Subject, combineLatest, startWith } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import {
  AssistanceReadFailure,
  assistanceReadFailureOf,
  noContext,
} from '../data-access/assistance-read-failure';
import { EXCEPTION_FILTER, AssistanceException } from '../domain/assistance-exceptions';
import { AssistanceReadContext, assistanceReadContext } from '../domain/assistance-read-context';
import {
  AssistanceCaseSummary,
  AssistanceDisputeFilter,
  AssistanceDisputeSummary,
  AssistancePage,
  AssistancePageRequest,
} from '../domain/assistance-read.model';
import { AssistanceDisputeReason, AssistanceDisputeState } from '../domain/assistance.model';

/** What the owner asks the dispute list for. `state: null`: open and resolved. */
export interface AssistanceDisputeQuery {
  readonly state: AssistanceDisputeState | null;
  readonly reason: AssistanceDisputeReason | null;
}

export const DEFAULT_DISPUTE_QUERY: AssistanceDisputeQuery = { state: 'open', reason: null };

/** The first exception shown: a reported collection that is not settled (never a payment). */
export const DEFAULT_EXCEPTION: AssistanceException = 'collectionReportedNotSettled';

/** Rows per page of each list ("Show more" asks for the next keyset page). */
export const ASSISTANCE_DISPUTES_PAGE_SIZE = 10;

/** One list of the overview. `none`: nothing matches (or the Company has no case at all). */
export type AssistanceListView<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  /** No adapter in this build (every non-demo build: Core has no owner read, CF-70). */
  | { readonly status: 'notInBuild' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' }
  | { readonly status: 'none' }
  | {
      readonly status: 'ready';
      readonly rows: readonly T[];
      readonly more: boolean;
      readonly loadingMore: boolean;
      readonly moreFailed: boolean;
    };

type Loaded<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: AssistanceReadFailure }
  | {
      readonly status: 'loaded';
      readonly rows: readonly T[];
      readonly next: string | null;
      readonly loadingMore: boolean;
      readonly moreFailed: boolean;
    };

interface ListRequest<Q> {
  readonly context: AssistanceReadContext | AssistanceReadFailure;
  readonly query: Q;
}

/**
 * One keyset-paged list, read again whenever its request changes or on `reload`; "Show more" is single flight and a late answer
 * of an earlier request is dropped.
 */
class PagedList<Q, T> {
  private readonly loaded = signal<Loaded<T>>({ status: 'loading' });
  private readonly reloads = new Subject<void>();
  private generation = 0;

  readonly view: Signal<AssistanceListView<T>> = computed(() => {
    const loaded = this.loaded();
    switch (loaded.status) {
      case 'loading':
        return { status: 'loading' };
      case 'failed':
        return viewOf(loaded.failure);
      case 'loaded':
        return loaded.rows.length === 0
          ? { status: 'none' }
          : {
              status: 'ready',
              rows: loaded.rows,
              more: loaded.next !== null,
              loadingMore: loaded.loadingMore,
              moreFailed: loaded.moreFailed,
            };
    }
  });

  constructor(
    private readonly request: Signal<ListRequest<Q>>,
    private readonly read: (
      context: AssistanceReadContext,
      query: Q,
      page: AssistancePageRequest,
    ) => Observable<AssistancePage<T>>,
    destroyRef: DestroyRef,
  ) {
    combineLatest([toObservable(request), this.reloads.pipe(startWith(undefined))])
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(([{ context, query }]) => this.first(context, query));
  }

  reload(): void {
    this.reloads.next();
  }

  more(): void {
    const loaded = this.loaded();
    const { context, query } = this.request();
    if (loaded.status !== 'loaded' || loaded.next === null || loaded.loadingMore) return;
    if ('kind' in context) return;
    const generation = this.generation;
    this.loaded.set({ ...loaded, loadingMore: true, moreFailed: false });
    this.read(context, query, {
      after: loaded.next,
      limit: ASSISTANCE_DISPUTES_PAGE_SIZE,
    }).subscribe({
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

  private first(context: AssistanceReadContext | AssistanceReadFailure, query: Q): void {
    this.generation += 1;
    const generation = this.generation;
    if ('kind' in context) {
      this.loaded.set({ status: 'failed', failure: context });
      return;
    }
    this.loaded.set({ status: 'loading' });
    this.read(context, query, { after: null, limit: ASSISTANCE_DISPUTES_PAGE_SIZE }).subscribe({
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

/**
 * The owner's Assistance DISPUTES & EXCEPTIONS overview (`/billing/assistance/disputes`; Assistance A7). READ ONLY: two lists
 * through the A2 gateway, in the owner's Company scope: the disputes (a demo-only projection of the scoped cases; Core has no
 * owner list, CF-70) and the cases of one exception category (the existing directory filters, `EXCEPTION_FILTER`). No decision,
 * correction, resolution or payment exists here. The Company owner only; anyone else gets `forbidden` and no request.
 */
@Injectable()
export class AssistanceDisputesFacade {
  private readonly gateway = inject(AssistanceGateway);
  private readonly session = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);

  readonly disputeQuery = signal<AssistanceDisputeQuery>(DEFAULT_DISPUTE_QUERY);
  readonly exception = signal<AssistanceException>(DEFAULT_EXCEPTION);

  /** Equal by value, so the same answer reads nothing again. */
  private readonly context = computed<AssistanceReadContext | AssistanceReadFailure>(
    () => {
      const actor = this.session.actor();
      if (!can(actor, 'company.assistance.view')) return noContext('notOwner');
      const result = assistanceReadContext(actor, { kind: 'company' }, null);
      return result.ok ? result.context : noContext(result.refusal);
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );

  private readonly disputeList = new PagedList<AssistanceDisputeQuery, AssistanceDisputeSummary>(
    computed(() => ({ context: this.context(), query: this.disputeQuery() })),
    (context, query, page) => this.gateway.disputeCases(context, disputeFilterOf(query), page),
    this.destroyRef,
  );

  private readonly exceptionList = new PagedList<AssistanceException, AssistanceCaseSummary>(
    computed(() => ({ context: this.context(), query: this.exception() })),
    (context, exception, page) =>
      this.gateway.cases(context, { ...EXCEPTION_FILTER[exception], order: 'consentOldest' }, page),
    this.destroyRef,
  );

  readonly disputes = this.disputeList.view;
  readonly exceptionCases = this.exceptionList.view;

  updateDisputes(change: Partial<AssistanceDisputeQuery>): void {
    this.disputeQuery.update((query) => ({ ...query, ...change }));
  }

  selectException(exception: AssistanceException): void {
    this.exception.set(exception);
  }

  moreDisputes(): void {
    this.disputeList.more();
  }

  moreExceptionCases(): void {
    this.exceptionList.more();
  }

  reload(): void {
    this.disputeList.reload();
    this.exceptionList.reload();
  }
}

function disputeFilterOf(query: AssistanceDisputeQuery): AssistanceDisputeFilter {
  return {
    ...(query.state === null ? {} : { state: query.state }),
    ...(query.reason === null ? {} : { reason: query.reason }),
  };
}

function viewOf<T>(failure: AssistanceReadFailure): AssistanceListView<T> {
  switch (failure.kind) {
    case 'notInBuild':
      return { status: 'notInBuild' };
    case 'noContext':
    case 'signedOut':
    case 'forbidden':
      return { status: 'forbidden' };
    // Company scope: a not-found here is the Company itself, Core's one answer; nothing to show.
    case 'notFound':
      return { status: 'none' };
    case 'unavailable':
    case 'rateLimited':
    case 'network':
      return { status: 'unavailable' };
    case 'invalidRequest':
    case 'unexpected':
      return { status: 'error' };
  }
}
