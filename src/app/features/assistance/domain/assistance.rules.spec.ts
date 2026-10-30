import { organizationId, platformId } from '../../../core/context/scope.model';
import {
  ASSISTANCE_DISPUTE_REASONS,
  ASSISTANCE_REQUEST_STATES,
  AssistanceRequestState,
  AssistanceTerms,
  CASH_RETURN_STATES,
  CORRECTABLE_FIELDS,
  CashCollectionReport,
  CashReturnState,
  LATE_SETTLEMENT_REFUSALS,
  LateSettlement,
  SETTLEMENT_CHANNEL_STATES,
  SettlementChannelState,
} from './assistance.model';
import {
  CORE_CONSTRAINTS,
  INFORMATION_SOURCE,
  REQUEST_TRANSITIONS,
  RESOLVABLE_DISPUTE_REASONS,
  Verdict,
  canCorrect,
  canOpenDispute,
  cashReturnTransition,
  channelTransition,
  collectionUnchanged,
  effectiveTime,
  isFinalRequestState,
  requestTransition,
  surplusResolution,
  termsUnchanged,
  validCollectionReport,
  validDisputeResolution,
  validRecoveryBase,
  validReturnReport,
  validTerms,
} from './assistance.rules';

const BENEFICIARY = 'beneficiary-1';
const ORG_ACTOR = 'org-actor-1';
const TERMS: AssistanceTerms = {
  priceId: 'price-1',
  currency: 'TND',
  baseAmount: 3000,
  feeAmount: 200,
  totalAmount: 3200,
};
const COLLECTION: CashCollectionReport = {
  cashCollectedAt: '2026-10-20T09:00:00.000Z',
  reportedAt: '2026-10-20T09:05:00.000Z',
  reportedBy: ORG_ACTOR,
  settleBy: '2026-10-23T09:00:00.000Z',
};
const CONSENT = '2026-10-20T08:00:00.000Z';
const both = { purchaseExists: true, cashReturnConfirmed: true };
const reasonOf = (verdict: Verdict) => (verdict.allowed ? null : verdict.reason);

describe('assistance request lifecycle (Core 0031:36-75)', () => {
  const allowed: [AssistanceRequestState, AssistanceRequestState][] = [
    ['pending', 'declined'],
    ['pending', 'cash_collected'],
    ['cash_collected', 'settled'],
    ['cash_collected', 'returned'],
  ];
  const pairs = ASSISTANCE_REQUEST_STATES.flatMap((from) =>
    ASSISTANCE_REQUEST_STATES.map(
      (to) => [from, to] as [AssistanceRequestState, AssistanceRequestState],
    ),
  );

  it.each(allowed)('allows %s → %s with its evidence', (from, to) => {
    expect(requestTransition(from, to, both)).toEqual({ allowed: true });
  });

  it.each(pairs.filter(([f, t]) => !allowed.some(([a, b]) => a === f && b === t)))(
    'refuses %s → %s',
    (from, to) => {
      expect(reasonOf(requestTransition(from, to, both))).toBe('assistance_request_not_pending');
    },
  );

  it('settles only with a purchase, and returns only with a confirmed cash return', () => {
    const none = { purchaseExists: false, cashReturnConfirmed: false };
    expect(reasonOf(requestTransition('cash_collected', 'settled', none))).toBe(
      'assistance_request_settled_by_purchase',
    );
    expect(reasonOf(requestTransition('cash_collected', 'returned', none))).toBe(
      'assistance_request_returned_by_confirmation',
    );
  });

  it('treats declined, settled and returned as final', () => {
    expect(ASSISTANCE_REQUEST_STATES.filter(isFinalRequestState)).toEqual([
      'declined',
      'settled',
      'returned',
    ]);
    expect(Object.keys(REQUEST_TRANSITIONS).sort()).toEqual([...ASSISTANCE_REQUEST_STATES].sort());
  });
});

