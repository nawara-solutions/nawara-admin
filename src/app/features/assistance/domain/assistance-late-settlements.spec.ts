import { purposeRule } from '../../../core/authorization/purpose-registry';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  LATE_APPLICATION_AUTHORITY,
  LateStandingCase,
  cashReturnStanding,
  lateHistory,
  lateStanding,
  supersedable,
} from './assistance-late-settlements';
import { LateSettlementDetail } from './assistance-read.model';
import {
  CASH_RETURN_STATES,
  CashReturnObligation,
  LATE_SETTLEMENT_REFUSALS,
} from './assistance.model';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);
const caseOf = (n: number) => OWN[n - 1]!;

const late = (patch: Partial<LateSettlementDetail> = {}): LateSettlementDetail => ({
  id: 'l-1',
  assistanceRequestId: 'r-1',
  reason: 'channel_closed',
  attestation: 'cash_not_returned',
  applied: false,
  platformId: caseOf(11).request.platformId,
  organizationId: caseOf(11).request.organizationId,
  recordedAt: '2026-10-29T10:00:00.000Z',
  settledAt: '2026-10-29T09:00:00.000Z',
  attestedAt: '2026-10-29T11:00:00.000Z',
  application: null,
  evidence: [],
  refundCases: [],
  ...patch,
});

const obligation = (patch: Partial<CashReturnObligation> = {}): CashReturnObligation => ({
  id: 'o-1',
  assistanceRequestId: 'r-1',
  origin: 'deadline',
  state: 'open',
  amount: { amount: 46_500, currency: 'TND' },
  cashCollectedAt: '2026-10-20T10:00:00.000Z',
  openedAt: '2026-10-23T10:00:00.000Z',
  returnReport: null,
  confirmedAt: null,
  supersededAt: null,
  ...patch,
});

/** A case that refuses nothing: collected, owed (open), no dispute, the channel closed. */
const eligible = (patch: Partial<LateStandingCase> = {}): LateStandingCase => ({
  request: { state: 'cash_collected' },
  cashReturns: [obligation()],
  disputes: [],
  channel: { id: 'c-1', assistanceRequestId: 'r-1', state: 'closed' },
  ...patch,
});

const openDispute = caseOf(8).disputes[0]!;

