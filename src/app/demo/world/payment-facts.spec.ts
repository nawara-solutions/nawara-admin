import { DEMO_DRIVE_PLATFORM_ID, DEMO_SCHOOL_PLATFORM_ID, demoWorldSeed } from './seed';
import { DemoWorldTables, PaymentRequestStatus } from './records';
import {
  attemptsOfRequest,
  collectionEvidenceOf,
  organizationsOf,
  paymentIssuesOf,
  paymentRequestsOf,
  paymentsOfRequest,
  providerEvidenceOf,
  refundEvidenceOf,
} from './selectors';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const world = demoWorldSeed(NOW);

const FAILED = 'payment-request-1';
const AWAITING = 'payment-request-2';
const PAID = 'payment-request-3';

const withRequestStatus = (
  base: DemoWorldTables,
  id: string,
  status: PaymentRequestStatus,
): DemoWorldTables => ({
  ...base,
  paymentRequests: base.paymentRequests.map((r) => (r.id === id ? { ...r, status } : r)),
});

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

describe('Billing and Payment facts (WP-3.2): financial truthfulness', () => {
  it('a failed request leaves collection unknown, never "not collected"', () => {
    expect(world.paymentRequests.find((r) => r.id === FAILED)?.status).toBe('failed');
    expect(paymentsOfRequest(world, FAILED).map((p) => p.status)).toEqual(['failed']);
    expect(collectionEvidenceOf(world, FAILED)).toEqual({ kind: 'unknown' });
  });

  it('a failed attempt keeps its provider observation apart, and an observation is not a verified fact', () => {
    expect(attemptsOfRequest(world, FAILED).map((a) => [a.status, a.failureClass])).toEqual([
      ['failed', 'terminal'],
    ]);
    const evidence = providerEvidenceOf(world, FAILED);
    expect(evidence.observations.map((o) => [o.id, o.state])).toEqual([
      ['webhook-event-1', 'processed'],
    ]);
    expect(evidence.verifiedFacts).toEqual([]);
    expect(collectionEvidenceOf(world, FAILED).kind).toBe('unknown');
  });

  it('a request awaiting its payer, with a failed and an unknown attempt, has no verified conclusion', () => {
    expect(world.paymentRequests.find((r) => r.id === AWAITING)?.status).toBe('requested');
    expect(paymentsOfRequest(world, AWAITING).map((p) => p.status)).toEqual(['pending']);
    expect(attemptsOfRequest(world, AWAITING).map((a) => [a.attemptNumber, a.status])).toEqual([
      [1, 'failed'],
      [2, 'unknown'],
    ]);
    expect(attemptsOfRequest(world, AWAITING)[1]?.failureClass).toBe('ambiguous');
    expect(providerEvidenceOf(world, AWAITING)).toEqual({ observations: [], verifiedFacts: [] });
    expect(collectionEvidenceOf(world, AWAITING)).toEqual({ kind: 'unknown' });
  });

  it('a verified capture is a labelled demo fixture, kept apart from the request status', () => {
    expect(collectionEvidenceOf(world, PAID)).toEqual({
      kind: 'captureVerified',
      factIds: ['provider-fact-1'],
      demoFixture: true,
    });
    for (const fact of world.providerFacts) {
      expect(fact.demoFixture).toBe(true);
      expect(fact.liveMode).toBe(false);
    }
    // The evidence follows the fact, not the request: a request marked failed after a capture still has the capture (a late
    // success), and the follow-up says "failed" without contradicting it.
    const late = withRequestStatus(world, PAID, 'failed');
    expect(collectionEvidenceOf(late, PAID).kind).toBe('captureVerified');
    expect(paymentIssuesOf(late, late.organizations).find((i) => i.id === PAID)?.kind).toBe(
      'failed',
    );
    // And no request status ever creates a capture.
    for (const status of ['paid', 'requested', 'created'] as const)
      expect(collectionEvidenceOf(withRequestStatus(world, FAILED, status), FAILED).kind).toBe(
        'unknown',
      );
  });

  it('a refund case is a request to refund, never a refund: only a refund fact would be one', () => {
    expect(refundEvidenceOf(world, PAID)).toEqual({
      cases: [
        {
          id: 'refund-case-1',
          paymentRequestId: PAID,
          paymentId: 'payment-3',
          status: 'open',
        },
      ],
      verifiedRefundFactIds: [],
    });
    const completed: DemoWorldTables = {
      ...world,
      refundCases: world.refundCases.map((c) => ({ ...c, status: 'completed' as const })),
    };
    expect(refundEvidenceOf(completed, PAID).verifiedRefundFactIds).toEqual([]);
    // A capture stays a capture beside the case.
    expect(collectionEvidenceOf(completed, PAID).kind).toBe('captureVerified');
    expect(refundEvidenceOf(world, FAILED)).toEqual({ cases: [], verifiedRefundFactIds: [] });
  });
});

