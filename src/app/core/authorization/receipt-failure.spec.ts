import { AppError, adapterUnavailable } from '../errors/app-error';
import { FINANCIAL_OPERATIONS } from './financial-operation';
import { ReceiptOperation } from './purpose-registry';
import {
  FinancialCommandFailure,
  RECEIPT_CONSUMERS,
  financialCommandFailureOf,
  receiptIssueFailureOf,
  resubmissionPolicy,
} from './receipt-failure';

const conflict = (code: string): AppError => ({ kind: 'conflict', code, status: 409 });
const unavailable = (code: string): AppError => ({ kind: 'unavailable', code, status: 503 });
const operations = Object.keys(RECEIPT_CONSUMERS).filter((key): key is ReceiptOperation =>
  Object.hasOwn(RECEIPT_CONSUMERS, key),
);
const WITH_KEY: ReceiptOperation[] = [
  'refund',
  'dispute_decision',
  'late_settlement_apply',
  'provider_fact_associate',
];
const WITHOUT_KEY: ReceiptOperation[] = [
  'fraud_hold_place',
  'fraud_hold_release',
  'recovery_surplus_external',
  'recovery_write_off',
];

describe('receiptIssueFailureOf (auth-service receipt-http.ts at 0044b20)', () => {
  it.each<[string, AppError, string]>([
    [
      'step-up refused',
      { kind: 'forbidden', code: 'step_up_required', status: 403 },
      'stepUpRefused',
    ],
    [
      'authority revoked',
      { kind: 'forbidden', code: 'authority_revoked', status: 403 },
      'sessionOrAuthorityRevoked',
    ],
    ['session ended', { kind: 'unauthenticated', status: 401 }, 'sessionOrAuthorityRevoked'],
    [
      'binding invalid',
      { kind: 'validation', code: 'receipt_binding_invalid', messages: [], status: 400 },
      'bindingInvalid',
    ],
    [
      'key missing',
      { kind: 'validation', code: 'idempotency_key_required', messages: [], status: 400 },
      'requestInvalid',
    ],
    ['voided after a lost answer', conflict('receipt_issued_response_lost'), 'voided'],
    ['expired', conflict('receipt_expired'), 'expired'],
    ['already consumed', conflict('receipt_already_consumed'), 'alreadyConsumed'],
    ['key reused', conflict('idempotency_key_reused'), 'idempotencyConflict'],
    ['nothing changed', unavailable('receipt_unavailable'), 'unavailableNoMutation'],
    ['outcome unknown', unavailable('receipt_outcome_unknown'), 'outcomeUnknown'],
    ['no answer', { kind: 'network', status: 0 }, 'outcomeUnknown'],
    ['no adapter', adapterUnavailable(), 'contractUnavailable'],
  ])('%s', (_name, error, kind) => {
    expect(receiptIssueFailureOf(error).kind).toBe(kind);
  });

  it('never treats an undocumented 409 or 503 as a usable answer', () => {
    expect(receiptIssueFailureOf(conflict('something_new')).kind).toBe('outcomeUnknown');
    expect(receiptIssueFailureOf(unavailable('something_new')).kind).toBe('outcomeUnknown');
  });
});

