import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  AssistanceOversight,
  AssistanceOversightInput,
  STAGE_SOURCE,
  assistanceOversight,
  oversightInputOfCase,
} from './assistance-oversight';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);

/** Core's T1 source, as the demo adapter derives it (the oversight never computes it). */
const overdue = (n: number) => {
  const r = OWN[n - 1]!.request;
  return (
    r.state === 'cash_collected' && r.collection !== null && NOW > Date.parse(r.collection.settleBy)
  );
};
const oversightOf = (n: number): AssistanceOversight => {
  const c = OWN[n - 1]!;
  const detail = {
    request: c.request,
    channel: c.channel,
    cashReturns: c.cashReturns,
    disputes: c.disputes,
    corrections: c.corrections,
    lateSettlementIds: c.lateSettlements.map((l) => l.id),
    recoveryObligationId: c.recovery?.id ?? null,
    restrictions: [],
    overdue: overdue(n),
  };
  return assistanceOversight(oversightInputOfCase(detail, c.lateSettlements, c.recovery));
};

describe('Assistance oversight (A6): each demo scenario, stage by stage', () => {
  // [collection, settlement, deadline, cash return, recovery, unresolved dispute, attention]
  const expected: Record<
    number,
    readonly [string, string, string, string, string, boolean, boolean]
  > = {
    1: ['notCollected', 'none', 'none', 'none', 'none', false, false],
    2: ['declined', 'none', 'none', 'none', 'none', false, false],
    3: ['declined', 'none', 'none', 'none', 'none', false, false],
    4: ['reported', 'inProgress', 'running', 'none', 'none', true, true],
    5: ['reported', 'verified', 'met', 'none', 'none', false, false],
    6: ['reported', 'uncertain', 'running', 'none', 'none', false, true],
    7: ['reported', 'closedUnpaid', 'met', 'confirmed', 'none', false, false],
    8: ['reported', 'closedUnpaid', 'overdue', 'owed', 'none', true, true],
    9: ['reported', 'verified', 'met', 'none', 'none', false, false],
    10: ['reported', 'closedUnpaid', 'overdue', 'reported', 'none', true, true],
    11: ['reported', 'lateUnapplied', 'overdue', 'owed', 'none', false, true],
    12: ['reported', 'verifiedLate', 'met', 'superseded', 'none', false, false],
    13: ['reported', 'verified', 'met', 'none', 'open', false, true],
    14: ['reported', 'verified', 'met', 'none', 'recovered', false, false],
  };
  for (const [n, row] of Object.entries(expected))
    it(`case ${n}`, () => {
      const o = oversightOf(Number(n));
      expect([
        o.collection,
        o.settlement,
        o.deadline,
        o.cashReturn,
        o.recovery,
        o.unresolvedDispute,
        o.attention,
      ]).toEqual(row);
    });

  it('covers every scenario of the demo Company', () => {
    expect(Object.keys(expected)).toHaveLength(OWN.length);
  });
});

describe('Assistance oversight (A6): a report is never a fact', () => {
  const base: AssistanceOversightInput = {
    state: 'cash_collected',
    settleBy: '2026-11-01T00:00:00.000Z',
    overdue: false,
    channel: null,
    cashReturn: null,
    lateSettlement: null,
    recovery: null,
    openDispute: false,
  };

  it('a collection report alone is never a settlement, whatever else is true', () => {
    for (const channel of [null, 'open', 'uncertain', 'closed'] as const) {
      const o = assistanceOversight({ ...base, channel });
      expect(o.collection).toBe('reported');
      expect(STAGE_SOURCE.collection[o.collection]).toBe('report');
      expect(['verified', 'verifiedLate']).not.toContain(o.settlement);
    }
    // Only Core's settled channel (with its purchase) or an owner-applied late settlement verifies it.
    expect(assistanceOversight({ ...base, channel: 'settled' }).settlement).toBe('verified');
    expect(
      assistanceOversight({ ...base, channel: 'closed', lateSettlement: 'applied' }).settlement,
    ).toBe('verifiedLate');
    expect(
      assistanceOversight({ ...base, channel: 'closed', lateSettlement: 'unapplied' }).settlement,
    ).toBe('lateUnapplied');
  });

  it('a reported return is a report and still owed attention; only confirmation or supersession ends it', () => {
    const reported = assistanceOversight({ ...base, cashReturn: 'return_reported' });
    expect([reported.cashReturn, STAGE_SOURCE.cashReturn.reported, reported.attention]).toEqual([
      'reported',
      'report',
      true,
    ]);
    expect(assistanceOversight({ ...base, cashReturn: 'confirmed_returned' }).attention).toBe(
      false,
    );
    expect(
      assistanceOversight({ ...base, cashReturn: 'superseded_by_settlement' }).cashReturn,
    ).toBe('superseded');
  });

  it('overdue is Core’s word, never computed from settleBy and a clock', () => {
    const past = { ...base, settleBy: '2000-01-01T00:00:00.000Z' };
    expect(assistanceOversight({ ...past, overdue: false }).deadline).toBe('running');
    expect(assistanceOversight({ ...past, overdue: null }).deadline).toBe('running');
    expect(assistanceOversight({ ...past, overdue: true }).deadline).toBe('overdue');
    expect(assistanceOversight({ ...past, overdue: true, state: 'settled' }).deadline).toBe('met');
  });

  it('every stage value has a stated source (or none when nothing exists)', () => {
    expect(STAGE_SOURCE.settlement.verified).toBe('fact');
    expect(STAGE_SOURCE.settlement.inProgress).toBe('derived');
    expect(STAGE_SOURCE.settlement.verifiedLate).toBe('decision');
    expect(STAGE_SOURCE.deadline.overdue).toBe('derived');
    expect(STAGE_SOURCE.collection.notCollected).toBeNull();
  });
});
