import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import {
  AssistanceEvidenceFile,
  AssistanceEvidenceItem,
  AssistanceEvidenceKind,
  AssistanceEvidenceReferenceKind,
  EVIDENCE_FILE_FOLLOW_UP,
  evidenceFileCounts,
} from '../domain/assistance-evidence';
import { AssistanceTimelineActor } from '../domain/assistance-read.model';
import {
  AssistanceDisputeReason,
  CorrectableField,
  CorrectionReason,
  DisputeResponsePosition,
  LateApplicationReason,
  LateSettlementAttestation,
} from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const KIND_KEYS = {
  collectionReport: 'assistanceCases.evidence.kind.collectionReport',
  returnReport: 'assistanceCases.evidence.kind.returnReport',
  returnConfirmation: 'assistanceCases.evidence.kind.returnConfirmation',
  disputeFiling: 'assistanceCases.evidence.kind.disputeFiling',
  disputeResponse: 'assistanceCases.evidence.kind.disputeResponse',
  correction: 'assistanceCases.evidence.kind.correction',
  lateSuccess: 'assistanceCases.evidence.kind.lateSuccess',
  lateAttestation: 'assistanceCases.evidence.kind.lateAttestation',
  lateApplication: 'assistanceCases.evidence.kind.lateApplication',
  lateFileGrant: 'assistanceCases.evidence.kind.lateFileGrant',
  recoveryPayment: 'assistanceCases.evidence.kind.recoveryPayment',
  surplusExternalRecord: 'assistanceCases.evidence.kind.surplusExternalRecord',
  surplusConfirmation: 'assistanceCases.evidence.kind.surplusConfirmation',
  surplusRefund: 'assistanceCases.evidence.kind.surplusRefund',
} as const satisfies Record<AssistanceEvidenceKind, string>;

const ACTOR_KEYS = {
  beneficiary: 'assistanceCases.evidence.by.beneficiary',
  organization_actor: 'assistanceCases.evidence.by.organizationActor',
  owner: 'assistanceCases.evidence.by.owner',
  core: 'assistanceCases.evidence.by.core',
} as const satisfies Record<AssistanceTimelineActor, string>;

const REFERENCE_KEYS = {
  record: 'assistanceCases.evidence.reference.record',
  actor: 'assistanceCases.evidence.reference.actor',
  fileGrant: 'assistanceCases.evidence.reference.fileGrant',
  file: 'assistanceCases.evidence.reference.file',
  receipt: 'assistanceCases.evidence.reference.receipt',
  purchase: 'assistanceCases.evidence.reference.purchase',
  supersededObligation: 'assistanceCases.evidence.reference.supersededObligation',
  paymentRequest: 'assistanceCases.evidence.reference.paymentRequest',
  refundCase: 'assistanceCases.evidence.reference.refundCase',
} as const satisfies Record<AssistanceEvidenceReferenceKind, string>;

const FILE_KEYS = {
  none: 'assistanceCases.evidence.file.none',
  reference: 'assistanceCases.evidence.file.reference',
  notInRead: 'assistanceCases.evidence.file.notInRead',
} as const satisfies Record<AssistanceEvidenceFile, string>;

const FILE_ICONS = {
  none: 'clipboard-list',
  reference: 'file-badge',
  notInRead: 'eye-off',
} as const satisfies Record<AssistanceEvidenceFile, NwIconName>;

const REASON_KEYS = {
  cash_not_returned: 'assistanceCases.case.dispute.reason.cashNotReturned',
  collection_not_made: 'assistanceCases.case.dispute.reason.collectionNotMade',
  collection_time_incorrect: 'assistanceCases.case.dispute.reason.collectionTimeIncorrect',
  return_time_incorrect: 'assistanceCases.case.dispute.reason.returnTimeIncorrect',
} as const satisfies Record<AssistanceDisputeReason, string>;

const POSITION_KEYS = {
  accepts: 'assistanceCases.case.dispute.position.accepts',
  contests: 'assistanceCases.case.dispute.position.contests',
} as const satisfies Record<DisputeResponsePosition, string>;

const ATTESTATION_KEYS = {
  cash_not_returned: 'assistanceCases.case.late.attestation.cashNotReturned',
  cash_returned: 'assistanceCases.case.late.attestation.cashReturned',
} as const satisfies Record<LateSettlementAttestation, string>;

const BASIS_KEYS = {
  cash_not_returned_attested: 'assistanceCases.late.applicationReason.attested',
  cash_not_returned_evidenced: 'assistanceCases.late.applicationReason.evidenced',
} as const satisfies Record<LateApplicationReason, string>;

const FIELD_KEYS = {
  cashCollectedAt: 'assistanceCases.case.correction.field.cashCollectedAt',
  returnedAt: 'assistanceCases.case.correction.field.returnedAt',
} as const satisfies Record<CorrectableField, string>;

const CORRECTION_REASON_KEYS = {
  actor_entry_error: 'assistanceCases.case.correction.reason.actorEntryError',
  evidence_contradicts_report: 'assistanceCases.case.correction.reason.evidenceContradictsReport',
} as const satisfies Record<CorrectionReason, string>;

/** The last characters of a Core id; the full id stays available as a tooltip and to assistive technology. */
const shortRef = (id: string): string => id.slice(-8);

/**
 * One case's evidence register (Assistance A10): each piece of evidence Core holds, oldest recorded first, with who stated it,
 * where it comes from (a verified fact, a report, an owner decision), what it states, the Core ids it points to, and whether a
 * file stands behind it. A File REFERENCE is shown as an id, never as a link: no human File path exists (CF-71), so nothing can be
 * opened, downloaded or uploaded here. Read only.
 */
@Component({
  selector: 'adm-assistance-evidence-panel',
  imports: [TranslocoPipe, NwDatePipe, NwIcon, AssistanceSourceTag],
  templateUrl: './assistance-evidence-panel.html',
  styleUrl: './assistance-evidence-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-evidence' },
})
export class AssistanceEvidencePanel {
  readonly items = input.required<readonly AssistanceEvidenceItem[]>();

  protected readonly counts = computed(() => evidenceFileCounts(this.items()));
  protected readonly followUp = EVIDENCE_FILE_FOLLOW_UP;
  protected readonly kindKeys = KIND_KEYS;
  protected readonly actorKeys = ACTOR_KEYS;
  protected readonly referenceKeys = REFERENCE_KEYS;
  protected readonly fileKeys = FILE_KEYS;
  protected readonly fileIcons = FILE_ICONS;
  protected readonly reasonKeys = REASON_KEYS;
  protected readonly positionKeys = POSITION_KEYS;
  protected readonly attestationKeys = ATTESTATION_KEYS;
  protected readonly basisKeys = BASIS_KEYS;
  protected readonly fieldKeys = FIELD_KEYS;
  protected readonly correctionReasonKeys = CORRECTION_REASON_KEYS;
  protected readonly shortRef = shortRef;
}
