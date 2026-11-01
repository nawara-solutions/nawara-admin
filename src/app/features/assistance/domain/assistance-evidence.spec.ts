import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  ASSISTANCE_EVIDENCE_KINDS,
  AssistanceEvidenceInput,
  EVIDENCE_FILE_FOLLOW_UP,
  EVIDENCE_PROVENANCE,
  caseEvidence,
  evidenceFileCounts,
} from './assistance-evidence';
import { RecoveryObligationDetail } from './assistance-read.model';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);
const caseOf = (n: number) => OWN[n - 1]!;

/** The case page's record for a demo case (the same records the gateway returns). */
const inputOf = (n: number): AssistanceEvidenceInput => {
  const c = caseOf(n);
  return {
    detail: {
      request: c.request,
      channel: c.channel,
      cashReturns: c.cashReturns,
      disputes: c.disputes,
      corrections: c.corrections,
      lateSettlementIds: c.lateSettlements.map((l) => l.id),
      recoveryObligationId: c.recovery?.id ?? null,
      restrictions: [],
      overdue: null,
    },
    lateSettlements: c.lateSettlements,
    recovery: c.recovery,
  };
};
const kinds = (n: number) => caseEvidence(inputOf(n)).map((item) => item.kind);

describe('Assistance evidence register (A10): provenance', () => {
  it('fixes the source and the actor of every kind; a report is never a fact', () => {
    expect(Object.keys(EVIDENCE_PROVENANCE)).toEqual([...ASSISTANCE_EVIDENCE_KINDS]);
    for (const [kind, p] of Object.entries(EVIDENCE_PROVENANCE)) {
      // Only Core (Payment's verification) states a fact; only the owner decides; the parties report.
      if (p.source === 'fact') expect([kind, p.by]).toEqual([kind, 'core']);
      if (p.source === 'decision') expect([kind, p.by]).toEqual([kind, 'owner']);
      if (p.source === 'report') expect(['beneficiary', 'organization_actor']).toContain(p.by);
    }
    expect(EVIDENCE_PROVENANCE.collectionReport.source).toBe('report');
    expect(EVIDENCE_PROVENANCE.returnReport.source).toBe('report');
    expect(EVIDENCE_PROVENANCE.returnConfirmation.source).toBe('report');
  });

  it('names a File only where Core stores one: a reference (BIL-32) or a grant the owner read omits (BIL-28)', () => {
    const withFile = Object.entries(EVIDENCE_PROVENANCE).filter(([, p]) => p.file !== 'none');
    expect(withFile).toEqual([
      ['lateFileGrant', { source: 'decision', by: 'owner', file: 'reference' }],
      ['surplusExternalRecord', { source: 'decision', by: 'owner', file: 'notInRead' }],
    ]);
    expect(EVIDENCE_FILE_FOLLOW_UP).toBe('CF-71');
  });
});

