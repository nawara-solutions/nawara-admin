import { purposeRule } from '../../../core/authorization/purpose-registry';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  DISPUTED_EVIDENCE,
  OPEN_DISPUTE_HOLDS,
  OWNER_DISPUTE_AUTHORITY,
  correctionEligibility,
  disputeStanding,
  holdsInEffect,
  qualifyingCorrection,
} from './assistance-disputes';
import {
  ASSISTANCE_DISPUTE_REASONS,
  AssistanceCorrection,
  AssistanceDispute,
} from './assistance.model';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);
const caseOf = (n: number) => OWN[n - 1]!;
const detailOf = (n: number) => {
  const c = caseOf(n);
  return {
    request: c.request,
    cashReturns: c.cashReturns,
    disputes: c.disputes,
    corrections: c.corrections,
  };
};

const dispute = (patch: Partial<AssistanceDispute>): AssistanceDispute => ({
  id: 'd-1',
  assistanceRequestId: 'r-1',
  reason: 'collection_time_incorrect',
  state: 'open',
  openedAt: '2026-10-20T10:00:00.000Z',
  escalationDue: false,
  response: null,
  resolution: null,
  ...patch,
});

const correction = (patch: Partial<AssistanceCorrection>): AssistanceCorrection => ({
  id: 'x-1',
  assistanceRequestId: 'r-1',
  sequence: 1,
  field: 'cashCollectedAt',
  correctedValue: '2026-10-18T09:00:00.000Z',
  supersededValue: '2026-10-18T10:00:00.000Z',
  reason: 'actor_entry_error',
  correctedAt: '2026-10-21T10:00:00.000Z',
  ...patch,
});

describe('Assistance disputes (A7): the four Core reasons', () => {
  it('names the evidence each of the four reasons disputes', () => {
    expect(Object.keys(DISPUTED_EVIDENCE).sort()).toEqual([...ASSISTANCE_DISPUTE_REASONS].sort());
    expect(DISPUTED_EVIDENCE).toEqual({
      collection_not_made: 'collectionReport',
      collection_time_incorrect: 'collectionTime',
      cash_not_returned: 'cashReturn',
      return_time_incorrect: 'returnTime',
    });
  });

  it('reads where each demo dispute stands on Core’s only resolution path', () => {
    const standing = (n: number) =>
      caseOf(n).disputes.map((d) => [d.reason, disputeStanding(d, caseOf(n).corrections)]);
    expect(standing(4)).toEqual([['collection_not_made', 'noResolutionInCore']]);
    expect(standing(8)).toEqual([['cash_not_returned', 'noResolutionInCore']]);
    expect(standing(9)).toEqual([['collection_time_incorrect', 'resolved']]);
    expect(standing(10)).toEqual([['return_time_incorrect', 'awaitingCorrection']]);
  });

  it('never invents a resolution for cash_not_returned or collection_not_made, whatever is corrected', () => {
    const both = [
      correction({ field: 'cashCollectedAt' }),
      correction({ id: 'x-2', sequence: 2, field: 'returnedAt' }),
    ];
    for (const reason of ['cash_not_returned', 'collection_not_made'] as const) {
      expect(disputeStanding(dispute({ reason }), both)).toBe('noResolutionInCore');
      expect(qualifyingCorrection(dispute({ reason }), both)).toBeNull();
    }
  });

  it('a resolution rests only on a correction of exactly the disputed time, appended after it opened', () => {
    const open = dispute({ reason: 'collection_time_incorrect' });
    // Before the dispute opened: does not count (Core: `c."correctedAt" < OLD."openedAt"` is refused).
    const early = correction({ correctedAt: '2026-10-19T10:00:00.000Z' });
    expect(disputeStanding(open, [early])).toBe('awaitingCorrection');
    // Another field: does not count.
    const other = correction({ field: 'returnedAt' });
    expect(disputeStanding(open, [other])).toBe('awaitingCorrection');
    // The disputed field, after it opened: Core would accept a resolution on it (the latest one).
    const later = correction({ id: 'x-3', sequence: 3 });
    const latest = correction({ id: 'x-4', sequence: 4 });
    expect(disputeStanding(open, [early, other, later, latest])).toBe('correctionRecorded');
    expect(qualifyingCorrection(open, [early, other, later, latest])).toBe('x-4');
    // A resolved dispute stays resolved.
    expect(disputeStanding({ ...open, state: 'resolved' }, [])).toBe('resolved');
  });
});

