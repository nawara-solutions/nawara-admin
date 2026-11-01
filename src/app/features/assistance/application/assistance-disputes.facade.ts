import { DestroyRef, Injectable, computed, inject } from '@angular/core';
import { Params, Router } from '@angular/router';
import { AuthSession } from '../../../core/auth/auth-session';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_EXCEPTIONS,
  EXCEPTION_FILTER,
  AssistanceException,
} from '../domain/assistance-exceptions';
import {
  AssistanceCaseSummary,
  AssistanceDisputeFilter,
  AssistanceDisputeSummary,
} from '../domain/assistance-read.model';
import {
  ASSISTANCE_DISPUTE_REASONS,
  ASSISTANCE_DISPUTE_STATES,
  AssistanceDisputeReason,
  AssistanceDisputeState,
} from '../domain/assistance.model';
import { PagedList, ownerCompanyContext } from './assistance-paged-list';
import { oneOf, pageQuery, single, writePageQuery } from './assistance-url-state';

export { ASSISTANCE_DISPUTES_PAGE_SIZE, type AssistanceListView } from './assistance-paged-list';

/** What the owner asks the dispute list for. `state: null`: open and resolved. */
export interface AssistanceDisputeQuery {
  readonly state: AssistanceDisputeState | null;
  readonly reason: AssistanceDisputeReason | null;
}

export const DEFAULT_DISPUTE_QUERY: AssistanceDisputeQuery = { state: 'open', reason: null };

/** The first exception shown: a reported collection that is not settled (never a payment). */
export const DEFAULT_EXCEPTION: AssistanceException = 'collectionReportedNotSettled';

/** The overview's address (A11): its query string holds the dispute filters and the exception shown. */
export const ASSISTANCE_DISPUTES_PATH = '/billing/assistance/disputes';

interface DisputesPageQuery {
  readonly disputes: AssistanceDisputeQuery;
  readonly exception: AssistanceException;
}

/** The overview's query from the address (A11; untrusted: anything outside Core's closed sets is dropped). `state=all`: no filter. */
export function disputesQueryOf(params: Params): DisputesPageQuery {
  const state = single(params, 'state');
  return {
    disputes: {
      state: state === 'all' ? null : (oneOf(ASSISTANCE_DISPUTE_STATES, state) ?? 'open'),
      reason: oneOf(ASSISTANCE_DISPUTE_REASONS, single(params, 'reason')),
    },
    exception: oneOf(ASSISTANCE_EXCEPTIONS, single(params, 'exception')) ?? DEFAULT_EXCEPTION,
  };
}

function disputesParamsOf(query: DisputesPageQuery): Readonly<Record<string, string | null>> {
  const state = query.disputes.state;
  return {
    state: state === 'open' ? null : (state ?? 'all'),
    reason: query.disputes.reason,
    exception: query.exception === DEFAULT_EXCEPTION ? null : query.exception,
  };
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
  private readonly router = inject(Router);

  /** The overview's query, from the address (A11). */
  private readonly pageQuery = pageQuery(this.router, ASSISTANCE_DISPUTES_PATH, disputesQueryOf);
  readonly disputeQuery = computed(() => this.pageQuery().disputes, {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  readonly exception = computed(() => this.pageQuery().exception);

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
    this.write({ ...this.pageQuery(), disputes: { ...this.disputeQuery(), ...change } });
  }

  selectException(exception: AssistanceException): void {
    this.write({ ...this.pageQuery(), exception });
  }

  private write(query: DisputesPageQuery): void {
    writePageQuery(this.router, ASSISTANCE_DISPUTES_PATH, disputesParamsOf(query));
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
