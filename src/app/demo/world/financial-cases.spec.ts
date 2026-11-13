import { demoAssistanceCases } from './assistance/assistance.seed';
import { DemoWorldTables, RECONCILIATION_CASE_TYPES } from './records';
import { DEMO_DRIVE_PLATFORM_ID, DEMO_SCHOOL_PLATFORM_ID, demoWorldSeed } from './seed';
import {
  collectionEvidenceOf,
  disputesOfRequest,
  financialAttentionOf,
  lateSuccessesOfRequest,
  organizationsOf,
  organizationsOfCompany,
  paymentIssuesOf,
  paymentRequestReferenceOf,
  paymentRequestsOf,
  providerEvidenceOf,
  reconciliationCaseViewOf,
  reconciliationCasesOf,
  reconciliationCasesOfPlatform,
  refundCaseEvidenceOf,
} from './selectors';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const world = demoWorldSeed(NOW);
const CASES = demoAssistanceCases(world, NOW);
const orgOfInvoice = (id: string) => world.invoices.find((i) => i.id === id)!.organizationId;
const organization = (id: string) => world.organizations.find((o) => o.id === id)!;

/** Freezes every table, so a selector that writes would throw. */
function frozen(tables: DemoWorldTables): DemoWorldTables {
  const deep = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) deep(inner);
      Object.freeze(value);
    }
    return value;
  };
  return deep(structuredClone(tables));
}

describe('Financial cases (WP-4.2): financial truthfulness', () => {
  it('a failed request still leaves collection unknown', () => {
    expect(collectionEvidenceOf(world, 'payment-request-1')).toEqual({ kind: 'unknown' });
    expect(lateSuccessesOfRequest(world, 'payment-request-1')).toEqual([]);
  });

  it('a late verified success never rewrites the request, payment or attempt it came after', () => {
    const [late] = lateSuccessesOfRequest(world, 'payment-request-4');
    expect(late).toEqual({
      lateSuccess: expect.objectContaining({ id: 'late-success-1', paymentStatus: 'expired' }),
      requestStatus: 'expired',
      verifiedCaptureFactId: 'provider-fact-2',
    });
    expect(world.payments.find((p) => p.id === 'payment-4')?.status).toBe('expired');
    expect(world.paymentAttempts.find((a) => a.id === 'attempt-5')?.status).toBe('expired');
    // The capture is verified (a demo fixture); the request's own status stays as recorded.
    expect(collectionEvidenceOf(world, 'payment-request-4').kind).toBe('captureVerified');
    // Without its fact, a late success states no verified capture.
    const unverified = {
      ...world,
      providerFacts: world.providerFacts.filter((f) => f.id !== 'provider-fact-2'),
    };
    expect(
      lateSuccessesOfRequest(unverified, 'payment-request-4')[0]?.verifiedCaptureFactId,
    ).toBeNull();
  });

  it('an observation is not a verified fact, and a verified capture is not the request’s state', () => {
    const failed = providerEvidenceOf(world, 'payment-request-1');
    expect(failed.observations.length).toBeGreaterThan(0);
    expect(failed.verifiedFacts).toEqual([]);
    expect(world.paymentRequests.find((r) => r.id === 'payment-request-4')?.status).toBe('expired');
    expect(providerEvidenceOf(world, 'payment-request-4').verifiedFacts.map((f) => f.kind)).toEqual(
      ['capture'],
    );
  });

  it('a dispute is not a chargeback, and a verified chargeback is not a recovery', () => {
    const [open] = disputesOfRequest(world, 'payment-request-5');
    expect(open).toEqual({
      dispute: expect.objectContaining({ id: 'payment-dispute-1', status: 'open' }),
      chargeback: { kind: 'none' },
    });
    const [lost] = disputesOfRequest(world, 'payment-request-6');
    expect(lost?.chargeback).toEqual({ kind: 'verifiedChargeback', factId: 'provider-fact-5' });
    // Neither one states a refund, a recovery or an obligation's end; the request keeps its capture.
    expect(Object.keys(lost!).sort()).toEqual(['chargeback', 'dispute']);
    expect(collectionEvidenceOf(world, 'payment-request-6').kind).toBe('captureVerified');
    // Core: a chargeback fact exists only on a lost dispute (payment 0019:41).
    for (const d of world.paymentDisputes)
      if (d.chargebackFactId !== null) expect(d.status).toBe('lost');
  });

  it('a refund case or attempt is not a refund; a verified refund is not an allocation or a completion', () => {
    const awaiting = refundCaseEvidenceOf(world, 'refund-case-1')!;
    expect(awaiting.attempts.map((a) => a.status)).toEqual(['submitted']);
    expect(awaiting.verifiedRefundFactIds).toEqual([]);
    expect(awaiting.caseCompleted).toBe(false);
    const verified = refundCaseEvidenceOf(world, 'refund-case-2')!;
    expect(verified.verifiedRefundFactIds).toEqual(['provider-fact-7']);
    expect(verified).toMatchObject({ allocation: 'notRepresented', caseCompleted: false });
    expect(verified.attempts.map((a) => a.status)).toEqual(['unknown']);
    // Payment could not allocate it: Billing holds a case for it, which Admin does not resolve.
    const unallocated = world.reconciliationCases.find(
      (c) => c.caseType === 'refund_fact_unallocated',
    )!;
    expect(unallocated.evidenceKey).toBe('provider-fact-7');
    expect(refundCaseEvidenceOf(world, 'no-such-case')).toBeNull();
  });

  it('a reconciliation case is open until a resolution is recorded, and never offered for resolution', () => {
    for (const c of world.reconciliationCases) {
      expect(RECONCILIATION_CASE_TYPES).toContain(c.caseType);
      expect(reconciliationCaseViewOf(c)).toEqual({
        case: c,
        state: 'open',
        resolutionInAdmin: 'notOffered',
      });
    }
    expect(RECONCILIATION_CASE_TYPES).toHaveLength(20);
    const resolved = reconciliationCaseViewOf({
      ...world.reconciliationCases[0]!,
      resolutionKind: 'acknowledged',
    });
    expect(resolved).toMatchObject({ state: 'resolved', resolutionInAdmin: 'notOffered' });
  });
});