describe('financialCommandFailureOf (receipt consumers at 0044b20)', () => {
  it('lists each consumer under the same register id as the F1-S2 financial registry', () => {
    const registers = Object.values(FINANCIAL_OPERATIONS)
      .filter((rule) => rule.authorization.kind === 'receipt')
      .map((rule) => rule.register);
    expect(operations.map((operation) => RECEIPT_CONSUMERS[operation].register).sort()).toEqual(
      [...registers].sort(),
    );
    expect(operations.filter((o) => RECEIPT_CONSUMERS[o].idempotencyKey).sort()).toEqual(
      [...WITH_KEY].sort(),
    );
  });

  it.each(operations)('%s: maps every documented code to its class', (operation) => {
    const consumer = RECEIPT_CONSUMERS[operation];
    for (const code of consumer.recorded)
      expect(financialCommandFailureOf(operation, unavailable(code))).toEqual({
        kind: 'recordedUnresolved',
        code,
      });
    for (const code of consumer.noMutation)
      expect(financialCommandFailureOf(operation, unavailable(code))).toEqual({
        kind: 'unavailableNoMutation',
        code,
      });
    for (const code of consumer.refused)
      expect(financialCommandFailureOf(operation, conflict(code))).toEqual({
        kind: 'receiptRefused',
        code,
      });
    for (const code of consumer.expired)
      expect(financialCommandFailureOf(operation, conflict(code))).toEqual({
        kind: 'receiptExpiredOrVoided',
        code,
      });
  });

  it.each(operations)(
    '%s: keeps an unknown outcome apart from a definitive refusal',
    (operation) => {
      expect(financialCommandFailureOf(operation, { kind: 'network', status: 0 })).toEqual({
        kind: 'outcomeUnknown',
      });
      expect(financialCommandFailureOf(operation, unavailable('undocumented'))).toEqual({
        kind: 'outcomeUnknown',
      });
      expect(financialCommandFailureOf(operation, conflict('some_business_rule')).kind).toBe(
        'definitiveRefusal',
      );
      expect(financialCommandFailureOf(operation, { kind: 'not_found', status: 404 }).kind).toBe(
        'definitiveRefusal',
      );
      expect(
        financialCommandFailureOf(operation, { kind: 'unauthenticated', status: 401 }).kind,
      ).toBe('sessionOrAuthorityRevoked');
      expect(financialCommandFailureOf(operation, adapterUnavailable()).kind).toBe(
        'contractUnavailable',
      );
      expect(financialCommandFailureOf(operation, conflict('idempotency_key_conflict')).kind).toBe(
        'idempotencyConflict',
      );
    },
  );

  it('carries no server message, so nothing a response says (or leaks) reaches a failure', () => {
    const leaked = 'TEST-only_receipt-secret_0123456789abcdefgh';
    const error: AppError = {
      kind: 'conflict',
      code: 'refund_case_completed',
      status: 409,
      serverMessage: leaked,
    };
    const failure = financialCommandFailureOf('refund', error);
    expect(JSON.stringify(failure)).not.toContain(leaked);
    expect(
      JSON.stringify(receiptIssueFailureOf({ ...error, code: 'receipt_expired' })),
    ).not.toContain(leaked);
  });
});

describe('resubmissionPolicy', () => {
  const unknown: FinancialCommandFailure = { kind: 'outcomeUnknown' };

  it.each(WITHOUT_KEY)(
    '%s (no Idempotency-Key): an unknown outcome stays blocked until CF-74',
    (operation) => {
      expect(resubmissionPolicy(operation, unknown)).toBe('blockedUntilCF74');
    },
  );

  it.each(WITH_KEY)(
    '%s (Idempotency-Key): an unknown outcome may only be replayed under the same key',
    (operation) => {
      expect(resubmissionPolicy(operation, unknown)).toBe('sameKeyReplay');
    },
  );

  it.each(operations)(
    '%s: Core-documented "unresolved" sanctions only the same request',
    (operation) => {
      const code = RECEIPT_CONSUMERS[operation].recorded[0];
      expect(resubmissionPolicy(operation, { kind: 'recordedUnresolved', code })).toBe(
        'sameRequestSanctionedByCore',
      );
    },
  );

  it.each(operations)('%s: definitive answers permit no resubmission', (operation) => {
    for (const failure of [
      { kind: 'definitiveRefusal', code: 'x' },
      { kind: 'receiptRefused', code: 'x' },
      { kind: 'receiptExpiredOrVoided', code: 'x' },
      { kind: 'idempotencyConflict', code: 'x' },
      { kind: 'sessionOrAuthorityRevoked' },
      { kind: 'contractUnavailable' },
    ] as const)
      expect(resubmissionPolicy(operation, failure)).toBe('notPermitted');
  });
});