describe('frozen terms and whole-amount collection', () => {
  it('accepts well-formed terms and refuses every malformed amount', () => {
    expect(validTerms(TERMS).allowed).toBe(true);
    for (const bad of [
      { ...TERMS, baseAmount: 0, totalAmount: 200 },
      { ...TERMS, feeAmount: -1, totalAmount: 2999 },
      { ...TERMS, totalAmount: 3100 },
      { ...TERMS, baseAmount: 1.5, totalAmount: 201.5 },
      { ...TERMS, baseAmount: Number.MAX_SAFE_INTEGER, totalAmount: Number.MAX_SAFE_INTEGER + 200 },
    ])
      expect(reasonOf(validTerms(bad))).toBe('assistance_request_amounts');
    expect(reasonOf(validTerms({ ...TERMS, currency: 'tnd' }))).toBe('local:currency_format');
  });

  it.each(['priceId', 'currency', 'baseAmount', 'feeAmount', 'totalAmount'] as const)(
    'refuses any change of the frozen %s',
    (field) => {
      const changed = { ...TERMS, [field]: field === 'priceId' || field === 'currency' ? 'X' : 1 };
      expect(termsUnchanged(TERMS, changed).allowed).toBe(false);
    },
  );

  it('has no partial collection: a report carries no amount, so it always covers the frozen total', () => {
    expect(Object.keys(COLLECTION).sort()).toEqual([
      'cashCollectedAt',
      'reportedAt',
      'reportedBy',
      'settleBy',
    ]);
    expect(compileTimeChecks).toBeTypeOf('function');
  });

  it('checks the time order, the exact 72-hour deadline and the reporter', () => {
    expect(validCollectionReport(COLLECTION, CONSENT, BENEFICIARY).allowed).toBe(true);
    expect(
      reasonOf(validCollectionReport(COLLECTION, '2026-10-20T09:30:00.000Z', BENEFICIARY)),
    ).toBe('assistance_request_cash_time_order');
    expect(
      reasonOf(
        validCollectionReport(
          { ...COLLECTION, reportedAt: '2026-10-20T08:59:00.000Z' },
          CONSENT,
          BENEFICIARY,
        ),
      ),
    ).toBe('assistance_request_cash_time_order');
    expect(
      reasonOf(
        validCollectionReport(
          { ...COLLECTION, settleBy: '2026-10-23T09:00:01.000Z' },
          CONSENT,
          BENEFICIARY,
        ),
      ),
    ).toBe('assistance_request_settle_by');
    expect(
      reasonOf(
        validCollectionReport({ ...COLLECTION, reportedBy: BENEFICIARY }, CONSENT, BENEFICIARY),
      ),
    ).toBe('assistance_request_reporter_not_beneficiary');
  });

  it.each(['cashCollectedAt', 'reportedAt', 'reportedBy', 'settleBy'] as const)(
    'never changes the recorded %s (a correction appends instead)',
    (field) => {
      expect(reasonOf(collectionUnchanged(COLLECTION, { ...COLLECTION, [field]: 'changed' }))).toBe(
        'assistance_request_collection_immutable',
      );
    },
  );
});

describe('settlement channel (Core 0030:155-166)', () => {
  const ok = { paymentFinalUnsuccessful: true, purchaseExists: true };
  const pairs = SETTLEMENT_CHANNEL_STATES.flatMap((from) =>
    SETTLEMENT_CHANNEL_STATES.map(
      (to) => [from, to] as [SettlementChannelState, SettlementChannelState],
    ),
  );
  const allowed = new Set([
    'open>uncertain',
    'uncertain>open',
    'open>closed',
    'uncertain>closed',
    'open>settled',
    'uncertain>settled',
  ]);

  it.each(pairs)('%s → %s', (from, to) => {
    expect(channelTransition(from, to, ok).allowed).toBe(allowed.has(`${from}>${to}`));
  });

  it('closes only on a final unsuccessful payment, and settles only with the purchase', () => {
    expect(
      reasonOf(channelTransition('open', 'closed', { ...ok, paymentFinalUnsuccessful: false })),
    ).toBe('assistance_settlement_channel_closed_final');
    expect(
      reasonOf(channelTransition('uncertain', 'settled', { ...ok, purchaseExists: false })),
    ).toBe('assistance_settlement_channel_settled_purchase');
  });
});

