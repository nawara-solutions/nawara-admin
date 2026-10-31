import { DestroyRef, Signal, computed, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Observable, Subject, combineLatest, startWith } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import {
  AssistanceReadFailure,
  assistanceReadFailureOf,
  noContext,
} from '../data-access/assistance-read-failure';
import { AssistanceReadContext, assistanceReadContext } from '../domain/assistance-read-context';
import { AssistancePage, AssistancePageRequest } from '../domain/assistance-read.model';

/**
 * Keyset-paged lists of the owner's Assistance overviews (A7 disputes and exceptions, A8 late settlements and cash returns): one
 * list each, in the owner's Company scope, read through the A2 gateway. Read only.
 */

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

export interface ListRequest<Q> {
  readonly context: AssistanceReadContext | AssistanceReadFailure;
  readonly query: Q;
}

/**
 * One keyset-paged list, read again whenever its request changes or on `reload`; "Show more" is single flight and a late answer
 * of an earlier request is dropped.
 */
export class PagedList<Q, T> {
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
 * The owner's Company read context, equal by value (the same answer reads nothing again); anyone but the owner gets a local refusal
 * and no request.
 */
export function ownerCompanyContext(
  session: AuthSession,
): Signal<AssistanceReadContext | AssistanceReadFailure> {
  return computed<AssistanceReadContext | AssistanceReadFailure>(
    () => {
      const actor = session.actor();
      if (!can(actor, 'company.assistance.view')) return noContext('notOwner');
      const result = assistanceReadContext(actor, { kind: 'company' }, null);
      return result.ok ? result.context : noContext(result.refusal);
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) },
  );
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