describe('Billing and Payment facts (WP-3.2): consistency', () => {
  it('scopes requests to Organizations through their invoices', () => {
    const school = paymentRequestsOf(world, organizationsOf(world, DEMO_SCHOOL_PLATFORM_ID));
    const drive = paymentRequestsOf(world, organizationsOf(world, DEMO_DRIVE_PLATFORM_ID));
    expect(school.map((r) => r.id)).toEqual([FAILED, PAID]);
    expect(drive.map((r) => r.id)).toEqual([AWAITING]);
    for (const r of [...school, ...drive]) {
      const invoice = world.invoices.find((i) => i.id === r.invoiceId)!;
      expect(r.organizationId).toBe(invoice.organizationId);
    }
    expect(paymentRequestsOf(world, [])).toEqual([]);
  });

  it('keeps every reference owned once and resolvable, with Core’s invariants', () => {
    const ids = (records: readonly { id: string }[]) => new Set(records.map((r) => r.id));
    const invoices = ids(world.invoices);
    const requests = ids(world.paymentRequests);
    const payments = ids(world.payments);
    const attempts = ids(world.paymentAttempts);
    const observations = ids(world.providerObservations);
    const organizations = ids(world.organizations);
    expect(world.invoices.every((i) => organizations.has(i.organizationId))).toBe(true);
    for (const r of world.paymentRequests) {
      expect(invoices.has(r.invoiceId), r.id).toBe(true);
      // billing 0006:31-33: no paymentId before Payment acknowledges, always one after.
      expect(r.paymentId === null, r.id).toBe(
        ['created', 'sending', 'rejected'].includes(r.status),
      );
      expect(
        paymentsOfRequest(world, r.id).map((p) => p.id),
        r.id,
      ).toEqual(r.paymentId === null ? [] : [r.paymentId]);
    }
    expect(world.payments.every((p) => requests.has(p.paymentRequestId))).toBe(true);
    for (const a of world.paymentAttempts) expect(payments.has(a.paymentId), a.id).toBe(true);
    const numbers = world.paymentAttempts.map((a) => `${a.paymentId}#${a.attemptNumber}`);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const o of world.providerObservations)
      expect(o.matchedAttemptId === null || attempts.has(o.matchedAttemptId), o.id).toBe(true);
    for (const f of world.providerFacts) {
      // payment 0013:44: a fact binds an attempt of the same payment; 0013:51: a webhook source names its event.
      expect(world.paymentAttempts.find((a) => a.id === f.attemptId)?.paymentId, f.id).toBe(
        f.paymentId,
      );
      expect(f.webhookEventId !== null, f.id).toBe(f.source === 'webhook');
      if (f.webhookEventId !== null) expect(observations.has(f.webhookEventId), f.id).toBe(true);
    }
    for (const c of world.refundCases)
      expect(world.paymentRequests.find((r) => r.id === c.paymentRequestId)?.paymentId).toBe(
        c.paymentId,
      );
  });

  it('is deterministic and independent of the clock', () => {
    const later = demoWorldSeed(NOW + 90 * 86_400_000);
    for (const table of [
      'invoices',
      'paymentRequests',
      'payments',
      'paymentAttempts',
      'providerObservations',
      'providerFacts',
      'refundCases',
    ] as const)
      expect(later[table], table).toEqual(world[table]);
  });

  it('derives exactly the two former payment follow-ups, by request id', () => {
    expect(paymentIssuesOf(world, world.organizations)).toEqual([
      { id: FAILED, organizationId: world.invoices[0]!.organizationId, kind: 'failed' },
      { id: AWAITING, organizationId: world.invoices[1]!.organizationId, kind: 'awaiting_action' },
    ]);
    // Only `failed` and `requested` are follow-ups; every other request status is none.
    for (const status of [
      'created',
      'sending',
      'paid',
      'cancelled',
      'expired',
      'rejected',
    ] as const)
      expect(
        paymentIssuesOf(withRequestStatus(world, FAILED, status), world.organizations).map(
          (i) => i.id,
        ),
        status,
      ).toEqual([AWAITING]);
  });

  it('reads without writing: every selector runs over a frozen world', () => {
    const still = frozen(world);
    for (const id of [FAILED, AWAITING, PAID]) {
      attemptsOfRequest(still, id);
      providerEvidenceOf(still, id);
      collectionEvidenceOf(still, id);
      refundEvidenceOf(still, id);
    }
    expect(paymentIssuesOf(still, still.organizations)).toHaveLength(2);
    expect(still).toEqual(world);
  });
});
