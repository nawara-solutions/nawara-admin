import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  LATE_APPLICATION_AUTHORITY,
  LateHistoryEntry,
  LateStanding,
  LateStandingCase,
  lateHistory,
  lateStanding,
  supersedable,
} from '../domain/assistance-late-settlements';
import { LateSettlementDetail } from '../domain/assistance-read.model';
import { LateApplicationReason, LateSettlementRefusal } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const STANDING_KEYS = {
  applied: 'assistanceCases.late.standing.applied',
  refused: 'assistanceCases.late.standing.refused',
  attested: 'assistanceCases.late.standing.attested',
  needsBasis: 'assistanceCases.late.standing.needsBasis',
} as const satisfies Record<LateStanding['kind'], string>;

const APPLICATION_REASON_KEYS = {
  cash_not_returned_attested: 'assistanceCases.late.applicationReason.attested',
  cash_not_returned_evidenced: 'assistanceCases.late.applicationReason.evidenced',
} as const satisfies Record<LateApplicationReason, string>;

export const REFUSAL_KEYS = {
  purchase_exists: 'assistanceCases.late.refusal.purchaseExists',
  cash_return_confirmed: 'assistanceCases.late.refusal.cashReturnConfirmed',
  cash_return_reported: 'assistanceCases.late.refusal.cashReturnReported',
  request_not_settleable: 'assistanceCases.late.refusal.requestNotSettleable',
  dispute_open: 'assistanceCases.late.refusal.disputeOpen',
  settlement_in_progress: 'assistanceCases.late.refusal.settlementInProgress',
  refund_exists: 'assistanceCases.late.refusal.refundExists',
  evidence_insufficient: 'assistanceCases.late.refusal.evidenceInsufficient',
  evidence_contradictory: 'assistanceCases.late.refusal.evidenceContradictory',
  settlement_time_unavailable: 'assistanceCases.late.refusal.settlementTimeUnavailable',
  already_applied: 'assistanceCases.late.refusal.alreadyApplied',
} as const satisfies Record<LateSettlementRefusal, string>;

const HISTORY_KEYS = {
  lateSuccess: 'assistanceCases.late.history.lateSuccess',
  recorded: 'assistanceCases.late.history.recorded',
  attested: 'assistanceCases.late.history.attested',
  applied: 'assistanceCases.late.history.applied',
} as const satisfies Record<LateHistoryEntry['kind'], string>;

/**
 * One late settlement's OWNER DECISION (Assistance A8): pending or applied (never automatic), where it stands on L-4 in Core's
 * refusal order, what an application would supersede, the receipt Core requires, and its history (verified facts, the
 * beneficiary's statement, the owner's decision). READ ONLY: no button, form or receipt.
 */
@Component({
  selector: 'adm-assistance-late-standing',
  imports: [TranslocoPipe, NwDatePipe, NwIcon, NwStatusBadge, AssistanceSourceTag],
  templateUrl: './assistance-late-standing.html',
  styleUrl: './assistance-late-standing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-late-standing' },
})
export class AssistanceLateStanding {
  readonly late = input.required<LateSettlementDetail>();
  readonly kase = input.required<LateStandingCase>();

  protected readonly standingKeys = STANDING_KEYS;
  protected readonly reasonKeys = APPLICATION_REASON_KEYS;
  protected readonly refusalKeys = REFUSAL_KEYS;
  protected readonly historyKeys = HISTORY_KEYS;
  protected readonly authority = LATE_APPLICATION_AUTHORITY;

  protected readonly result = computed(() => lateStanding(this.late(), this.kase()));
  protected readonly history = computed(() => lateHistory(this.late()));
  /** An application would supersede the owed cash return (only an open, deadline-origin one). */
  protected readonly wouldSupersede = computed(
    () => !this.late().applied && supersedable(this.kase().cashReturns) !== null,
  );
}
