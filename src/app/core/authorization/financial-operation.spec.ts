import {
  FINANCIAL_AUTHORITY_BASELINE,
  FINANCIAL_OPERATIONS,
  FinancialAuthorization,
  FinancialAvailability,
  FinancialOperation,
  FinancialOperationRule,
} from './financial-operation';
import {
  ASSISTANCE_STEP_UP_PURPOSE,
  PURPOSE_RULES,
  RECEIPT_OPERATION_PURPOSE,
  isCorePurpose,
} from './purpose-registry';

const entries: [string, FinancialOperationRule][] = Object.entries(FINANCIAL_OPERATIONS);
const ids = entries.map(([id]) => id);
const sorted = (values: readonly string[]) => [...values].sort();

/** The intended operation of each Core receipt purpose (nawara-core 0044b20 receipts/receipt-binding.ts:158-162). */
const RECEIPT_PURPOSE_OPERATION: Readonly<Record<string, string>> = {
  [RECEIPT_OPERATION_PURPOSE.refund]: 'refund.authorize',
  [RECEIPT_OPERATION_PURPOSE.dispute_decision]: 'dispute.decide',
  [RECEIPT_OPERATION_PURPOSE.fraud_hold_place]: 'fraudHold.place',
  [RECEIPT_OPERATION_PURPOSE.fraud_hold_release]: 'fraudHold.release',
  [RECEIPT_OPERATION_PURPOSE.recovery_surplus_external]: 'surplus.recordExternalRepayment',
  [RECEIPT_OPERATION_PURPOSE.late_settlement_apply]: 'lateSettlement.apply',
  [RECEIPT_OPERATION_PURPOSE.provider_fact_associate]: 'providerFact.associate',
  [RECEIPT_OPERATION_PURPOSE.recovery_write_off]: 'recovery.writeOff',
};

const DEVELOPMENT_ONLY = [
  'platformBilling.read',
  'platformBilling.configure',
  'catalog.read',
  'catalog.manageProducts',
  'catalog.managePrices',
  'fees.setCaps',
  'fees.manageDelegations',
  'fees.decideProposal',
  'fees.propose',
];
const UNAVAILABLE = [
  'fees.read',
  'invoices.list',
  'payments.list',
  'assistance.read',
  'refundCase.list',
  'dispute.addEvidence',
  'fraudHold.place',
  'fraudHold.list',
  'recovery.list',
  'surplus.recordExternalRepayment',
  'lateSettlement.list',
  'legalRemedy.record',
];

const authorizationOf = (rule: FinancialOperationRule): FinancialAuthorization =>
  rule.authorization;

