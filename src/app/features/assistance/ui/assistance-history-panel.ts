import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwCheckbox } from '../../../shared/ui/checkbox/checkbox';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import {
  AssistanceHistoryOrder,
  AssistanceHistoryStanding,
  HISTORY_SOURCES,
  HISTORY_STANDING,
  historyOfSources,
  historySourceCounts,
  orderHistory,
  recordedLater,
} from '../domain/assistance-history';
import { AssistanceTimelineActor, AssistanceTimelineEntry } from '../domain/assistance-read.model';
import { AssistanceInformationSource } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const ACTOR_KEYS = {
  beneficiary: 'assistanceCases.case.actor.beneficiary',
  organization_actor: 'assistanceCases.case.actor.organizationActor',
  owner: 'assistanceCases.case.actor.owner',
  core: 'assistanceCases.case.actor.core',
} as const satisfies Record<AssistanceTimelineActor, string>;

const KIND_KEYS = {
  settlementSucceeded: 'assistanceCases.case.kind.settlementSucceeded',
  settlementFailed: 'assistanceCases.case.kind.settlementFailed',
  lateSuccess: 'assistanceCases.case.kind.lateSuccess',
  refundCompleted: 'assistanceCases.case.kind.refundCompleted',
  chargebackFinal: 'assistanceCases.case.kind.chargebackFinal',
  recoveryPayment: 'assistanceCases.case.kind.recoveryPayment',
  consent: 'assistanceCases.case.kind.consent',
  declined: 'assistanceCases.case.kind.declined',
  cashCollected: 'assistanceCases.case.kind.cashCollected',
  cashReturnReported: 'assistanceCases.case.kind.cashReturnReported',
  cashReturnConfirmed: 'assistanceCases.case.kind.cashReturnConfirmed',
  disputeOpened: 'assistanceCases.case.kind.disputeOpened',
  disputeResponse: 'assistanceCases.case.kind.disputeResponse',
  lateAttestation: 'assistanceCases.case.kind.lateAttestation',
  correction: 'assistanceCases.case.kind.correction',
  disputeResolved: 'assistanceCases.case.kind.disputeResolved',
  lateSettlementApplied: 'assistanceCases.case.kind.lateSettlementApplied',
  writeOff: 'assistanceCases.case.kind.writeOff',
  surplusExternal: 'assistanceCases.case.kind.surplusExternal',
  cashReturnOwed: 'assistanceCases.case.kind.cashReturnOwed',
  channelUncertain: 'assistanceCases.case.kind.channelUncertain',
  channelClosed: 'assistanceCases.case.kind.channelClosed',
  recoveryOpened: 'assistanceCases.case.kind.recoveryOpened',
} as const satisfies Record<AssistanceTimelineEntry['kind'], string>;

const STANDING_KEYS = {
  verifiedFinancial: 'assistanceCases.history.standing.verifiedFinancial',
  verifiedNoPayment: 'assistanceCases.history.standing.verifiedNoPayment',
  reportedOnly: 'assistanceCases.history.standing.reportedOnly',
  ownerDecision: 'assistanceCases.history.standing.ownerDecision',
  coreDerived: 'assistanceCases.history.standing.coreDerived',
} as const satisfies Record<AssistanceHistoryStanding, string>;

const SOURCE_EXPLANATION_KEYS = {
  fact: 'assistanceCases.history.explain.fact',
  report: 'assistanceCases.history.explain.report',
  decision: 'assistanceCases.history.explain.decision',
  derived: 'assistanceCases.history.explain.derived',
} as const satisfies Record<AssistanceInformationSource, string>;

const SOURCE_KEYS = {
  fact: 'assistanceCases.case.source.fact',
  report: 'assistanceCases.case.source.report',
  decision: 'assistanceCases.case.source.decision',
  derived: 'assistanceCases.case.source.derived',
} as const satisfies Record<AssistanceInformationSource, string>;

const ORDER_KEYS = {
  occurred: 'assistanceCases.history.order.occurred',
  recorded: 'assistanceCases.history.order.recorded',
} as const satisfies Record<AssistanceHistoryOrder, string>;

/**
 * One case's history for audit (Assistance A10, extending the A5 timeline): verified facts, reports, owner decisions and Core-derived
 * states, never mixed up. The owner can order it by the time each entry is about or by when Core recorded it, and show only some
 * sources; what each entry means for money is stated beside it (a report is never a payment). View state only: changing the order or
 * the sources reads nothing and changes nothing.
 */
@Component({
  selector: 'adm-assistance-history-panel',
  imports: [TranslocoPipe, NwDatePipe, NwCheckbox, NwControl, NwFormField, AssistanceSourceTag],
  templateUrl: './assistance-history-panel.html',
  styleUrl: './assistance-history-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-history' },
})
export class AssistanceHistoryPanel {
  /** The case's history as the gateway returned it. */
  readonly entries = input.required<readonly AssistanceTimelineEntry[]>();

  protected readonly order = signal<AssistanceHistoryOrder>('occurred');
  protected readonly shown = signal<ReadonlySet<AssistanceInformationSource>>(
    new Set(HISTORY_SOURCES),
  );

  protected readonly counts = computed(() => historySourceCounts(this.entries()));
  protected readonly visible = computed(() =>
    historyOfSources(orderHistory(this.entries(), this.order()), this.shown()),
  );

  protected readonly sources = HISTORY_SOURCES;
  protected readonly actorKeys = ACTOR_KEYS;
  protected readonly kindKeys = KIND_KEYS;
  protected readonly standing = HISTORY_STANDING;
  protected readonly standingKeys = STANDING_KEYS;
  protected readonly explanationKeys = SOURCE_EXPLANATION_KEYS;
  protected readonly sourceKeys = SOURCE_KEYS;
  protected readonly orderKeys = ORDER_KEYS;
  protected readonly recordedLater = recordedLater;

  protected onOrder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.order.set(value === 'recorded' ? 'recorded' : 'occurred');
  }

  protected toggle(source: AssistanceInformationSource, checked: boolean): void {
    const next = new Set(this.shown());
    if (checked) next.add(source);
    else next.delete(source);
    this.shown.set(next);
  }
}
