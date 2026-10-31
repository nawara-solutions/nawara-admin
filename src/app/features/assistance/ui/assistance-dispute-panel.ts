import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  DISPUTED_EVIDENCE,
  DisputeStanding,
  DisputedEvidence,
  OPEN_DISPUTE_HOLDS,
  OWNER_DISPUTE_AUTHORITY,
  OpenDisputeHold,
  correctionEligibility,
  disputeStanding,
  holdsInEffect,
} from '../domain/assistance-disputes';
import { AssistanceCaseDetail, LateSettlementDetail } from '../domain/assistance-read.model';
import {
  AssistanceDispute,
  AssistanceDisputeReason,
  CorrectableField,
  CorrectionReason,
  DisputeResponsePosition,
} from '../domain/assistance.model';
import { RESOLVABLE_DISPUTE_REASONS } from '../domain/assistance.rules';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
export const DISPUTE_REASON_KEYS = {
  cash_not_returned: 'assistanceCases.case.dispute.reason.cashNotReturned',
  collection_not_made: 'assistanceCases.case.dispute.reason.collectionNotMade',
  collection_time_incorrect: 'assistanceCases.case.dispute.reason.collectionTimeIncorrect',
  return_time_incorrect: 'assistanceCases.case.dispute.reason.returnTimeIncorrect',
} as const satisfies Record<AssistanceDisputeReason, string>;

const EVIDENCE_KEYS = {
  collectionReport: 'assistanceCases.case.dispute.evidence.collectionReport',
  collectionTime: 'assistanceCases.case.dispute.evidence.collectionTime',
  cashReturn: 'assistanceCases.case.dispute.evidence.cashReturn',
  returnTime: 'assistanceCases.case.dispute.evidence.returnTime',
} as const satisfies Record<DisputedEvidence, string>;

export const POSITION_KEYS = {
  accepts: 'assistanceCases.case.dispute.position.accepts',
  contests: 'assistanceCases.case.dispute.position.contests',
} as const satisfies Record<DisputeResponsePosition, string>;

export const STANDING_KEYS = {
  resolved: 'assistanceCases.case.dispute.timestampCorrected',
  noResolutionInCore: 'assistanceCases.case.dispute.noResolution',
  awaitingCorrection: 'assistanceCases.case.dispute.awaitingCorrection',
  correctionRecorded: 'assistanceCases.case.dispute.correctionRecorded',
} as const satisfies Record<DisputeStanding, string>;

const HOLD_KEYS = {
  cashReturnConfirmation: 'assistanceCases.case.dispute.hold.cashReturnConfirmation',
  lateSettlementApplication: 'assistanceCases.case.dispute.hold.lateSettlementApplication',
  secondDispute: 'assistanceCases.case.dispute.hold.secondDispute',
} as const satisfies Record<OpenDisputeHold, string>;

const FIELD_KEYS = {
  cashCollectedAt: 'assistanceCases.case.correction.field.cashCollectedAt',
  returnedAt: 'assistanceCases.case.correction.field.returnedAt',
} as const satisfies Record<CorrectableField, string>;

const CORRECTION_REASON_KEYS = {
  actor_entry_error: 'assistanceCases.case.correction.reason.actorEntryError',
  evidence_contradicts_report: 'assistanceCases.case.correction.reason.evidenceContradictsReport',
} as const satisfies Record<CorrectionReason, string>;

/**
 * The actions this panel explains and never offers (Assistance A7), with who Core lets take them. `future`: Core permits it to
 * the owner, Admin does not offer it yet; `noPath`: Core has no such action; `notOwner`: another actor's, never the owner's.
 */
const UNAVAILABLE_ACTIONS = [
  { id: 'correct', kind: 'future', key: 'assistanceCases.case.unavailable.correct' },
  { id: 'resolve', kind: 'future', key: 'assistanceCases.case.unavailable.resolve' },
  { id: 'noResolution', kind: 'noPath', key: 'assistanceCases.case.unavailable.noResolution' },
  { id: 'money', kind: 'noPath', key: 'assistanceCases.case.unavailable.money' },
  { id: 'beneficiary', kind: 'notOwner', key: 'assistanceCases.case.unavailable.beneficiary' },
  { id: 'organization', kind: 'notOwner', key: 'assistanceCases.case.unavailable.organization' },
] as const;

const ACTION_KIND_KEYS = {
  future: 'assistanceCases.case.unavailable.kind.future',
  noPath: 'assistanceCases.case.unavailable.kind.noPath',
  notOwner: 'assistanceCases.case.unavailable.kind.notOwner',
} as const;

/**
 * One case's disputes and owner corrections (Assistance A7), inside the A5 case page: each dispute with its reason, the evidence it
 * concerns, the Organization's answer and where it stands on Core's only resolution path; what an open dispute holds; the
 * append-only correction history (the original evidence kept); whether Core would accept an owner correction of each reported time;
 * and every action that is NOT available here, with why. READ ONLY: there is no command, button or form in it.
 */
@Component({
  selector: 'adm-assistance-dispute-panel',
  imports: [TranslocoPipe, NwDatePipe, NwIcon, NwStatusBadge, AssistanceSourceTag],
  templateUrl: './assistance-dispute-panel.html',
  styleUrl: './assistance-dispute-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-dispute' },
})
export class AssistanceDisputePanel {
  readonly detail = input.required<AssistanceCaseDetail>();
  readonly lateSettlements = input<readonly LateSettlementDetail[]>([]);

  protected readonly reasonKeys = DISPUTE_REASON_KEYS;
  protected readonly evidence = DISPUTED_EVIDENCE;
  protected readonly evidenceKeys = EVIDENCE_KEYS;
  protected readonly positionKeys = POSITION_KEYS;
  protected readonly standingKeys = STANDING_KEYS;
  protected readonly holdKeys = HOLD_KEYS;
  protected readonly holds = OPEN_DISPUTE_HOLDS;
  protected readonly fieldKeys = FIELD_KEYS;
  protected readonly correctionReasonKeys = CORRECTION_REASON_KEYS;
  protected readonly resolvable = RESOLVABLE_DISPUTE_REASONS;
  protected readonly authority = OWNER_DISPUTE_AUTHORITY;
  protected readonly actions = UNAVAILABLE_ACTIONS;
  protected readonly actionKindKeys = ACTION_KIND_KEYS;

  protected readonly anyOpen = computed(() =>
    this.detail().disputes.some((d) => d.state === 'open'),
  );
  protected readonly inEffect = computed(() =>
    holdsInEffect(this.detail(), this.lateSettlements()),
  );
  protected readonly eligibility = computed(() => correctionEligibility(this.detail()));
  /** Corrections in the order they apply (Core's `sequence`). */
  protected readonly corrections = computed(() =>
    [...this.detail().corrections].sort((a, b) => a.sequence - b.sequence),
  );

  protected standingOf(dispute: AssistanceDispute): DisputeStanding {
    return disputeStanding(dispute, this.detail().corrections);
  }

  /** The sequence of the correction a resolution rests on, or `null`. */
  protected restingOn(dispute: AssistanceDispute): number | null {
    const id = dispute.resolution?.correctionId;
    return this.detail().corrections.find((c) => c.id === id)?.sequence ?? null;
  }
}
