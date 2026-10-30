import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  AssistanceOversight,
  CashReturnStage,
  CollectionStage,
  DeadlineStage,
  RESTRICTION_CLEARS,
  RecoveryStage,
  STAGE_SOURCE,
  SettlementStage,
} from '../domain/assistance-oversight';
import { AssistanceRestriction } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const COLLECTION_KEYS = {
  notCollected: 'assistanceCases.oversight.collection.notCollected',
  declined: 'assistanceCases.oversight.collection.declined',
  reported: 'assistanceCases.oversight.collection.reported',
} as const satisfies Record<CollectionStage, string>;

const SETTLEMENT_KEYS = {
  none: 'assistanceCases.oversight.settlement.none',
  inProgress: 'assistanceCases.oversight.settlement.inProgress',
  uncertain: 'assistanceCases.oversight.settlement.uncertain',
  verified: 'assistanceCases.oversight.settlement.verified',
  verifiedLate: 'assistanceCases.oversight.settlement.verifiedLate',
  lateUnapplied: 'assistanceCases.oversight.settlement.lateUnapplied',
  closedUnpaid: 'assistanceCases.oversight.settlement.closedUnpaid',
} as const satisfies Record<SettlementStage, string>;

const DEADLINE_KEYS = {
  none: 'assistanceCases.oversight.deadline.none',
  running: 'assistanceCases.oversight.deadline.running',
  overdue: 'assistanceCases.oversight.deadline.overdue',
  met: 'assistanceCases.oversight.deadline.met',
} as const satisfies Record<DeadlineStage, string>;

const RETURN_KEYS = {
  none: 'assistanceCases.oversight.cashReturn.none',
  owed: 'assistanceCases.oversight.cashReturn.owed',
  reported: 'assistanceCases.oversight.cashReturn.reported',
  confirmed: 'assistanceCases.oversight.cashReturn.confirmed',
  superseded: 'assistanceCases.oversight.cashReturn.superseded',
} as const satisfies Record<CashReturnStage, string>;

const RECOVERY_KEYS = {
  none: 'assistanceCases.oversight.recovery.none',
  open: 'assistanceCases.oversight.recovery.open',
  recovered: 'assistanceCases.oversight.recovery.recovered',
} as const satisfies Record<RecoveryStage, string>;

const RESTRICTION_KEYS = {
  T1: 'assistanceCases.case.restriction.t1',
  T2: 'assistanceCases.case.restriction.t2',
  T3: 'assistanceCases.case.restriction.t3',
} as const satisfies Record<AssistanceRestriction, string>;

const CLEARS_KEYS = {
  settledOrReturned: 'assistanceCases.oversight.clears.settledOrReturned',
  returnConfirmedOrSuperseded: 'assistanceCases.oversight.clears.returnConfirmedOrSuperseded',
  principalRecovered: 'assistanceCases.oversight.clears.principalRecovered',
} as const satisfies Record<(typeof RESTRICTION_CLEARS)[AssistanceRestriction], string>;

/**
 * One case's cash collection and settlement oversight (Assistance A6), stage by stage: the Organization's collection REPORT,
 * the electronic settlement and whether a Payment fact verified it, the 72-hour deadline, the cash return, recovery and
 * disputes, each with where its answer comes from; then Core's restrictions on the Organization and how each clears. Read
 * only: it explains Core's states and decides nothing.
 */
@Component({
  selector: 'adm-assistance-oversight-panel',
  imports: [TranslocoPipe, NwDatePipe, NwStatusBadge, AssistanceSourceTag],
  templateUrl: './assistance-oversight-panel.html',
  styleUrl: './assistance-oversight-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-oversight' },
})
export class AssistanceOversightPanel {
  readonly oversight = input.required<AssistanceOversight>();
  /** Core's `settleBy`, `null` before collection. */
  readonly settleBy = input<string | null>(null);
  /** Core's restrictions on the case's Organization; `null` when not stated. */
  readonly restrictions = input<readonly AssistanceRestriction[] | null>(null);

  protected readonly sources = STAGE_SOURCE;
  protected readonly collectionKeys = COLLECTION_KEYS;
  protected readonly settlementKeys = SETTLEMENT_KEYS;
  protected readonly deadlineKeys = DEADLINE_KEYS;
  protected readonly returnKeys = RETURN_KEYS;
  protected readonly recoveryKeys = RECOVERY_KEYS;
  protected readonly restrictionKeys = RESTRICTION_KEYS;
  protected readonly clears = RESTRICTION_CLEARS;
  protected readonly clearsKeys = CLEARS_KEYS;
}