describe('FINANCIAL_OPERATIONS (Core 0044b20)', () => {
  it('gives every operation a unique id, a register id or an explicit null, and Core evidence at the baseline', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(40);
    for (const [id, rule] of entries) {
      expect(rule.core.revision, id).toBe(FINANCIAL_AUTHORITY_BASELINE.revision);
      expect(rule.core.evidence.length, id).toBeGreaterThan(0);
      expect(rule.register === null || /^(BIL|PAY|R6H)-\d+$/.test(rule.register), id).toBe(true);
      if (rule.availability !== 'unavailable') {
        expect(rule.register, id).not.toBeNull();
        expect(rule.core.route, id).toMatch(/^(GET|POST|PUT) \//);
        expect(rule.core.evidence, id).toMatch(/^(billing|payment)-service\/src\//);
      }
    }
  });

  it('maps every Core receipt purpose to exactly its intended operation, and nothing else', () => {
    const receiptPurposes = Object.keys(PURPOSE_RULES).filter(
      (purpose) => isCorePurpose(purpose) && PURPOSE_RULES[purpose].transport === 'receipt',
    );
    expect(sorted(Object.keys(RECEIPT_PURPOSE_OPERATION))).toEqual(sorted(receiptPurposes));
    const required = entries.flatMap(([id, rule]) => {
      const authorization = authorizationOf(rule);
      return authorization.kind === 'receipt' ? [[authorization.purpose, id] as const] : [];
    });
    expect(required).toHaveLength(receiptPurposes.length);
    for (const [purpose, id] of required)
      expect(RECEIPT_PURPOSE_OPERATION[purpose], purpose).toBe(id);
  });

  it('uses the two financial service-verified purposes of F1-S1, each once, as header proofs to Billing', () => {
    const stepUps = entries.flatMap(([id, rule]) => {
      const authorization = authorizationOf(rule);
      return authorization.kind === 'serviceVerifiedStepUp'
        ? [[authorization.purpose, id] as const]
        : [];
    });
    expect(stepUps).toEqual([
      [ASSISTANCE_STEP_UP_PURPOSE.correct, 'assistance.correct'],
      [ASSISTANCE_STEP_UP_PURPOSE.disputeResolve, 'assistance.resolveDispute'],
    ]);
    for (const [purpose] of stepUps)
      expect(PURPOSE_RULES[purpose]).toMatchObject({
        transport: 'serviceVerified',
        delivery: 'header',
        recipient: 'billing',
      });
  });

  it('classifies availability without any production state', () => {
    expect(
      sorted(entries.filter(([, r]) => r.availability === 'developmentOnly').map(([id]) => id)),
    ).toEqual(sorted(DEVELOPMENT_ONLY));
    expect(
      sorted(entries.filter(([, r]) => r.availability === 'unavailable').map(([id]) => id)),
    ).toEqual(sorted(UNAVAILABLE));
    for (const [id, rule] of entries)
      expect(['developmentOnly', 'simulationOnly', 'unavailable'], id).toContain(rule.availability);
  });

  it('names the missing Core prerequisite of every unavailable operation', () => {
    for (const [id, rule] of entries) {
      if (rule.availability !== 'unavailable') continue;
      expect(rule.missing.length, id).toBeGreaterThan(0);
    }
    expect(FINANCIAL_OPERATIONS['dispute.addEvidence'].missing).toContain('CF-71');
    expect(FINANCIAL_OPERATIONS['fraudHold.place'].missing).toContain('CF-71');
    expect(FINANCIAL_OPERATIONS['surplus.recordExternalRepayment'].missing).toContain('CF-71');
    expect(FINANCIAL_OPERATIONS['refundCase.list'].missing).toEqual(['CF-65']);
    expect(FINANCIAL_OPERATIONS['invoices.list'].missing).toEqual(['CF-66']);
    expect(FINANCIAL_OPERATIONS['payments.list'].missing).toEqual(['CF-66']);
    expect(FINANCIAL_OPERATIONS['fees.read'].missing).toEqual(['CF-72']);
  });

  it('gives operators exactly one operation, fee proposals, which keeps the live-delegation check', () => {
    const operatorOperations = entries
      .filter(([, rule]) => rule.availability !== 'unavailable' && rule.actor === 'operator')
      .map(([id]) => id);
    expect(operatorOperations).toEqual(['fees.propose']);
    const propose = FINANCIAL_OPERATIONS['fees.propose'];
    expect(propose.authority).toBe('assignedOperatorWithDelegation');
    expect(propose.scope).toBe('platform');
    expect(propose.pendingCoreChecks).toContain('liveDelegation');
    expect(propose.pendingCoreChecks).toContain('platformAccess');
  });

  it('models fee decisions on verified owner authority, with the proposal left to Core', () => {
    const decide = FINANCIAL_OPERATIONS['fees.decideProposal'];
    expect(decide).toMatchObject({ actor: 'owner', scope: 'company', authority: 'companyOwner' });
    expect(decide.pendingCoreChecks).toEqual(
      expect.arrayContaining(['liveAuthority', 'platformAccess', 'resourceOwnership']),
    );
  });

  it('keeps Core-only checks pending: every attempt needs live authority, every proof needs Core to accept it', () => {
    for (const [id, rule] of entries) {
      if (rule.availability === 'unavailable') continue;
      expect(rule.pendingCoreChecks, id).toContain('liveAuthority');
      if (rule.authorization.kind !== 'none')
        expect(rule.pendingCoreChecks, id).toContain('authorizationProof');
    }
  });

  it('rejects incompatible purposes and a production state at compile time', () => {
    expectTypeOf<FinancialAvailability>().toEqualTypeOf<
      'developmentOnly' | 'simulationOnly' | 'unavailable'
    >();
    expectTypeOf<FinancialOperation>().toEqualTypeOf<keyof typeof FINANCIAL_OPERATIONS>();
    expect(compileTimeChecks).toBeTypeOf('function');
  });
});

/** Never called: each `@ts-expect-error` line must fail to type-check. */
function compileTimeChecks(): void {
  const availability = (value: FinancialAvailability) => value;
  const authorization = (value: FinancialAuthorization) => value;
  const operation = (value: FinancialOperation) => value;
  // @ts-expect-error no production state exists
  availability('availableInProduction');
  // @ts-expect-error a receipt requirement never takes a header (Organization) purpose
  authorization({ kind: 'receipt', purpose: 'platform.create' });
  // @ts-expect-error a receipt purpose is never a service-verified step-up
  authorization({ kind: 'serviceVerifiedStepUp', purpose: 'refund.authorize' });
  // @ts-expect-error only the two financial service-verified purposes qualify, not Release's
  authorization({ kind: 'serviceVerifiedStepUp', purpose: 'release.withdraw' });
  // @ts-expect-error an Auth-local purpose is never a receipt
  authorization({ kind: 'receipt', purpose: 'operator.create' });
  // @ts-expect-error operations are a closed set
  operation('refund.forceComplete');
}
