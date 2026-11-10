import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { financialDecision } from '../../../core/authorization/financial-authority';
import {
  FinancialOutcomeState,
  ReceiptAuthorizationState,
} from '../../../core/authorization/financial-authorization-run';
import { FINANCIAL_OPERATIONS } from '../../../core/authorization/financial-operation';
import {
  RECEIPT_OPERATION_PURPOSE,
  ReceiptOperation,
} from '../../../core/authorization/purpose-registry';
import { RECEIPT_BINDING_FIELDS, ReceiptBinding } from '../../../core/authorization/receipt.model';
import { companyId } from '../../../core/context/scope.model';
import {
  OPERATION_PURPOSE_KEYS,
  OPERATION_TITLE_KEYS,
  RECEIPT_FINANCIAL_OPERATION,
  REFUSAL_KEYS,
  ViewInput,
  authorizationGate,
  bindingSummary,
  financialAuthorizationView,
} from './financial-authorization.view';

const OPERATIONS = Object.keys(RECEIPT_OPERATION_PURPOSE) as ReceiptOperation[];
const COMPANY = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a01');
const owner: Actor = { kind: 'owner', userId: 'o', email: 'o@x.invalid', companyId: COMPANY };
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [],
};
const context = { companyId: COMPANY, platformId: null, companyPlatforms: [] };

/** Reads a catalog key from the English catalog (`undefined` when absent). */
const translate = (key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => {
    if (node === null || typeof node !== 'object') return undefined;
    return (node as Record<string, unknown>)[part];
  }, en);

const ID = '00000000-0000-4000-8000-0000000000';
const id = (n: number) => `${ID}${String(n).padStart(2, '0')}`;

const BINDINGS: { readonly [O in ReceiptOperation]: Extract<ReceiptBinding, { operation: O }> } = {
  refund: {
    operation: 'refund',
    audience: 'payment-service',
    companyId: id(1),
    refundCaseId: id(2),
    paymentId: id(3),
    amount: 45000,
    currency: 'TND',
    reason: 'duplicate_payment',
    legalOverride: true,
    captureFactId: id(4),
  },
  dispute_decision: {
    operation: 'dispute_decision',
    audience: 'payment-service',
    companyId: id(1),
    disputeId: id(5),
    paymentId: id(3),
    decision: 'contest',
  },
  fraud_hold_place: {
    operation: 'fraud_hold_place',
    audience: 'billing-service',
    companyId: id(1),
    holdId: id(6),
    beneficiaryUserId: id(7),
    productId: id(8),
    reason: 'suspected_card_fraud',
  },
  fraud_hold_release: {
    operation: 'fraud_hold_release',
    audience: 'billing-service',
    companyId: id(1),
    holdId: id(6),
    beneficiaryUserId: id(7),
    productId: id(8),
  },
  recovery_surplus_external: {
    operation: 'recovery_surplus_external',
    audience: 'billing-service',
    companyId: id(1),
    surplusId: id(9),
    organizationId: id(10),
    amount: 700,
    currency: 'TND',
  },
  late_settlement_apply: {
    operation: 'late_settlement_apply',
    audience: 'billing-service',
    companyId: id(1),
    lateSettlementId: id(11),
    assistanceRequestId: id(12),
    beneficiaryUserId: id(7),
    reasonCode: 'cash_not_returned_attested',
  },
  provider_fact_associate: {
    operation: 'provider_fact_associate',
    audience: 'payment-service',
    companyId: id(1),
    factId: id(13),
    kind: 'refund',
    amount: 900,
    currency: 'TND',
    targetType: 'refund_authorization',
    targetId: id(14),
  },
  recovery_write_off: {
    operation: 'recovery_write_off',
    audience: 'billing-service',
    companyId: id(1),
    obligationId: id(15),
    organizationId: id(10),
    amount: 12500,
    currency: 'TND',
  },
  recovery_restriction_suspend: {
    operation: 'recovery_restriction_suspend',
    audience: 'billing-service',
    companyId: id(1),
    suspensionId: id(16),
    obligationId: id(15),
    organizationId: id(10),
    disputeId: id(17),
    refundCaseId: id(18),
    reasonCode: 'refund_chargeback_overlap',
  },
  recovery_restriction_revoke: {
    operation: 'recovery_restriction_revoke',
    audience: 'billing-service',
    companyId: id(1),
    suspensionId: id(16),
    obligationId: id(15),
    organizationId: id(10),
    disputeId: id(17),
    refundCaseId: id(18),
    reasonCode: 'owner_reinstated_restriction',
  },
};

