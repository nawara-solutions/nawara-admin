import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, map, of, switchMap } from 'rxjs';
import { AuthSession } from '../../../core/auth/auth-session';
import { AssistanceGateway } from '../data-access/assistance.gateway';
import {
  AssistanceCaseDetail,
  LateSettlementDetail,
  RecoveryFilter,
  RecoveryObligationDetail,
} from '../domain/assistance-read.model';
import { RecoveryObligationState } from '../domain/assistance.model';
import { PagedList, ownerCompanyContext } from './assistance-paged-list';

export { type AssistanceListView } from './assistance-paged-list';

/** What the owner asks the recovery list for. `null`: no filter. */
export interface RecoveryQuery {
  readonly state: RecoveryObligationState | null;
  /** `true`: only obligations with a surplus still owed to the Organization. */
  readonly surplusOwed: boolean | null;
}

export const DEFAULT_RECOVERY_QUERY: RecoveryQuery = { state: null, surplusOwed: null };

/** One recovery obligation (Core's BIL-28 owner read) with its case (restrictions) and the case's late settlements. */
export interface AssistanceRecoveryRow {
  readonly obligation: RecoveryObligationDetail;
  readonly detail: AssistanceCaseDetail;
  readonly lateSettlements: readonly LateSettlementDetail[];
}

/**
 * The owner's RECOVERY & SURPLUS oversight (`/billing/assistance/recovery`; Assistance A9). READ ONLY: one list through the A2
 * gateway, in the owner's Company scope: the existing discovery read (`recoveryObligations`; in Core only through BIL-33
 * `recovery_surplus` reconciliation cases, CF-68 and CF-77), each row then read by id (`recoveryObligation`, Core's BIL-28 owner
 * read) with its case (`caseDetail`; CF-70) and the case's late settlements (`lateSettlement`, BIL-32). No settlement, allocation,
 * refund, external record, confirmation or write-off exists here. The Company owner only; anyone else gets `forbidden` and no request.
 */
@Injectable()
export class AssistanceRecoveryFacade {
  private readonly gateway = inject(AssistanceGateway);
  private readonly session = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);

  readonly query = signal<RecoveryQuery>(DEFAULT_RECOVERY_QUERY);

  private readonly context = ownerCompanyContext(this.session);

  private readonly list = new PagedList<RecoveryQuery, AssistanceRecoveryRow>(
    computed(() => ({ context: this.context(), query: this.query() })),
    (context, query, page) =>
      this.gateway.recoveryObligations(context, filterOf(query), page).pipe(
        switchMap((found) =>
          found.items.length === 0
            ? of({ items: [], next: found.next })
            : forkJoin(
                found.items.map((item) =>
                  forkJoin({
                    obligation: this.gateway.recoveryObligation(context, item.id),
                    detail: this.gateway.caseDetail(context, item.assistanceRequestId),
                  }).pipe(
                    switchMap(({ obligation, detail }) =>
                      (detail.lateSettlementIds.length === 0
                        ? of<readonly LateSettlementDetail[]>([])
                        : forkJoin(
                            detail.lateSettlementIds.map((id) =>
                              this.gateway.lateSettlement(context, id),
                            ),
                          )
                      ).pipe(map((lateSettlements) => ({ obligation, detail, lateSettlements }))),
                    ),
                  ),
                ),
              ).pipe(map((items) => ({ items, next: found.next }))),
        ),
      ),
    this.destroyRef,
  );

  readonly obligations = this.list.view;

  update(change: Partial<RecoveryQuery>): void {
    this.query.update((query) => ({ ...query, ...change }));
  }

  more(): void {
    this.list.more();
  }

  reload(): void {
    this.list.reload();
  }
}

function filterOf(query: RecoveryQuery): RecoveryFilter {
  return {
    ...(query.state === null ? {} : { state: query.state }),
    ...(query.surplusOwed === null ? {} : { surplusOwed: query.surplusOwed }),
  };
}
