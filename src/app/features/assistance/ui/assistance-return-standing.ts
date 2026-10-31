import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { cashReturnStanding } from '../domain/assistance-late-settlements';
import { STAGE_SOURCE } from '../domain/assistance-oversight';
import { CashReturnObligation, CashReturnState } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
export const RETURN_STATE_LABELS = {
  open: 'assistanceCases.case.cashReturn.state.open',
  return_reported: 'assistanceCases.case.cashReturn.state.returnReported',
  confirmed_returned: 'assistanceCases.case.cashReturn.state.confirmedReturned',
  superseded_by_settlement: 'assistanceCases.case.cashReturn.state.supersededBySettlement',
} as const satisfies Record<CashReturnState, string>;

/** Words and an icon per state, never colour alone; a reported return is never shown as complete. */
export const RETURN_STATE_TONES = {
  open: 'warning',
  return_reported: 'info',
  confirmed_returned: 'success',
  superseded_by_settlement: 'success',
} as const satisfies Record<CashReturnState, NwStatusTone>;

/** The A6 oversight stage of each state, for its information source. */
const STAGE = {
  open: 'owed',
  return_reported: 'reported',
  confirmed_returned: 'confirmed',
  superseded_by_settlement: 'superseded',
} as const;

/**
 * One cash-return obligation's standing (Assistance A8): its state with where it comes from, what it awaits, whether the
 * beneficiary's confirmation is held by an open dispute, and its times: opened (Core), the Organization's REPORTED return (a report,
 * never a completion), the beneficiary's confirmation, or the owner's L-4 supersession. READ ONLY.
 */
@Component({
  selector: 'adm-assistance-return-standing',
  imports: [TranslocoPipe, NwDatePipe, NwStatusBadge, AssistanceSourceTag],
  templateUrl: './assistance-return-standing.html',
  styleUrl: './assistance-return-standing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-return-standing', '[attr.data-return-state]': 'obligation().state' },
})
export class AssistanceReturnStanding {
  readonly obligation = input.required<CashReturnObligation>();
  /** An assistance dispute of the request is open. */
  readonly openDispute = input(false);
  /** `false` where the host already lists the obligation's times (the A5 case page). */
  readonly showTimes = input(true);

  protected readonly labels = RETURN_STATE_LABELS;
  protected readonly tones = RETURN_STATE_TONES;
  protected readonly source = computed(
    () => STAGE_SOURCE.cashReturn[STAGE[this.obligation().state]],
  );
  protected readonly standing = computed(() =>
    cashReturnStanding(this.obligation(), this.openDispute()),
  );
}
