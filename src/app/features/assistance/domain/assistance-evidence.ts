import {
  AssistanceCaseDetail,
  AssistanceTimelineActor,
  LateSettlementDetail,
  RecoveryObligationDetail,
} from './assistance-read.model';
import {
  AssistanceDisputeReason,
  AssistanceInformationSource,
  CorrectableField,
  CorrectionReason,
  DisputeResponsePosition,
  LateApplicationReason,
  LateSettlementAttestation,
} from './assistance.model';

/**
 * The evidence register of one Assistance case (A10): every piece of evidence Core holds about it, read from the records the case
 * already shows, with WHO stated it, WHERE it comes from (fact, report, decision, derived) and WHICH references Core exposes. Pure:
 * it adds no field Core does not state, computes nothing financial and never turns a reference into a file.
 *
 * What Core stores at nawara-core `0044b20` (billing-service; verified for A10):
 * - The Organization's collection and return reports are the evidence themselves: the asserted time, Core's recording time and the
 *   reporter. No file is attached to them (`db/migrations/0029_assistance_request.sql`, `0031:244-300`).
 * - An assistance dispute carries a closed reason code only: "no free text (no evidence store exists in S5c)"
 *   (`src/assistance/assistance-input.ts:69`). The Organization's answer is a position only (`0031:216-223`).
 * - An owner correction carries a reason code, the superseded and the corrected time; the original report never changes (`0031:117-160`).
 * - An L-4 application on Path B rests on 1 to 5 File `settlement_evidence` grants that Billing verified live; BIL-32 exposes each
 *   `{grantId, fileId, verifiedAt}` (`src/late-settlements/late-settlement.service.ts:158`, `:171`). Path A rests on the beneficiary's
 *   attestation and carries no file (`late-settlement.service.ts:99-100`).
 * - An external surplus repayment (BIL-30, Path B) stores a File `surplus_evidence` grant (`0039_recovery.sql:276-283`), but the owner
 *   read BIL-28 does not return it (`src/recovery/recovery.service.ts:255-259`): Admin knows only that it was recorded.
 * - File has no human route at all ("No human, public or grantee route", file-service `src/grants/grant.controller.ts:41-42`): a
 *   reference can never be opened, downloaded or uploaded from Admin (CF-71).
 */

/** Every kind of evidence the register lists, in the order a case accumulates it. */
export const ASSISTANCE_EVIDENCE_KINDS = [
  'collectionReport',
  'returnReport',
  'returnConfirmation',
  'disputeFiling',
  'disputeResponse',
  'correction',
  'lateSuccess',
  'lateAttestation',
  'lateApplication',
  'lateFileGrant',
  'recoveryPayment',
  'surplusExternalRecord',
  'surplusConfirmation',
  'surplusRefund',
] as const;
export type AssistanceEvidenceKind = (typeof ASSISTANCE_EVIDENCE_KINDS)[number];

/**
 * Whether a file stands behind the evidence:
 * - `none`: Core stores no file for this kind; the record itself is the evidence;
 * - `reference`: Core exposes a File reference (grant and file ids), never the file: no human File path exists (CF-71);
 * - `notInRead`: Core verified a File grant when it recorded this, but the owner read does not return the reference.
 */
export type AssistanceEvidenceFile = 'none' | 'reference' | 'notInRead';

/** A Core id the evidence points to. Every id is shown as a reference: none is a link to a file. */
export type AssistanceEvidenceReferenceKind =
  | 'record'
  | 'actor'
  | 'fileGrant'
  | 'file'
  | 'receipt'
  | 'purchase'
  | 'supersededObligation'
  | 'paymentRequest'
  | 'refundCase';

export interface AssistanceEvidenceReference {
  readonly kind: AssistanceEvidenceReferenceKind;
  readonly id: string;
}

/** What the evidence states, in Core's machine values (each shown through a catalog label, never translated as a value). */
export type AssistanceEvidenceStatement =
  | {
      readonly type: 'correction';
      readonly sequence: number;
      readonly field: CorrectableField;
      readonly supersededValue: string;
      readonly correctedValue: string;
      readonly reason: CorrectionReason;
    }
  | { readonly type: 'disputeReason'; readonly reason: AssistanceDisputeReason }
  | { readonly type: 'responsePosition'; readonly position: DisputeResponsePosition }
  | { readonly type: 'attestation'; readonly statement: LateSettlementAttestation }
  | { readonly type: 'applicationBasis'; readonly reasonCode: LateApplicationReason };

