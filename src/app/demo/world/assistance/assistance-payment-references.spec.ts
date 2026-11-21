import { DEMO_COMPANY_ID, DEMO_SCHOOL_PLATFORM_ID, demoWorldSeed } from '../seed';
import {
  collectionEvidenceOf,
  lateSuccessesOfRequest,
  paymentRequestReferenceOf,
  paymentRequestsOf,
} from '../selectors';
import { DEMO_FOREIGN_COMPANY_ID, demoAssistanceCases } from './assistance.seed';

/**
 * WP-MOCK-M1: the Assistance demo cases' payment-request references against the shared Billing and Payment facts
 * (WP-3.2 / WP-4.2). A reference is linked only when the shared facts hold that very request; none is guessed. The audit
 * (2026-11-14) found no reference that the fixtures let us verify, so the seed is unchanged and every reference stays
 * explicitly unverified (`notInSharedFacts`). These tests pin that state and the facts it rests on.
 */
const NOW = Date.parse('2026-10-30T12:00:00Z');
const WORLD = demoWorldSeed(NOW);
const CASES = demoAssistanceCases(WORLD, NOW);

interface Reference {
  readonly caseId: string;
  readonly companyId: string;
  readonly organizationId: string;
  readonly platformId: string;
  readonly path: string;
  readonly paymentRequestId: string;
  readonly amount: unknown;
  readonly status: unknown;
}

/** Every `paymentRequestId` anywhere in a case (late settlements, recovery channels and payments), with its case. */
const REFERENCES: readonly Reference[] = CASES.flatMap((c) => {
  const found: Reference[] = [];
  const walk = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
    else if (value && typeof value === 'object')
      for (const [key, v] of Object.entries(value)) {
        if (key === 'paymentRequestId' && typeof v === 'string') {
          const owner = value as Record<string, unknown>;
          found.push({
            caseId: c.request.id,
            companyId: c.companyId,
            organizationId: c.request.organizationId,
            platformId: c.request.platformId,
            path,
            paymentRequestId: v,
            amount: owner['amount'] ?? null,
            status: owner['paymentRequestStatus'] ?? null,
          });
        }
        walk(v, `${path}.${key}`);
      }
  };
  walk(c, '');
  return found;
});

const sharedRequestsOf = (organizationId: string) =>
  paymentRequestsOf(WORLD, WORLD.organizations).filter((r) => r.organizationId === organizationId);

describe('Assistance payment-request references (WP-MOCK-M1)', () => {
  it('finds every reference: late settlements, recovery channels and recovery payments', () => {
    expect(REFERENCES).toHaveLength(13);
    const kinds = REFERENCES.map((r) => r.path.replace(/\[\d+\]/g, ''));
    expect(kinds.filter((k) => k === '.lateSettlements')).toHaveLength(5);
    expect(kinds.filter((k) => k === '.recovery.channels')).toHaveLength(4);
    expect(kinds.filter((k) => k === '.recovery.payments')).toHaveLength(4);
  });

  it('links none: each stays explicitly unverified, and none collides with a shared id', () => {
    const shared = new Set(WORLD.paymentRequests.map((r) => r.id));
    for (const r of REFERENCES) {
      expect(shared.has(r.paymentRequestId), r.paymentRequestId).toBe(false);
      expect(paymentRequestReferenceOf(WORLD, r.paymentRequestId)).toEqual({
        kind: 'notInSharedFacts',
        paymentRequestId: r.paymentRequestId,
      });
    }
  });

  it('would link only within the same Organization and Platform (the rule any future link must meet)', () => {
    for (const r of REFERENCES) {
      const reference = paymentRequestReferenceOf(WORLD, r.paymentRequestId);
      if (reference.kind !== 'linked') continue;
      expect(reference.request.organizationId, r.paymentRequestId).toBe(r.organizationId);
      expect(WORLD.organizations.find((o) => o.id === r.organizationId)?.platformId).toBe(
        r.platformId,
      );
    }
    // The demo Company's references are all on Nawara School; another Company's never reach its facts.
    for (const r of REFERENCES.filter((x) => x.companyId === DEMO_COMPANY_ID))
      expect(r.platformId).toBe(DEMO_SCHOOL_PLATFORM_ID);
    const foreign = REFERENCES.filter((x) => x.companyId === DEMO_FOREIGN_COMPANY_ID);
    expect(foreign).toHaveLength(1);
    for (const r of foreign) expect(sharedRequestsOf(r.organizationId)).toEqual([]);
  });

  it('rests on the facts: no shared request of a case’s Organization is the same entity', () => {
    for (const r of REFERENCES) {
      const candidates = sharedRequestsOf(r.organizationId);
      if (r.path.startsWith('.lateSettlements'))
        // A late settlement records a VERIFIED late success; no candidate has one (the shared late success is in an
        // Organization with no Assistance case referencing a payment request).
        for (const c of candidates) {
          expect(lateSuccessesOfRequest(WORLD, c.id), `${r.paymentRequestId} vs ${c.id}`).toEqual(
            [],
          );
          expect(c.status, c.id).not.toBe('expired');
        }
      // A recovery channel is its own invoice for the outstanding amount: its Organization has no shared request.
      else expect(candidates, r.paymentRequestId).toEqual([]);
    }
    // Where an Organization does have shared requests, they contradict the case: an ordinary paid request (org 5), a
    // failed one with no verified capture (org 3).
    const overlapping = [
      ...new Set(
        REFERENCES.filter((r) => sharedRequestsOf(r.organizationId).length > 0).map(
          (r) => r.organizationId,
        ),
      ),
    ];
    expect(overlapping).toHaveLength(2);
    const facts = overlapping.flatMap((o) =>
      sharedRequestsOf(o).map((r) => [r.status, collectionEvidenceOf(WORLD, r.id).kind]),
    );
    expect(facts.sort()).toEqual([
      ['failed', 'unknown'],
      ['paid', 'captureVerified'],
    ]);
  });

  it('leaves every amount and status as it was (no figure is reinterpreted)', () => {
    expect(REFERENCES.map((r) => [r.path, r.amount, r.status])).toEqual([
      ['.lateSettlements[0]', null, null],
      ['.lateSettlements[0]', null, null],
      ['.lateSettlements[0]', null, null],
      ['.recovery.payments[0]', 15000, null],
      ['.recovery.channels[0]', 45000, 'failed'],
      ['.recovery.channels[1]', 30000, 'requested'],
      ['.recovery.payments[0]', 20000, null],
      ['.recovery.payments[1]', 12000, null],
      ['.recovery.payments[2]', 5000, null],
      ['.recovery.channels[0]', 30000, 'failed'],
      ['.recovery.channels[1]', 30000, 'expired'],
      ['.lateSettlements[0]', null, null],
      ['.lateSettlements[0]', null, null],
    ]);
  });
});
