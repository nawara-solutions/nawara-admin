import { DestroyRef, Injectable, computed, inject } from '@angular/core';
import { Params, Router } from '@angular/router';
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
import { CASH_RETURN_STATES, CashReturnState } from '../domain/assistance.model';
import { PagedList, ownerCompanyContext } from './assistance-paged-list';
import { oneOf, pageQuery, single, writePageQuery } from './assistance-url-state';

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

/** The overview's address (A11): its query string holds both lists' filters. */
export const ASSISTANCE_SETTLEMENTS_PATH = '/billing/assistance/settlements';

interface SettlementsPageQuery {
  readonly late: LateSettlementQuery;
  readonly returns: CashReturnQuery;
}

const LATE_STATUSES: readonly LateSettlementStatus[] = ['applied', 'unapplied'];
const DISPUTED = ['true', 'false'] as const;

/** The overview's query from the address (A11; untrusted: anything outside Core's closed sets is dropped). */
export function settlementsQueryOf(params: Params): SettlementsPageQuery {
  const disputed = oneOf(DISPUTED, single(params, 'disputed'));
  return {
    late: { status: oneOf(LATE_STATUSES, single(params, 'late')) },
    returns: {
      state: oneOf(CASH_RETURN_STATES, single(params, 'return')),
      disputed: disputed === null ? null : disputed === 'true',
    },
  };
}

function settlementsParamsOf(query: SettlementsPageQuery): Readonly<Record<string, string | null>> {
  return {
    late: query.late.status,
    return: query.returns.state,
    disputed: query.returns.disputed === null ? null : String(query.returns.disputed),
  };
}

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
  private readonly router = inject(Router);

  /** Both lists' queries, from the address (A11). */
  private readonly pageQuery = pageQuery(
    this.router,
    ASSISTANCE_SETTLEMENTS_PATH,
    settlementsQueryOf,
  );
  readonly lateQuery = computed(() => this.pageQuery().late, {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  readonly returnQuery = computed(() => this.pageQuery().returns, {
    equal: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

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
    this.write({ ...this.pageQuery(), late: { ...this.lateQuery(), ...change } });
  }

  updateReturns(change: Partial<CashReturnQuery>): void {
    this.write({ ...this.pageQuery(), returns: { ...this.returnQuery(), ...change } });
  }

  private write(query: SettlementsPageQuery): void {
    writePageQuery(this.router, ASSISTANCE_SETTLEMENTS_PATH, settlementsParamsOf(query));
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