describe('cash return (Core 0030:311-332, 0031:244-300, 0040:1-30)', () => {
  const deadline = { state: 'open' as CashReturnState, origin: 'deadline' as const };
  const free = { disputeOpen: false };

  it('lets only the Organization actor report, and only the beneficiary confirm, never during a dispute', () => {
    expect(
      cashReturnTransition(deadline, 'return_reported', { ...free, actor: 'organizationActor' })
        .allowed,
    ).toBe(true);
    expect(
      cashReturnTransition(deadline, 'return_reported', { ...free, actor: 'beneficiary' }).allowed,
    ).toBe(false);
    const reported = { ...deadline, state: 'return_reported' as CashReturnState };
    expect(
      cashReturnTransition(reported, 'confirmed_returned', { ...free, actor: 'beneficiary' })
        .allowed,
    ).toBe(true);
    expect(
      cashReturnTransition(reported, 'confirmed_returned', { ...free, actor: 'organizationActor' })
        .allowed,
    ).toBe(false);
    expect(
      cashReturnTransition(reported, 'confirmed_returned', {
        disputeOpen: true,
        actor: 'beneficiary',
      }).allowed,
    ).toBe(false);
  });

  it('supersedes only an open deadline obligation, only by an L-4 application', () => {
    const context = { ...free, actor: 'lateSettlementApplication' as const };
    expect(cashReturnTransition(deadline, 'superseded_by_settlement', context).allowed).toBe(true);
    expect(
      reasonOf(
        cashReturnTransition(
          { ...deadline, origin: 'refund_completion' },
          'superseded_by_settlement',
          context,
        ),
      ),
    ).toBe('late_settlement_application_basis');
    expect(
      cashReturnTransition(deadline, 'superseded_by_settlement', {
        ...free,
        actor: 'organizationActor',
      }).allowed,
    ).toBe(false);
    expect(
      cashReturnTransition(
        { ...deadline, state: 'return_reported' },
        'superseded_by_settlement',
        context,
      ).allowed,
    ).toBe(false);
  });

  it.each(['confirmed_returned', 'superseded_by_settlement'] as const)('%s is final', (state) => {
    for (const to of CASH_RETURN_STATES)
      for (const actor of [
        'organizationActor',
        'beneficiary',
        'lateSettlementApplication',
      ] as const)
        expect(
          cashReturnTransition({ state, origin: 'deadline' }, to, { ...free, actor }).allowed,
        ).toBe(false);
  });

  it('checks the reported return time order and reporter', () => {
    const report = {
      returnedAt: '2026-10-25T10:00:00.000Z',
      returnReportedAt: '2026-10-25T10:10:00.000Z',
      returnReportedBy: ORG_ACTOR,
    };
    const base = { cashCollectedAt: COLLECTION.cashCollectedAt, returnReport: report };
    expect(validReturnReport(base, BENEFICIARY).allowed).toBe(true);
    expect(
      reasonOf(
        validReturnReport(
          { ...base, returnReport: { ...report, returnedAt: '2026-10-19T00:00:00.000Z' } },
          BENEFICIARY,
        ),
      ),
    ).toBe('cash_return_obligation_time_order');
    expect(
      reasonOf(
        validReturnReport(
          { ...base, returnReport: { ...report, returnReportedBy: BENEFICIARY } },
          BENEFICIARY,
        ),
      ),
    ).toBe('cash_return_obligation_reporter_not_beneficiary');
  });
});