describe('Assistance evidence register (A10): each demo case', () => {
  it('a pending request has no evidence yet; a declined one neither', () => {
    expect(kinds(1)).toEqual([]);
    expect(kinds(2)).toEqual([]);
  });

  it('a collection report is the Organization’s report with its reporter, never a file', () => {
    const [report] = caseEvidence(inputOf(5));
    expect(report).toEqual({
      id: `collectionReport:${caseOf(5).request.id}`,
      kind: 'collectionReport',
      source: 'report',
      by: 'organization_actor',
      recordedAt: caseOf(5).request.collection!.reportedAt,
      statement: null,
      references: [
        { kind: 'record', id: caseOf(5).request.id },
        { kind: 'actor', id: caseOf(5).request.collection!.reportedBy },
      ],
      file: 'none',
    });
  });

  it('a correction keeps its original: the report stays listed, the correction states what it superseded', () => {
    const items = caseEvidence(inputOf(9));
    expect(items.map((i) => i.kind)).toEqual([
      'collectionReport',
      'disputeFiling',
      'disputeResponse',
      'correction',
    ]);
    const correction = caseOf(9).corrections[0]!;
    expect(items[3]!.statement).toEqual({
      type: 'correction',
      sequence: correction.sequence,
      field: 'cashCollectedAt',
      supersededValue: correction.supersededValue,
      correctedValue: correction.correctedValue,
      reason: correction.reason,
    });
    // The superseded value is the Organization's original report, still on the request.
    expect(correction.supersededValue).toBe(caseOf(9).request.collection!.cashCollectedAt);
    expect(items[1]!.statement).toEqual({
      type: 'disputeReason',
      reason: 'collection_time_incorrect',
    });
  });

  it('a reported and a confirmed return are two separate reports', () => {
    expect(kinds(7)).toEqual(['collectionReport', 'returnReport', 'returnConfirmation']);
    expect(kinds(10)).toEqual(['collectionReport', 'returnReport', 'disputeFiling']);
  });

  it('Path A rests on the beneficiary’s attestation, with no file', () => {
    const items = caseEvidence(inputOf(12));
    expect(items.map((i) => [i.kind, i.file])).toEqual([
      ['collectionReport', 'none'],
      ['lateSuccess', 'none'],
      ['lateAttestation', 'none'],
      ['lateApplication', 'none'],
    ]);
    const application = items[3]!;
    expect(application.statement).toEqual({
      type: 'applicationBasis',
      reasonCode: 'cash_not_returned_attested',
    });
    expect(application.references.map((r) => r.kind)).toEqual([
      'record',
      'receipt',
      'purchase',
      'supersededObligation',
    ]);
  });

  it('Path B rests on File REFERENCES: grant and file ids, verified by Billing, never a link', () => {
    const items = caseEvidence(inputOf(15));
    expect(items.map((i) => [i.kind, i.file])).toEqual([
      ['collectionReport', 'none'],
      ['lateSuccess', 'none'],
      ['lateApplication', 'none'],
      ['lateFileGrant', 'reference'],
      ['lateFileGrant', 'reference'],
    ]);
    const grants = caseOf(15).lateSettlements[0]!.evidence;
    expect(items.slice(3).map((i) => i.references)).toEqual(
      grants.map((g) => [
        { kind: 'fileGrant', id: g.grantId },
        { kind: 'file', id: g.fileId },
      ]),
    );
    expect(items[2]!.statement).toEqual({
      type: 'applicationBasis',
      reasonCode: 'cash_not_returned_evidenced',
    });
    // A late success is Payment's verified fact, pointing to its payment request.
    expect(items[1]).toMatchObject({
      source: 'fact',
      by: 'core',
      references: [
        { kind: 'record', id: caseOf(15).lateSettlements[0]!.id },
        { kind: 'paymentRequest', id: caseOf(15).lateSettlements[0]!.paymentRequestId },
      ],
    });
    for (const item of items)
      for (const reference of item.references) expect(reference.id).not.toMatch(/[/:]/);
    expect(evidenceFileCounts(items)).toEqual({ reference: 2, notInRead: 0 });
  });

  it('a recovery: verified payments are facts; the external surplus record has a File the owner read omits', () => {
    const items = caseEvidence(inputOf(14));
    expect(items.map((i) => [i.kind, i.source])).toEqual([
      ['collectionReport', 'report'],
      ['recoveryPayment', 'fact'],
      ['recoveryPayment', 'fact'],
      ['recoveryPayment', 'fact'],
      ['surplusExternalRecord', 'decision'],
    ]);
    expect(items[4]).toMatchObject({ file: 'notInRead', by: 'owner' });
    expect(evidenceFileCounts(items)).toEqual({ reference: 0, notInRead: 1 });
  });

  it('is ordered by Core’s recording time; an item whose time the read omits comes last, never estimated', () => {
    const input = inputOf(14);
    const recovery = input.recovery!;
    const refunded: RecoveryObligationDetail = {
      ...recovery,
      surpluses: [
        {
          ...recovery.surpluses[0]!,
          refunded: true,
          status: 'resolved',
          refundCaseId: 'a551c0de-0000-4000-8000-00000000abcd',
        },
        recovery.surpluses[1]!,
      ],
    };
    const items = caseEvidence({ ...input, recovery: refunded });
    expect(items.at(-1)).toMatchObject({ kind: 'surplusRefund', recordedAt: null, source: 'fact' });
    const times = items.filter((i) => i.recordedAt !== null).map((i) => Date.parse(i.recordedAt!));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('covers every demo case deterministically', () => {
    for (let n = 1; n <= OWN.length; n++) {
      expect(caseEvidence(inputOf(n))).toEqual(caseEvidence(inputOf(n)));
    }
  });
});