describe('Assistance disputes (A7): what an open dispute holds', () => {
  it('lists Core’s holds and nothing financial', () => {
    expect(OPEN_DISPUTE_HOLDS).toEqual([
      'cashReturnConfirmation',
      'lateSettlementApplication',
      'secondDispute',
    ]);
  });

  it('marks the holds that affect a case now', () => {
    // A reported return under an open return-time dispute: the beneficiary cannot confirm it (J-4).
    expect(holdsInEffect(caseOf(10), caseOf(10).lateSettlements)).toEqual({
      cashReturnConfirmation: true,
      lateSettlementApplication: false,
      secondDispute: true,
    });
    // An owed (not reported) return: nothing to confirm yet.
    expect(holdsInEffect(caseOf(8), caseOf(8).lateSettlements).cashReturnConfirmation).toBe(false);
    // No open dispute: nothing is held.
    for (const n of [9, 11, 5])
      expect(Object.values(holdsInEffect(caseOf(n), caseOf(n).lateSettlements))).toEqual([
        false,
        false,
        false,
      ]);
    // An unapplied late settlement under an open dispute: L-4 is refused (`dispute_open`).
    expect(
      holdsInEffect(
        { disputes: [dispute({})], cashReturns: caseOf(11).cashReturns },
        caseOf(11).lateSettlements,
      ).lateSettlementApplication,
    ).toBe(true);
  });
});

describe('Assistance owner corrections (A7): eligibility, presentation only', () => {
  it('a reported time is correctable; one never reported is not', () => {
    const fields = (n: number) =>
      correctionEligibility(detailOf(n)).map((e) => [e.field, e.eligible]);
    expect(fields(1)).toEqual([
      ['cashCollectedAt', false],
      ['returnedAt', false],
    ]);
    expect(fields(2)).toEqual([
      ['cashCollectedAt', false],
      ['returnedAt', false],
    ]);
    expect(fields(4)).toEqual([
      ['cashCollectedAt', true],
      ['returnedAt', false],
    ]);
    expect(fields(10)).toEqual([
      ['cashCollectedAt', true],
      ['returnedAt', true],
    ]);
  });

  it('shows the time in force without changing the original evidence', () => {
    const before = JSON.stringify(caseOf(9));
    const [collected] = correctionEligibility(detailOf(9));
    expect(collected).toEqual({
      field: 'cashCollectedAt',
      eligible: true,
      original: caseOf(9).request.collection!.cashCollectedAt,
      effective: caseOf(9).corrections[0]!.correctedValue,
      corrections: 1,
    });
    expect(collected!.effective).not.toBe(collected!.original);
    expect(JSON.stringify(caseOf(9))).toBe(before);
    // A correction carries no amount, ever.
    for (const x of caseOf(9).corrections) expect(Object.keys(x)).not.toContain('amount');
  });

  it('names Core’s T2 purposes for the two future owner decisions, never a receipt', () => {
    for (const { purpose } of Object.values(OWNER_DISPUTE_AUTHORITY))
      expect(purposeRule(purpose).transport).toBe('serviceVerified');
    expect(OWNER_DISPUTE_AUTHORITY.correct.purpose).toBe('billing.assistance.correct');
    expect(OWNER_DISPUTE_AUTHORITY.resolve.purpose).toBe('billing.assistance.dispute.resolve');
  });
});