describe('Financial cases (WP-4.2): data integrity', () => {
  it('scopes cases and attention to each Organization, with no leakage', () => {
    const lateOrg = organization(orgOfInvoice('invoice-4'));
    expect(reconciliationCasesOf(world, [lateOrg]).map((c) => c.id)).toEqual([
      'reconciliation-case-1',
    ]);
    expect(financialAttentionOf(world, [lateOrg])).toEqual({
      openReconciliationCases: 1,
      openPaymentDisputes: 0,
      openRefundCases: 0,
    });
    const disputed = organization(orgOfInvoice('invoice-5'));
    expect(financialAttentionOf(world, [disputed]).openPaymentDisputes).toBe(1);
    // An Organization without any case sees none, and an empty scope sees nothing.
    const quiet = organizationsOfCompany(world).find(
      (o) => !world.invoices.some((i) => i.organizationId === o.id),
    )!;
    expect(financialAttentionOf(world, [quiet])).toEqual({
      openReconciliationCases: 0,
      openPaymentDisputes: 0,
      openRefundCases: 0,
    });
    expect(reconciliationCasesOf(world, [])).toEqual([]);
  });

  it('scopes cases to their own Platform, and never another Company’s', () => {
    expect(reconciliationCasesOfPlatform(world, DEMO_SCHOOL_PLATFORM_ID)).toHaveLength(2);
    expect(reconciliationCasesOfPlatform(world, DEMO_DRIVE_PLATFORM_ID)).toEqual([]);
    const foreign = {
      ...world,
      reconciliationCases: [
        ...world.reconciliationCases,
        {
          ...world.reconciliationCases[0]!,
          id: 'foreign',
          platformId: 'foreign-platform' as never,
          organizationId: null,
        },
      ],
    };
    expect(reconciliationCasesOfPlatform(foreign, 'foreign-platform' as never)).toEqual([]);
    expect(
      reconciliationCasesOf(foreign, organizationsOfCompany(foreign)).map((c) => c.id),
    ).not.toContain('foreign');
  });

  it('keeps every relationship resolvable, ids unique and references owned once', () => {
    const ids = (records: readonly { id: string }[]) => records.map((r) => r.id);
    for (const table of [
      world.paymentDisputes,
      world.lateSuccesses,
      world.refundAttempts,
      world.reconciliationCases,
    ])
      expect(new Set(ids(table)).size).toBe(table.length);
    const facts = new Map(world.providerFacts.map((f) => [f.id, f]));
    for (const d of world.paymentDisputes) {
      expect(facts.get(d.captureFactId)?.kind, d.id).toBe('capture');
      expect(facts.get(d.captureFactId)?.paymentId, d.id).toBe(d.paymentId);
      expect(world.paymentAttempts.find((a) => a.id === d.attemptId)?.paymentId, d.id).toBe(
        d.paymentId,
      );
      if (d.chargebackFactId !== null)
        expect(facts.get(d.chargebackFactId)?.kind, d.id).toBe('chargeback');
    }
    for (const l of world.lateSuccesses) {
      expect(world.payments.find((p) => p.id === l.paymentId)?.paymentRequestId, l.id).toBe(
        l.paymentRequestId,
      );
      if (l.factId !== null) expect(facts.get(l.factId)?.paymentId, l.id).toBe(l.paymentId);
    }
    for (const a of world.refundAttempts)
      expect(world.refundCases.find((c) => c.id === a.refundCaseId)?.paymentId, a.id).toBe(
        a.paymentId,
      );
    for (const c of world.reconciliationCases) {
      const request = world.paymentRequests.find((r) => r.id === c.paymentRequestId)!;
      expect(request.paymentId, c.id).toBe(c.paymentId);
      expect(orgOfInvoice(request.invoiceId), c.id).toBe(c.organizationId);
      expect(organization(c.organizationId!).platformId, c.id).toBe(c.platformId);
    }
    // One case per (type, evidence) (billing 0042:327).
    const keys = world.reconciliationCases.map((c) => `${c.caseType}:${c.evidenceKey}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('handles missing evidence safely: absent tables give empty, never invented, answers', () => {
    const bare: DemoWorldTables = {
      ...world,
      paymentDisputes: [],
      lateSuccesses: [],
      refundAttempts: [],
      reconciliationCases: [],
    };
    expect(disputesOfRequest(bare, 'payment-request-6')).toEqual([]);
    expect(lateSuccessesOfRequest(bare, 'payment-request-4')).toEqual([]);
    expect(refundCaseEvidenceOf(bare, 'refund-case-1')?.attempts).toEqual([]);
    expect(financialAttentionOf(bare, organizationsOfCompany(bare)).openReconciliationCases).toBe(
      0,
    );
    expect(disputesOfRequest(world, 'no-such-request')).toEqual([]);
  });

  it('resolves an Assistance payment-request reference only against the shared facts, never by a guess', () => {
    expect(paymentRequestReferenceOf(world, 'payment-request-4')).toMatchObject({
      kind: 'linked',
      request: { id: 'payment-request-4', organizationId: orgOfInvoice('invoice-4') },
    });
    // The Assistance demo seed's own payment-request ids are not shared facts (reported gap): none is linked.
    const references = CASES.flatMap((c) => c.lateSettlements.map((l) => l.paymentRequestId));
    expect(references.length).toBeGreaterThan(0);
    for (const id of references)
      expect(paymentRequestReferenceOf(world, id)).toEqual({
        kind: 'notInSharedFacts',
        paymentRequestId: id,
      });
  });

  it('reads without writing: every selector runs over a frozen world', () => {
    const still = frozen(world);
    for (const r of still.paymentRequests) {
      disputesOfRequest(still, r.id);
      lateSuccessesOfRequest(still, r.id);
      paymentRequestReferenceOf(still, r.id);
    }
    for (const c of still.refundCases) refundCaseEvidenceOf(still, c.id);
    financialAttentionOf(still, still.organizations);
    reconciliationCasesOfPlatform(still, DEMO_SCHOOL_PLATFORM_ID);
    expect(still).toEqual(world);
  });
});

describe('Financial cases (WP-4.2): existing projections', () => {
  it('leaves the two Billing follow-ups exactly as they were', () => {
    expect(paymentIssuesOf(world, world.organizations).map((i) => [i.id, i.kind])).toEqual([
      ['payment-request-1', 'failed'],
      ['payment-request-2', 'awaiting_action'],
    ]);
  });

  it('adds new requests only as paid or expired, so no figure built on follow-ups moves', () => {
    const added = world.paymentRequests.filter(
      (r) => !['payment-request-1', 'payment-request-2', 'payment-request-3'].includes(r.id),
    );
    expect(new Set(added.map((r) => r.status))).toEqual(new Set(['paid', 'expired']));
    expect(
      paymentRequestsOf(world, organizationsOf(world, DEMO_DRIVE_PLATFORM_ID)).map((r) => r.id),
    ).toEqual(['payment-request-2', 'payment-request-5']);
  });
});