export interface AssistanceEvidenceItem {
  /** Stable within the case: the kind and the record it belongs to. */
  readonly id: string;
  readonly kind: AssistanceEvidenceKind;
  readonly source: AssistanceInformationSource;
  readonly by: AssistanceTimelineActor;
  /** Core's time of the record; `null` when the owner read does not state one (never estimated). */
  readonly recordedAt: string | null;
  readonly statement: AssistanceEvidenceStatement | null;
  readonly references: readonly AssistanceEvidenceReference[];
  readonly file: AssistanceEvidenceFile;
}

/** Where each kind comes from and who states it: fixed by Core's model, never by the record. */
export const EVIDENCE_PROVENANCE = {
  collectionReport: { source: 'report', by: 'organization_actor', file: 'none' },
  returnReport: { source: 'report', by: 'organization_actor', file: 'none' },
  returnConfirmation: { source: 'report', by: 'beneficiary', file: 'none' },
  disputeFiling: { source: 'report', by: 'beneficiary', file: 'none' },
  disputeResponse: { source: 'report', by: 'organization_actor', file: 'none' },
  correction: { source: 'decision', by: 'owner', file: 'none' },
  lateSuccess: { source: 'fact', by: 'core', file: 'none' },
  lateAttestation: { source: 'report', by: 'beneficiary', file: 'none' },
  lateApplication: { source: 'decision', by: 'owner', file: 'none' },
  // Supplied by the owner with their determination; Billing verified the GRANT live, never the file's content.
  lateFileGrant: { source: 'decision', by: 'owner', file: 'reference' },
  recoveryPayment: { source: 'fact', by: 'core', file: 'none' },
  surplusExternalRecord: { source: 'decision', by: 'owner', file: 'notInRead' },
  surplusConfirmation: { source: 'report', by: 'organization_actor', file: 'none' },
  surplusRefund: { source: 'fact', by: 'core', file: 'none' },
} as const satisfies Readonly<
  Record<
    AssistanceEvidenceKind,
    {
      readonly source: AssistanceInformationSource;
      readonly by: AssistanceTimelineActor;
      readonly file: AssistanceEvidenceFile;
    }
  >
>;

/** The Core follow-up that blocks every file path (upload, open, download): no human File route exists. */
export const EVIDENCE_FILE_FOLLOW_UP = 'CF-71';

/** The records the register reads: the case page's own record, nothing more. */
export interface AssistanceEvidenceInput {
  readonly detail: AssistanceCaseDetail;
  readonly lateSettlements: readonly LateSettlementDetail[];
  readonly recovery: RecoveryObligationDetail | null;
}

const KIND_ORDER = new Map<AssistanceEvidenceKind, number>(
  ASSISTANCE_EVIDENCE_KINDS.map((kind, index) => [kind, index]),
);

/**
 * The case's evidence register, oldest recorded first; an item whose time the read does not state comes last. Ties keep the kind order
 * above, then the id, so the same records always give the same list.
 */
