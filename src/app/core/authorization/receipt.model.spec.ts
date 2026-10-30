import { FINANCIAL_OPERATIONS } from './financial-operation';
import { PURPOSE_RULES, RECEIPT_OPERATION_PURPOSE, ReceiptOperation } from './purpose-registry';
import { ReceiptStepUpProof, StepUpProof } from './step-up-proof';
import {
  DisputeDecisionReceiptBinding,
  RECEIPT_AUDIENCE,
  RECEIPT_BINDING_FIELDS,
  ReceiptBinding,
  ReceiptBindingFor,
  ReceiptIssueRequest,
  RefundReceiptBinding,
} from './receipt.model';

const UUID = '00000000-0000-4000-8000-000000000001';

/** One complete binding per operation, with exactly Core's required fields (nawara-core 0044b20 receipt-binding.ts). */
const EXAMPLES: { readonly [O in ReceiptOperation]: ReceiptBindingFor<O> } = {
  refund: {
    operation: 'refund',
    audience: 'payment-service',
    companyId: UUID,
    refundCaseId: UUID,
    paymentId: UUID,
    amount: 1500,
    currency: 'TND',
    reason: 'customer_request',
  },
  dispute_decision: {
    operation: 'dispute_decision',
    audience: 'payment-service',
    companyId: UUID,
    disputeId: UUID,
    paymentId: UUID,
    decision: 'contest',
  },
  fraud_hold_place: {
    operation: 'fraud_hold_place',
    audience: 'billing-service',
    companyId: UUID,
    holdId: UUID,
    beneficiaryUserId: UUID,
    productId: UUID,
    reason: 'suspected_fraud',
  },
  fraud_hold_release: {
    operation: 'fraud_hold_release',
    audience: 'billing-service',
    companyId: UUID,
    holdId: UUID,
    beneficiaryUserId: UUID,
    productId: UUID,
  },
  recovery_surplus_external: {
    operation: 'recovery_surplus_external',
    audience: 'billing-service',
    companyId: UUID,
    surplusId: UUID,
    organizationId: UUID,
    amount: 200,
    currency: 'TND',
  },
  late_settlement_apply: {
    operation: 'late_settlement_apply',
    audience: 'billing-service',
    companyId: UUID,
    lateSettlementId: UUID,
    assistanceRequestId: UUID,
    beneficiaryUserId: UUID,
    reasonCode: 'cash_not_returned_attested',
  },
  provider_fact_associate: {
    operation: 'provider_fact_associate',
    audience: 'payment-service',
    companyId: UUID,
    factId: UUID,
    kind: 'capture',
    amount: 1500,
    currency: 'TND',
    targetType: 'payment',
    targetId: UUID,
  },
  recovery_write_off: {
    operation: 'recovery_write_off',
    audience: 'billing-service',
    companyId: UUID,
    obligationId: UUID,
    organizationId: UUID,
    amount: 700,
    currency: 'TND',
  },
};

const operations = Object.keys(RECEIPT_OPERATION_PURPOSE).filter(
  (operation): operation is ReceiptOperation => Object.hasOwn(RECEIPT_OPERATION_PURPOSE, operation),
);