const NOT_SUBMITTED: FinancialOutcomeState<string> = { status: 'notSubmitted', lastFailure: null };
const ISSUED: ReceiptAuthorizationState = {
  step: 'issued',
  receiptId: id(90),
  expiresAt: '2026-11-01T12:10:00Z',
  simulated: true,
};

const view = (
  authorization: ReceiptAuthorizationState,
  outcome: FinancialOutcomeState<string> = NOT_SUBMITTED,
  extra: Partial<ViewInput<string>> = {},
) =>
  financialAuthorizationView<string>({
    authorization,
    outcome,
    busy: false,
    canRepeatIdentical: false,
    canReconcile: true,
    ...extra,
  });

describe('Financial authorization presentation adapter (F1-S6b)', () => {
  describe('purpose and authority', () => {
    it('maps each receipt operation to the one authority rule that requires exactly its receipt purpose', () => {
      for (const operation of OPERATIONS) {
        const rule = FINANCIAL_OPERATIONS[RECEIPT_FINANCIAL_OPERATION[operation]];
        expect(rule.authorization).toEqual({
          kind: 'receipt',
          purpose: RECEIPT_OPERATION_PURPOSE[operation],
        });
      }
      expect(new Set(Object.values(RECEIPT_FINANCIAL_OPERATION)).size).toBe(OPERATIONS.length);
    });

    it('lets the owner ask for every attemptable receipt operation, in the own Company only', () => {
      for (const operation of OPERATIONS) {
        const rule = FINANCIAL_OPERATIONS[RECEIPT_FINANCIAL_OPERATION[operation]];
        const gate = authorizationGate(
          financialDecision(owner, RECEIPT_FINANCIAL_OPERATION[operation], context),
          operation,
        );
        expect(gate).toEqual(
          rule.availability === 'unavailable'
            ? { allowed: false, reason: 'unavailable' }
            : { allowed: true },
        );
      }
      const elsewhere = financialDecision(owner, 'refund.authorize', {
        ...context,
        companyId: companyId('another'),
      });
      expect(authorizationGate(elsewhere, 'refund')).toEqual({
        allowed: false,
        reason: 'outOfScope',
      });
    });

    it('refuses an operator (no delegated receipt authority) and a signed-out person before anything is asked', () => {
      for (const operation of OPERATIONS) {
        const decision = financialDecision(
          operator,
          RECEIPT_FINANCIAL_OPERATION[operation],
          context,
        );
        const gate = authorizationGate(decision, operation);
        expect(gate.allowed).toBe(false);
        expect(gate).not.toEqual({ allowed: true });
        expect(
          authorizationGate(
            financialDecision(null, RECEIPT_FINANCIAL_OPERATION[operation], context),
            operation,
          ).allowed,
        ).toBe(false);
      }
      expect(
        authorizationGate(financialDecision(operator, 'refund.authorize', context), 'refund'),
      ).toEqual({ allowed: false, reason: 'actorKind' });
    });

    it('never opens one operation’s receipt with another operation’s decision', () => {
      const refund = financialDecision(owner, 'refund.authorize', context);
      expect(authorizationGate(refund, 'dispute_decision')).toEqual({
        allowed: false,
        reason: 'notReceipt',
      });
      const fees = financialDecision(operator, 'fees.propose', {
        ...context,
        companyId: null,
      });
      expect(authorizationGate(fees, 'refund').allowed).toBe(false);
    });

    it('has a title, a purpose and refusal copy for every case', () => {
      for (const operation of OPERATIONS) {
        expect(typeof translate(OPERATION_TITLE_KEYS[operation])).toBe('string');
        expect(typeof translate(OPERATION_PURPOSE_KEYS[operation])).toBe('string');
      }
      for (const key of Object.values(REFUSAL_KEYS)) expect(typeof translate(key)).toBe('string');
    });
  });

  describe('target summary', () => {
    it('shows every bound field except the operation and audience, with copy for each label', () => {
      for (const operation of OPERATIONS) {
        const binding = BINDINGS[operation];
        const rows = bindingSummary(binding);
        const fields = [
          ...RECEIPT_BINDING_FIELDS[operation].required,
          ...RECEIPT_BINDING_FIELDS[operation].optional,
        ].filter((field) => field !== 'operation' && field !== 'audience' && field !== 'currency');
        expect(rows).toHaveLength(fields.length);
        for (const row of rows) expect(typeof translate(row.label)).toBe('string');
      }
    });

    it('keeps amounts in minor units with their currency, ids and codes as machine values', () => {
      const rows = bindingSummary(BINDINGS.refund);
      expect(
        rows.find((row) => row.label === 'financialAuthorization.fields.amount')?.value,
      ).toEqual({ kind: 'money', amount: 45000, currency: 'TND' });
      expect(
        rows.find((row) => row.label === 'financialAuthorization.fields.payment')?.value,
      ).toEqual({ kind: 'id', value: id(3) });
      expect(
        rows.find((row) => row.label === 'financialAuthorization.fields.reason')?.value,
      ).toEqual({ kind: 'code', value: 'duplicate_payment' });
      expect(
        rows.find((row) => row.label === 'financialAuthorization.fields.legalOverride')?.value,
      ).toEqual({ kind: 'flag', value: true });
    });
  });

  describe('states', () => {
    it('asks for the code, and only for the code, while awaiting the factor', () => {
      const awaiting = view({ step: 'awaitingFactor', failure: null });
      expect(awaiting.body).toBe('code');
      expect(awaiting.actions).toEqual(['verify']);
      expect(awaiting.dismiss).toBe('cancel');
      expect(view({ step: 'verifying' }).body).toBe('code');
    });

    it('never shows an issued authorization as a financial result', () => {
      for (const simulated of [true, false]) {
        const issued = view({ ...ISSUED, simulated });
        expect(issued.authorization.tone).toBe('info');
        expect(issued.authorization.key).toBe(
          simulated
            ? 'financialAuthorization.authorization.issuedSimulated'
            : 'financialAuthorization.authorization.issued',
        );
        expect(issued.outcome).toEqual({
          tone: 'neutral',
          key: 'financialAuthorization.outcome.notSubmitted',
        });
        expect(issued.message).toBeNull();
        expect(issued.actions).toEqual(['discard', 'submit']);
      }
      // Only the consumer's answer, or a proving read, is a financial result.
      expect(
        view(
          { step: 'consumed', receiptId: id(90) },
          {
            status: 'applied',
            result: 'ok',
            via: 'answer',
          },
        ).outcome,
      ).toEqual({ tone: 'success', key: 'financialAuthorization.outcome.applied' });
      expect(
        view(
          { step: 'consumed', receiptId: id(90) },
          {
            status: 'applied',
            result: 'ok',
            via: 'reconciliation',
          },
        ).outcome.key,
      ).toBe('financialAuthorization.outcome.appliedByCheck');
    });

    it('offers no move while anything is in flight', () => {
      for (const authorization of [
        { step: 'issuing' } as const,
        ISSUED,
        { step: 'verifying' } as const,
      ]) {
        const busy = view(authorization, { status: 'submitted' }, { busy: true });
        if (busy.body !== 'code') expect(busy.actions).toEqual([]);
        expect(busy.dismiss).toBe('cancel');
      }
      expect(view(ISSUED, { status: 'submitted' }, { busy: true }).body).toBe('working');
    });

    it('offers the same issuance request again once, never a second receipt', () => {
      expect(view({ step: 'issueUnknown', replayed: false }).actions).toEqual(['replayIssue']);
      expect(view({ step: 'issueUnknown', replayed: true }).actions).toEqual([]);
      expect(view({ step: 'issueUnknown', replayed: false }).message?.tone).toBe('warning');
    });

    it('after "nothing changed", sends the same request again (still the held receipt)', () => {
      const nothingChanged = view(ISSUED, {
        status: 'notSubmitted',
        lastFailure: { kind: 'unavailableNoMutation', code: 'auth_timeout' },
      });
      expect(nothingChanged.actions).toEqual(['discard', 'submit']);
      expect(nothingChanged.message?.key).toBe('financialAuthorization.outcome.nothingChanged');
      expect(nothingChanged.authorization.key).toBe(
        'financialAuthorization.authorization.heldSimulated',
      );
    });

    it('after an uncertain outcome, offers only what Core sanctions: the identical repeat and a check', () => {
      const unresolved = view(
        ISSUED,
        { status: 'unresolved', failure: { kind: 'recordedUnresolved', code: 'x' } },
        { canRepeatIdentical: true },
      );
      expect(unresolved.actions).toEqual(['reconcile', 'repeatIdentical']);
      // Sent: the authorization line never says "nothing has been sent" any more.
      expect(unresolved.authorization.key).toBe(
        'financialAuthorization.authorization.heldSimulated',
      );
      expect(
        view({ ...ISSUED, simulated: false }, { status: 'outcomeUnknown', policy: 'sameKeyReplay' })
          .authorization.key,
      ).toBe('financialAuthorization.authorization.held');
      expect(unresolved.message?.tone).toBe('warning');
      const replay = view(
        ISSUED,
        { status: 'outcomeUnknown', policy: 'sameKeyReplay' },
        { canRepeatIdentical: true },
      );
      expect(replay.actions).toEqual(['reconcile', 'repeatIdentical']);
      expect(replay.actions).not.toContain('submit');
      expect(replay.actions).not.toContain('startAgain');
    });

    it('blocks a no-key route after an uncertain outcome: a check only, no repeat, no new authorization', () => {
      const blocked = view(
        { step: 'ended', reason: 'outcomeUncertain', issueFailure: null },
        { status: 'outcomeUnknown', policy: 'blockedUntilCF74' },
      );
      expect(blocked.actions).toEqual(['reconcile']);
      expect(blocked.outcome).toEqual({
        tone: 'danger',
        key: 'financialAuthorization.outcome.unknownBlocked',
      });
      expect(blocked.message).toEqual(blocked.outcome);
      const noCheck = view(
        { step: 'ended', reason: 'outcomeUncertain', issueFailure: null },
        { status: 'outcomeUnknown', policy: 'blockedUntilCF74' },
        { canReconcile: false },
      );
      expect(noCheck.actions).toEqual([]);
      const target = view({ step: 'blocked' });
      expect(target.actions).toEqual([]);
      expect(target.message?.key).toBe('financialAuthorization.authorization.blocked');
    });

    it('offers a new authorization only after an end that sent nothing', () => {
      for (const reason of ['expired', 'voided', 'issueRefused'] as const)
        expect(view({ step: 'ended', reason, issueFailure: null }).actions).toEqual(['startAgain']);
      for (const reason of [
        'cancelled',
        'contextChanged',
        'revoked',
        'notInBuild',
        'spent',
        'outcomeUncertain',
      ] as const)
        expect(view({ step: 'ended', reason, issueFailure: null }).actions).not.toContain(
          'startAgain',
        );
      const refused = view(
        { step: 'ended', reason: 'spent', issueFailure: null },
        { status: 'refused', failure: { kind: 'receiptRefused', code: 'x' } },
      );
      expect(refused.actions).toEqual([]);
      expect(refused.message?.key).toBe('financialAuthorization.outcome.refused');
    });

    it('has copy for every authorization and outcome line in every language', () => {
      const lines = [
        view({ step: 'closed' }),
        view({ step: 'blocked' }),
        view({ step: 'awaitingFactor', failure: null }),
        view({ step: 'verifying' }),
        view({ step: 'issuing' }),
        view({ step: 'issueUnknown', replayed: false }),
        view(ISSUED),
        view({ ...ISSUED, simulated: false }),
        view({ step: 'consumed', receiptId: id(90) }),
        ...(
          [
            'cancelled',
            'contextChanged',
            'revoked',
            'expired',
            'voided',
            'issueRefused',
            'notInBuild',
            'spent',
            'outcomeUncertain',
          ] as const
        ).map((reason) => view({ step: 'ended', reason, issueFailure: null })),
        ...(
          [
            NOT_SUBMITTED,
            { status: 'notSubmitted', lastFailure: { kind: 'unavailableNoMutation' } },
            { status: 'submitted' },
            { status: 'applied', result: 'r', via: 'answer' },
            { status: 'applied', result: 'r', via: 'reconciliation' },
            { status: 'refused', failure: { kind: 'definitiveRefusal' } },
            { status: 'unresolved', failure: { kind: 'recordedUnresolved', code: 'c' } },
            { status: 'outcomeUnknown', policy: 'sameKeyReplay' },
            { status: 'outcomeUnknown', policy: 'blockedUntilCF74' },
          ] satisfies FinancialOutcomeState<string>[]
        ).map((outcome) => view(ISSUED, outcome)),
      ];
      for (const line of lines) {
        expect(typeof translate(line.authorization.key)).toBe('string');
        expect(typeof translate(line.outcome.key)).toBe('string');
      }
    });
  });
});