describe('disputes and owner corrections (Core 0031:76-200)', () => {
  const facts = { obligationExists: true, returnReported: true, openDispute: false };

  it.each(ASSISTANCE_DISPUTE_REASONS)(
    '%s may be opened only on cash evidence, one at a time',
    (reason) => {
      expect(canOpenDispute({ state: 'cash_collected' }, reason, facts).allowed).toBe(true);
      expect(canOpenDispute({ state: 'pending' }, reason, facts).allowed).toBe(false);
      expect(
        reasonOf(canOpenDispute({ state: 'settled' }, reason, { ...facts, openDispute: true })),
      ).toBe('assistance_dispute_open_unique');
    },
  );

  it('needs an obligation for cash_not_returned and a reported return for return_time_incorrect', () => {
    expect(
      canOpenDispute({ state: 'returned' }, 'cash_not_returned', {
        ...facts,
        obligationExists: false,
      }).allowed,
    ).toBe(false);
    expect(
      canOpenDispute({ state: 'returned' }, 'return_time_incorrect', {
        ...facts,
        returnReported: false,
      }).allowed,
    ).toBe(false);
  });

  it('resolves only time disputes, only as timestamp_corrected through a correction of that time', () => {
    expect(RESOLVABLE_DISPUTE_REASONS).toEqual({
      collection_time_incorrect: 'cashCollectedAt',
      return_time_incorrect: 'returnedAt',
      cash_not_returned: null,
      collection_not_made: null,
    });
    expect(
      validDisputeResolution(
        { reason: 'collection_time_incorrect', state: 'open' },
        { field: 'cashCollectedAt' },
      ).allowed,
    ).toBe(true);
    expect(
      validDisputeResolution(
        { reason: 'collection_time_incorrect', state: 'open' },
        { field: 'returnedAt' },
      ).allowed,
    ).toBe(false);
    expect(
      validDisputeResolution({ reason: 'collection_time_incorrect', state: 'open' }, null).allowed,
    ).toBe(false);
    expect(
      validDisputeResolution(
        { reason: 'cash_not_returned', state: 'open' },
        { field: 'cashCollectedAt' },
      ).allowed,
    ).toBe(false);
    expect(
      validDisputeResolution(
        { reason: 'collection_not_made', state: 'open' },
        { field: 'cashCollectedAt' },
      ).allowed,
    ).toBe(false);
    expect(
      validDisputeResolution(
        { reason: 'return_time_incorrect', state: 'resolved' },
        { field: 'returnedAt' },
      ).allowed,
    ).toBe(false);
  });

  it('corrects only an asserted time that exists, to a different value, never money', () => {
    expect(CORRECTABLE_FIELDS).toEqual(['cashCollectedAt', 'returnedAt']);
    const value = COLLECTION.cashCollectedAt;
    expect(
      canCorrect(
        { state: 'cash_collected' },
        'cashCollectedAt',
        { returnReported: false },
        '2026-10-20T08:30:00Z',
        value,
      ).allowed,
    ).toBe(true);
    expect(
      reasonOf(
        canCorrect(
          { state: 'pending' },
          'cashCollectedAt',
          { returnReported: false },
          '2026-10-20T08:30:00Z',
          value,
        ),
      ),
    ).toBe('assistance_correction_not_permitted');
    expect(
      reasonOf(
        canCorrect(
          { state: 'settled' },
          'returnedAt',
          { returnReported: false },
          '2026-10-20T08:30:00Z',
          value,
        ),
      ),
    ).toBe('assistance_correction_not_permitted');
    expect(
      reasonOf(
        canCorrect(
          { state: 'settled' },
          'cashCollectedAt',
          { returnReported: false },
          value,
          value,
        ),
      ),
    ).toBe('assistance_correction_changes');
  });

  it('reads the effective time from the latest correction of that field, else the original', () => {
    const original = COLLECTION.cashCollectedAt;
    expect(effectiveTime(original, 'cashCollectedAt', [])).toBe(original);
    const corrections = [
      { field: 'cashCollectedAt' as const, sequence: 1, correctedValue: 'A' },
      { field: 'returnedAt' as const, sequence: 3, correctedValue: 'R' },
      { field: 'cashCollectedAt' as const, sequence: 2, correctedValue: 'B' },
    ];
    expect(effectiveTime(original, 'cashCollectedAt', corrections)).toBe('B');
    expect(effectiveTime('orig-returned', 'returnedAt', corrections)).toBe('R');
  });
});

