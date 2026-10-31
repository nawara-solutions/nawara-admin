import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AuthSession } from '../../../core/auth/auth-session';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import { EXCEPTION_FILTER, AssistanceException } from '../domain/assistance-exceptions';
import {
  AssistanceCaseSummary,
  AssistanceDisputeFilter,
  AssistanceDisputeSummary,
} from '../domain/assistance-read.model';
import { AssistanceDisputeReason, AssistanceDisputeState } from '../domain/assistance.model';
import { PagedList, ownerCompanyContext } from './assistance-paged-list';

export { ASSISTANCE_DISPUTES_PAGE_SIZE, type AssistanceListView } from './assistance-paged-list';

/** What the owner asks the dispute list for. `state: null`: open and resolved. */
export interface AssistanceDisputeQuery {
  readonly state: AssistanceDisputeState | null;
  readonly reason: AssistanceDisputeReason | null;
}

export const DEFAULT_DISPUTE_QUERY: AssistanceDisputeQuery = { state: 'open', reason: null };

/** The first exception shown: a reported collection that is not settled (never a payment). */
export const DEFAULT_EXCEPTION: AssistanceException = 'collectionReportedNotSettled';

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

  private readonly context = ownerCompanyContext(this.session);

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
