import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { AuthSession } from '../../../core/auth/auth-session';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import {
  AssistanceCaseDetail,
  AssistanceCashReturnSummary,
  CashReturnFilter,
  LateSettlementDetail,
  LateSettlementFilter,
  LateSettlementStatus,
} from '../domain/assistance-read.model';
import { CashReturnState } from '../domain/assistance.model';
import { PagedList, ownerCompanyContext } from './assistance-paged-list';

export { type AssistanceListView } from './assistance-paged-list';

/** What the owner asks the late-settlement list for. `status: null`: pending and applied. */
export interface LateSettlementQuery {
  readonly status: LateSettlementStatus | null;
}

/** What the owner asks the cash-return monitor for. `null`: no filter. */
export interface CashReturnQuery {
  readonly state: CashReturnState | null;
  readonly disputed: boolean | null;
}

export const DEFAULT_LATE_QUERY: LateSettlementQuery = { status: null };
export const DEFAULT_CASH_RETURN_QUERY: CashReturnQuery = { state: null, disputed: null };

/** One late settlement with its decision state (Core's BIL-32 owner read) and its case (restrictions, returns, disputes). */
export interface AssistanceLateRow {
  readonly late: LateSettlementDetail;
  readonly detail: AssistanceCaseDetail;
}

/**
 * The owner's LATE SETTLEMENTS & CASH RETURNS oversight (`/billing/assistance/settlements`; Assistance A8). READ ONLY: two lists
 * through the A2 gateway, in the owner's Company scope:
 * - late settlements: the existing discovery read (`lateSettlements`; in Core only through BIL-33 reconciliation cases, CF-69 and
 *   CF-77), each row then read by id (`lateSettlement`, Core's BIL-32 owner read) with its case (`caseDetail`; CF-70);
 * - cash returns: a demo-only projection of the scoped cases (`cashReturnCases`; CF-70).
 * No application, receipt, report, confirmation or payment exists here. The Company owner only; anyone else gets `forbidden` and
 * no request.
 */
@Injectable()
export class AssistanceSettlementsFacade {
  private readonly gateway = inject(AssistanceGateway);
  private readonly session = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);

  readonly lateQuery = signal<LateSettlementQuery>(DEFAULT_LATE_QUERY);
  readonly returnQuery = signal<CashReturnQuery>(DEFAULT_CASH_RETURN_QUERY);

  private readonly context = ownerCompanyContext(this.session);

  private readonly lateList = new PagedList<LateSettlementQuery, AssistanceLateRow>(
    computed(() => ({ context: this.context(), query: this.lateQuery() })),
    (context, query, page) =>
      this.gateway.lateSettlements(context, lateFilterOf(query), page).pipe(
        switchMap((found) =>
          found.items.length === 0
            ? of({ items: [], next: found.next })
            : forkJoin(
                found.items.map((item) =>
                  forkJoin({
                    late: this.gateway.lateSettlement(context, item.id),
                    detail: this.gateway.caseDetail(context, item.assistanceRequestId),
                  }),
                ),
              ).pipe(map((items) => ({ items, next: found.next }))),
        ),
      ),
    this.destroyRef,
  );

  private readonly returnList = new PagedList<CashReturnQuery, AssistanceCashReturnSummary>(
    computed(() => ({ context: this.context(), query: this.returnQuery() })),
    (context, query, page) => this.gateway.cashReturnCases(context, returnFilterOf(query), page),
    this.destroyRef,
  );

  readonly lateSettlements = this.lateList.view;
  readonly cashReturns = this.returnList.view;

  updateLate(change: Partial<LateSettlementQuery>): void {
    this.lateQuery.update((query) => ({ ...query, ...change }));
  }

  updateReturns(change: Partial<CashReturnQuery>): void {
    this.returnQuery.update((query) => ({ ...query, ...change }));
  }

  moreLate(): void {
    this.lateList.more();
  }

  moreReturns(): void {
    this.returnList.more();
  }

  reload(): void {
    this.lateList.reload();
    this.returnList.reload();
  }
}

function lateFilterOf(query: LateSettlementQuery): LateSettlementFilter {
  return query.status === null ? {} : { status: query.status };
}

function returnFilterOf(query: CashReturnQuery): CashReturnFilter {
  return {
    ...(query.state === null ? {} : { state: query.state }),
    ...(query.disputed === null ? {} : { disputed: query.disputed }),
  };
}
