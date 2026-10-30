import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  Observable,
  Subject,
  combineLatest,
  expand,
  forkJoin,
  map,
  of,
  reduce,
  startWith,
  switchMap,
} from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
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
  ASSISTANCE_PAGE_LIMIT,
  AssistanceCaseDetail,
  AssistancePage,
  AssistanceTimelineEntry,
  LateSettlementDetail,
  RecoveryObligationDetail,
} from '../domain/assistance-read.model';

/** Everything the case page shows, read once per case. */
export interface AssistanceCaseRecord {
  readonly detail: AssistanceCaseDetail;
  /** Oldest first, as the gateway orders it. */
  readonly timeline: readonly AssistanceTimelineEntry[];
  readonly lateSettlements: readonly LateSettlementDetail[];
  readonly recovery: RecoveryObligationDetail | null;
}

export type AssistanceCaseView =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'notInBuild' }
  /** Unknown, malformed, or another Company's or Platform's case: Core's one answer. */
  | { readonly status: 'notFound' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly record: AssistanceCaseRecord };

/** The case segment of a `/billing/assistance/:requestId` URL (any text; checked before anything is read), or `null`. */
export function assistanceCaseIdFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? '';
  const match = /^\/billing\/assistance\/([^/]+)\/?$/.exec(path);
  if (match === null) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

/** A safety bound on the history pages read for one case (a case has a few dozen events at most). */
const MAX_TIMELINE_PAGES = 5;

/**
 * One Organization Assistance case for the owner (`/billing/assistance/:requestId`; Assistance A5). READ ONLY: it reads the
 * case, its history, its late settlements and its recovery obligation through the A2 gateway, and offers no decision, command
 * or payment. Company scope (the owner's Company): any case outside it is not found. Anyone but the owner gets `forbidden`
 * and no request (UX: the route guard already sends an operator away, and Core refuses them).
 */
@Injectable()
export class AssistanceCaseFacade {
  private readonly gateway = inject(AssistanceGateway);
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly reloads = new Subject<void>();
  private readonly loaded = signal<AssistanceCaseView>({ status: 'loading' });

  /** The case reference from the URL (any text: it is checked before anything is read). */
  readonly requestId = computed(() => assistanceCaseIdFromUrl(this.scope.url()));

  readonly view = this.loaded.asReadonly();

  private readonly context = computed<AssistanceReadContext | AssistanceReadFailure>(() => {
    const actor = this.session.actor();
    if (!can(actor, 'company.assistance.view')) return noContext('notOwner');
    const result = assistanceReadContext(actor, { kind: 'company' }, null);
    return result.ok ? result.context : noContext(result.refusal);
  });

  private readonly request = computed(
    () => ({ context: this.context(), requestId: this.requestId() }),
    {
      equal: (a, b) =>
        a.requestId === b.requestId && JSON.stringify(a.context) === JSON.stringify(b.context),
    },
  );

  constructor() {
    combineLatest([toObservable(this.request), this.reloads.pipe(startWith(undefined))])
      .pipe(
        switchMap(([{ context, requestId }]) => this.read(context, requestId)),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((view) => this.loaded.set(view));
  }

  reload(): void {
    this.reloads.next();
  }

  private read(
    context: AssistanceReadContext | AssistanceReadFailure,
    requestId: string | null,
  ): Observable<AssistanceCaseView> {
    if ('kind' in context) return of(viewOf(context));
    if (requestId === null) return of<AssistanceCaseView>({ status: 'loading' });
    // A malformed reference is not found, and nothing is sent (Core answers 404 without reading).
    const id = selectionId({ kind: 'case', requestId });
    if (id === null) return of<AssistanceCaseView>({ status: 'notFound' });
    const record$ = this.gateway.caseDetail(context, id).pipe(
      switchMap((detail) =>
        forkJoin({
          timeline: this.timeline(context, id),
          lateSettlements:
            detail.lateSettlementIds.length === 0
              ? of<readonly LateSettlementDetail[]>([])
              : forkJoin(
                  detail.lateSettlementIds.map((late) =>
                    this.gateway.lateSettlement(context, late),
                  ),
                ),
          recovery:
            detail.recoveryObligationId === null
              ? of(null)
              : this.gateway.recoveryObligation(context, detail.recoveryObligationId),
        }).pipe(map((parts): AssistanceCaseRecord => ({ detail, ...parts }))),
      ),
      map((record): AssistanceCaseView => ({ status: 'ready', record })),
    );
    return new Observable<AssistanceCaseView>((subscriber) => {
      subscriber.next({ status: 'loading' });
      return record$.subscribe({
        next: (view) => subscriber.next(view),
        error: (error: unknown) => {
          subscriber.next(viewOf(assistanceReadFailureOf(error)));
          subscriber.complete();
        },
        complete: () => subscriber.complete(),
      });
    });
  }

  /** Every page of the case's history (bounded), oldest first. */
  private timeline(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<readonly AssistanceTimelineEntry[]> {
    const page = (after: string | null) =>
      this.gateway.timeline(context, requestId, { after, limit: ASSISTANCE_PAGE_LIMIT.max });
    let pages = 0;
    return page(null).pipe(
      expand((current: AssistancePage<AssistanceTimelineEntry>) => {
        pages += 1;
        return current.next === null || pages >= MAX_TIMELINE_PAGES ? of() : page(current.next);
      }),
      reduce<AssistancePage<AssistanceTimelineEntry>, readonly AssistanceTimelineEntry[]>(
        (all, current) => [...all, ...current.items],
        [],
      ),
    );
  }
}

function viewOf(failure: AssistanceReadFailure): AssistanceCaseView {
  switch (failure.kind) {
    case 'notInBuild':
      return { status: 'notInBuild' };
    case 'noContext':
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