export function caseEvidence(input: AssistanceEvidenceInput): readonly AssistanceEvidenceItem[] {
  const { detail, lateSettlements, recovery } = input;
  const items: AssistanceEvidenceItem[] = [];
  const add = (
    kind: AssistanceEvidenceKind,
    recordId: string,
    recordedAt: string | null,
    references: readonly AssistanceEvidenceReference[],
    statement: AssistanceEvidenceStatement | null = null,
  ): void => {
    const { source, by, file } = EVIDENCE_PROVENANCE[kind];
    items.push({
      id: `${kind}:${recordId}`,
      kind,
      source,
      by,
      recordedAt,
      statement,
      references,
      file,
    });
  };
  const record = (id: string): AssistanceEvidenceReference => ({ kind: 'record', id });

  const request = detail.request;
  if (request.collection !== null)
    add('collectionReport', request.id, request.collection.reportedAt, [
      record(request.id),
      { kind: 'actor', id: request.collection.reportedBy },
    ]);

  for (const obligation of detail.cashReturns) {
    if (obligation.returnReport !== null)
      add('returnReport', obligation.id, obligation.returnReport.returnReportedAt, [
        record(obligation.id),
        { kind: 'actor', id: obligation.returnReport.returnReportedBy },
      ]);
    if (obligation.confirmedAt !== null)
      add('returnConfirmation', obligation.id, obligation.confirmedAt, [record(obligation.id)]);
  }

  for (const dispute of detail.disputes) {
    add('disputeFiling', dispute.id, dispute.openedAt, [record(dispute.id)], {
      type: 'disputeReason',
      reason: dispute.reason,
    });
    if (dispute.response !== null)
      add('disputeResponse', dispute.id, dispute.response.respondedAt, [record(dispute.id)], {
        type: 'responsePosition',
        position: dispute.response.position,
      });
  }

  for (const correction of detail.corrections)
    add('correction', correction.id, correction.correctedAt, [record(correction.id)], {
      type: 'correction',
      sequence: correction.sequence,
      field: correction.field,
      supersededValue: correction.supersededValue,
      correctedValue: correction.correctedValue,
      reason: correction.reason,
    });

  for (const late of lateSettlements) {
    add('lateSuccess', late.id, late.recordedAt, [
      record(late.id),
      { kind: 'paymentRequest', id: late.paymentRequestId },
    ]);
    if (late.attestation !== null)
      add('lateAttestation', late.id, late.attestedAt, [record(late.id)], {
        type: 'attestation',
        statement: late.attestation,
      });
    const application = late.application;
    if (application !== null)
      add(
        'lateApplication',
        late.id,
        application.appliedAt,
        [
          record(late.id),
          { kind: 'receipt', id: application.receiptId },
          ...(application.purchaseId === null
            ? []
            : [{ kind: 'purchase', id: application.purchaseId } as const]),
          ...(application.supersededObligationId === null
            ? []
            : [{ kind: 'supersededObligation', id: application.supersededObligationId } as const]),
        ],
        { type: 'applicationBasis', reasonCode: application.reasonCode },
      );
    for (const grant of late.evidence)
      add('lateFileGrant', grant.grantId, grant.verifiedAt, [
        { kind: 'fileGrant', id: grant.grantId },
        { kind: 'file', id: grant.fileId },
      ]);
  }

  if (recovery !== null) {
    for (const payment of recovery.payments)
      add('recoveryPayment', payment.id, payment.recordedAt, [
        record(payment.id),
        { kind: 'paymentRequest', id: payment.paymentRequestId },
      ]);
    for (const surplus of recovery.surpluses) {
      if (surplus.externalRecordedAt !== null)
        add('surplusExternalRecord', surplus.id, surplus.externalRecordedAt, [record(surplus.id)]);
      if (surplus.confirmedAt !== null)
        add('surplusConfirmation', surplus.id, surplus.confirmedAt, [record(surplus.id)]);
      // BIL-28 states the refund case, not when it resolved the surplus: no time is shown rather than one estimated.
      if (surplus.refundCaseId !== null)
        add('surplusRefund', surplus.id, null, [
          record(surplus.id),
          { kind: 'refundCase', id: surplus.refundCaseId },
        ]);
    }
  }

  return items.sort(
    (a, b) =>
      compareTimes(a.recordedAt, b.recordedAt) ||
      KIND_ORDER.get(a.kind)! - KIND_ORDER.get(b.kind)! ||
      a.id.localeCompare(b.id),
  );
}

/** Oldest first; a missing time last. ISO 8601 instants from Core compare as numbers, never as text. */
function compareTimes(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return Date.parse(a) - Date.parse(b);
}

/** How many items stand on a File reference, and how many on a File Core verified but does not return. */
export function evidenceFileCounts(items: readonly AssistanceEvidenceItem[]): {
  readonly reference: number;
  readonly notInRead: number;
} {
  return {
    reference: items.filter((item) => item.file === 'reference').length,
    notInRead: items.filter((item) => item.file === 'notInRead').length,
  };
}