describe('receipt contract (F1-S3, Core 0044b20)', () => {
  it('covers exactly the eight Core receipt operations, each with a receipt-transport purpose', () => {
    expect([...operations].sort()).toEqual(
      [
        'dispute_decision',
        'fraud_hold_place',
        'fraud_hold_release',
        'late_settlement_apply',
        'provider_fact_associate',
        'recovery_surplus_external',
        'recovery_write_off',
        'refund',
      ].sort(),
    );
    expect(Object.keys(RECEIPT_BINDING_FIELDS).sort()).toEqual([...operations].sort());
    expect(Object.keys(RECEIPT_AUDIENCE).sort()).toEqual([...operations].sort());
    for (const operation of operations) {
      const purpose = RECEIPT_OPERATION_PURPOSE[operation];
      expect(PURPOSE_RULES[purpose], operation).toMatchObject({
        transport: 'receipt',
        delivery: 'body',
      });
    }
  });

  it('matches every binding to Core field sets and audiences', () => {
    for (const operation of operations) {
      const example: ReceiptBinding = EXAMPLES[operation];
      const fields = RECEIPT_BINDING_FIELDS[operation];
      const allowed = new Set<string>([...fields.required, ...fields.optional]);
      for (const key of Object.keys(example))
        expect(allowed.has(key), `${operation}.${key}`).toBe(true);
      for (const key of fields.required)
        expect(Object.hasOwn(example, key), `${operation}.${key}`).toBe(true);
      expect(example.operation).toBe(operation);
      expect(example.audience).toBe(RECEIPT_AUDIENCE[operation]);
    }
    expect(RECEIPT_BINDING_FIELDS.refund.optional).toEqual(['legalOverride', 'captureFactId']);
  });

  it('binds the operations F1-S2 marks as receipt-authorized to the same Core register ids', () => {
    const receiptOperations = Object.values(FINANCIAL_OPERATIONS).filter(
      (rule) => rule.authorization.kind === 'receipt',
    );
    expect(receiptOperations).toHaveLength(operations.length);
  });

  it('rejects missing, extra, mistyped and mismatched bindings and proofs at compile time', () => {
    expectTypeOf<ReceiptBindingFor<'refund'>>().toEqualTypeOf<RefundReceiptBinding>();
    expectTypeOf<
      ReceiptBindingFor<'dispute_decision'>
    >().toEqualTypeOf<DisputeDecisionReceiptBinding>();
    expectTypeOf<ReceiptIssueRequest<'refund'>['stepUp']>().toEqualTypeOf<
      ReceiptStepUpProof<'refund.authorize'>
    >();
    expect(compileTimeChecks).toBeTypeOf('function');
  });
});

declare const refundProof: ReceiptStepUpProof<'refund.authorize'>;
declare const disputeProof: ReceiptStepUpProof<'payment.dispute.decide'>;
declare const headerProof: StepUpProof<'operator.create'>;

/** Never called: each `@ts-expect-error` line must fail to type-check. */
function compileTimeChecks(): void {
  const refund = (binding: ReceiptBindingFor<'refund'>) => binding;
  const dispute = (binding: ReceiptBindingFor<'dispute_decision'>) => binding;
  const request = (value: ReceiptIssueRequest<'refund'>) => value;
  const base = EXAMPLES.refund;
  const key = 'key-00000001';
  const decision = EXAMPLES.dispute_decision;
  // @ts-expect-error a required field (paymentId) is missing
  refund({
    operation: 'refund',
    audience: 'payment-service',
    companyId: UUID,
    refundCaseId: UUID,
    amount: 1,
    currency: 'TND',
    reason: 'x',
  });
  // @ts-expect-error an unknown field is refused (Core refuses it too)
  refund({ ...base, note: 'free text' });
  // @ts-expect-error the audience is fixed per operation
  refund({ ...base, audience: 'billing-service' });
  // @ts-expect-error a refund binding never takes an amount as a string
  refund({ ...base, amount: '1500' });
  // @ts-expect-error a dispute decision is contest or accept only
  dispute({ ...decision, decision: 'refund' });
  // @ts-expect-error a refund receipt needs the refund purpose's proof, not the dispute one
  request({ binding: base, stepUp: disputeProof, idempotencyKey: key });
  // @ts-expect-error an Auth-local (header) proof never issues a receipt
  request({ binding: base, stepUp: headerProof, idempotencyKey: key });
  // @ts-expect-error the binding must match the operation of the proof
  request({ binding: decision, stepUp: refundProof, idempotencyKey: key });
  request({ binding: base, stepUp: refundProof, idempotencyKey: key });
}