describe('Late settlements (A8): where each stands on the owner’s L-4 decision', () => {
  it('reads the demo late settlements: pending without basis, pending but blocked by a dispute, applied', () => {
    const standing = (n: number) => lateStanding(caseOf(n).lateSettlements[0]!, caseOf(n)).standing;
    expect(standing(11)).toEqual({ kind: 'needsBasis' });
    expect(standing(8)).toEqual({ kind: 'refused', reason: 'dispute_open' });
    expect(standing(12)).toEqual({ kind: 'applied', reasonCode: 'cash_not_returned_attested' });
  });

  it('a pending late settlement is never applied: only an owner application settles', () => {
    for (const kind of ['attested', 'needsBasis'] as const) {
      const result = lateStanding(
        late({ attestation: kind === 'attested' ? 'cash_not_returned' : null }),
        eligible(),
      );
      expect(result.standing).toEqual({ kind });
    }
    // `applied` needs Core's application record, never a flag alone.
    expect(
      lateStanding(late({ applied: true, application: null }), eligible()).standing.kind,
    ).not.toBe('applied');
  });

  it("follows Core's refusal order, each refusal from its own Core fact", () => {
    const cases: [string, ReturnType<typeof lateStanding>['standing']][] = [
      [
        'settled request',
        lateStanding(late(), eligible({ request: { state: 'settled' } })).standing,
      ],
      [
        'confirmed return',
        lateStanding(
          late(),
          eligible({
            request: { state: 'returned' },
            cashReturns: [obligation({ state: 'confirmed_returned' })],
          }),
        ).standing,
      ],
      [
        'declined request',
        lateStanding(late(), eligible({ request: { state: 'declined' } })).standing,
      ],
      [
        'reported return',
        lateStanding(late(), eligible({ cashReturns: [obligation({ state: 'return_reported' })] }))
          .standing,
      ],
      ['open dispute', lateStanding(late(), eligible({ disputes: [openDispute] })).standing],
      [
        'another settlement in progress',
        lateStanding(
          late(),
          eligible({ channel: { id: 'c-2', assistanceRequestId: 'r-1', state: 'uncertain' } }),
        ).standing,
      ],
      [
        'a refund case',
        lateStanding(late({ refundCases: [{ id: 'rc-1', status: 'open' }] }), eligible()).standing,
      ],
      [
        'cash returned attestation',
        lateStanding(late({ attestation: 'cash_returned' }), eligible()).standing,
      ],
      ['unknown original instant', lateStanding(late({ settledAt: null }), eligible()).standing],
    ];
    expect(cases.map(([name, s]) => [name, s.kind === 'refused' ? s.reason : s.kind])).toEqual([
      ['settled request', 'purchase_exists'],
      ['confirmed return', 'cash_return_confirmed'],
      ['declined request', 'request_not_settleable'],
      ['reported return', 'cash_return_reported'],
      ['open dispute', 'dispute_open'],
      ['another settlement in progress', 'settlement_in_progress'],
      ['a refund case', 'refund_exists'],
      ['cash returned attestation', 'evidence_contradictory'],
      ['unknown original instant', 'settlement_time_unavailable'],
    ]);
    // The earlier refusal wins when several apply (a reported return under an open dispute).
    expect(
      lateStanding(
        late(),
        eligible({
          cashReturns: [obligation({ state: 'return_reported' })],
          disputes: [openDispute],
        }),
      ).standing,
    ).toEqual({ kind: 'refused', reason: 'cash_return_reported' });
    for (const [, s] of cases)
      if (s.kind === 'refused') expect(LATE_SETTLEMENT_REFUSALS).toContain(s.reason);
  });

  it('an open dispute holds L-4, but an uncertain or open channel is a different refusal', () => {
    expect(lateStanding(late(), eligible({ disputes: [openDispute] })).standing).toEqual({
      kind: 'refused',
      reason: 'dispute_open',
    });
    // A resolved dispute holds nothing.
    expect(
      lateStanding(late(), eligible({ disputes: [{ ...openDispute, state: 'resolved' }] })).standing
        .kind,
    ).toBe('attested');
  });

  it('a cancelled refund case is left to Core, never guessed', () => {
    const result = lateStanding(
      late({ refundCases: [{ id: 'rc', status: 'cancelled' }] }),
      eligible(),
    );
    expect(result).toEqual({ standing: { kind: 'attested' }, undetermined: ['refund_exists'] });
  });

  it('only an open, deadline-origin obligation would be superseded', () => {
    expect(supersedable([obligation()])).toBe('o-1');
    expect(supersedable([obligation({ origin: 'refund_completion' })])).toBeNull();
    expect(supersedable([obligation({ state: 'return_reported' })])).toBeNull();
    expect(supersedable([])).toBeNull();
    // Case 12: the applied settlement already superseded it; case 11: it would supersede the owed return.
    expect(supersedable(caseOf(12).cashReturns)).toBeNull();
    expect(supersedable(caseOf(11).cashReturns)).toBe(caseOf(11).cashReturns[0]!.id);
  });

  it('tells the history oldest first: verified facts, the beneficiary’s statement, the owner’s decision', () => {
    const history = lateHistory(caseOf(12).lateSettlements[0]!);
    expect(history.map((e) => [e.kind, e.source])).toEqual([
      ['lateSuccess', 'fact'],
      ['recorded', 'fact'],
      ['attested', 'report'],
      ['applied', 'decision'],
    ]);
    const times = history.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // An unknown original instant is left out, never invented.
    expect(lateHistory(late({ settledAt: null })).map((e) => e.kind)).toEqual([
      'recorded',
      'attested',
    ]);
  });

  it('L-4 needs a T3 receipt (late_settlement_apply), never a service-verified step-up', () => {
    expect(LATE_APPLICATION_AUTHORITY.operation).toBe('late_settlement_apply');
    expect(purposeRule(LATE_APPLICATION_AUTHORITY.purpose).transport).toBe('receipt');
  });
});

describe('Cash returns (A8): report versus confirmation', () => {
  it('a reported return is still owed; only a confirmation or an applied late settlement discharges it', () => {
    const rows = CASH_RETURN_STATES.map((state) => [state, cashReturnStanding({ state }, false)]);
    expect(rows).toEqual([
      ['open', { awaiting: 'organizationReport', discharged: false, confirmationHeld: false }],
      [
        'return_reported',
        { awaiting: 'beneficiaryConfirmation', discharged: false, confirmationHeld: false },
      ],
      ['confirmed_returned', { awaiting: null, discharged: true, confirmationHeld: false }],
      ['superseded_by_settlement', { awaiting: null, discharged: true, confirmationHeld: false }],
    ]);
  });

  it('an open dispute holds only the confirmation of a reported return', () => {
    expect(cashReturnStanding({ state: 'return_reported' }, true).confirmationHeld).toBe(true);
    expect(cashReturnStanding({ state: 'open' }, true).confirmationHeld).toBe(false);
    expect(cashReturnStanding({ state: 'confirmed_returned' }, true).confirmationHeld).toBe(false);
  });

  it('every demo obligation: superseded only with its applied late settlement, confirmed only with its time', () => {
    for (const c of OWN)
      for (const o of c.cashReturns) {
        expect(o.supersededAt !== null).toBe(o.state === 'superseded_by_settlement');
        expect(o.confirmedAt !== null).toBe(o.state === 'confirmed_returned');
        if (o.state === 'superseded_by_settlement') {
          const applied = c.lateSettlements.find((l) => l.applied)!;
          expect(applied.application?.supersededObligationId).toBe(o.id);
          expect(o.supersededAt).toBe(applied.application?.appliedAt);
          expect(o.origin).toBe('deadline');
        }
      }
  });
});