describe('late settlement, recovery and surplus', () => {
  it("records Billing's closed L-4 refusals and never applies a late settlement by itself", () => {
    expect(LATE_SETTLEMENT_REFUSALS).toHaveLength(11);
    const recorded: LateSettlement = {
      id: 'ls-1',
      assistanceRequestId: 'req-1',
      reason: 'channel_closed',
      attestation: 'cash_not_returned',
      applied: false,
    };
    // Nothing in the domain module can apply it: no function takes a late settlement and returns an applied one.
    expect(recorded.applied).toBe(false);
  });

  it('keeps recovery to the base amount only', () => {
    expect(validRecoveryBase({ amount: 3000, currency: 'TND' }, TERMS).allowed).toBe(true);
    expect(validRecoveryBase({ amount: 3200, currency: 'TND' }, TERMS).allowed).toBe(false);
    expect(validRecoveryBase({ amount: 3000, currency: 'EUR' }, TERMS).allowed).toBe(false);
  });

  it('reads a surplus resolution from what Core recorded', () => {
    expect(surplusResolution({ refunded: false, external: null })).toBe('owed');
    expect(surplusResolution({ refunded: true, external: null })).toBe('refunded');
    expect(surplusResolution({ refunded: false, external: { confirmed: false } })).toBe(
      'externalRecorded',
    );
    expect(surplusResolution({ refunded: false, external: { confirmed: true } })).toBe(
      'externalConfirmed',
    );
  });
});

describe('facts, reports, decisions and derived values stay apart', () => {
  it('classifies cash collection and returns as reports, payments as facts, owner actions as decisions', () => {
    expect(INFORMATION_SOURCE.cashCollected).toBe('report');
    expect(INFORMATION_SOURCE.cashReturnReported).toBe('report');
    expect(INFORMATION_SOURCE.cashReturnConfirmed).toBe('report');
    expect(INFORMATION_SOURCE.paymentSucceeded).toBe('fact');
    expect(INFORMATION_SOURCE.purchaseCreated).toBe('fact');
    expect(INFORMATION_SOURCE.lateSuccess).toBe('fact');
    expect(INFORMATION_SOURCE.ownerCorrection).toBe('decision');
    expect(INFORMATION_SOURCE.lateSettlementApplied).toBe('decision');
    expect(INFORMATION_SOURCE.overdue).toBe('derived');
    expect(INFORMATION_SOURCE.outstanding).toBe('derived');
  });

  it('uses Core constraint names verbatim and marks every other reason local', () => {
    const source = [
      requestTransition('declined', 'pending', both),
      validTerms({ ...TERMS, currency: 'x' }),
      cashReturnTransition({ state: 'open', origin: 'deadline' }, 'return_reported', {
        actor: 'beneficiary',
        disputeOpen: false,
      }),
    ].map(reasonOf);
    for (const reason of source)
      expect(reason !== null && (CORE_CONSTRAINTS.has(reason) || reason.startsWith('local:'))).toBe(
        true,
      );
  });
});

/** Never called: each `@ts-expect-error` line must fail to type-check. */
function compileTimeChecks(): void {
  const report = (value: CashCollectionReport) => value;
  const field = (value: (typeof CORRECTABLE_FIELDS)[number]) => value;
  const state = (value: AssistanceRequestState) => value;
  // @ts-expect-error a collection report has no amount: there is no partial collection
  report({ ...COLLECTION, amount: 100 });
  // @ts-expect-error an owner correction never touches money
  field('totalAmount');
  // @ts-expect-error Core has no partially collected state
  state('partially_collected');
  // @ts-expect-error Core has no owner-resolved state (resolved_by_owner stays reserved, J-2)
  state('resolved_by_owner');
  void [organizationId('o'), platformId('p')];
}
