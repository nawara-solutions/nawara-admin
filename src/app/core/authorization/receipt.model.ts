import { ReceiptSecret } from './receipt-secret';
import { RECEIPT_OPERATION_PURPOSE, ReceiptOperation } from './purpose-registry';
import { ReceiptStepUpProof } from './step-up-proof';

/**
 * The authorization-receipt contract (F1-S3; docs/design/f1-financial-authorization.md §6.3), mirrored field for field from
 * nawara-core `0044b20` auth-service `src/receipts/receipt-binding.ts:1-173` (the binding types and their validation) and
 * `src/receipts/dto.ts:109-120` (`POST /auth/admin/authorization-receipts`). Types only: nothing here issues, stores or sends
 * a receipt.
 *
 * Value formats Core enforces (`receipt-binding.ts:175-177`): ids are canonical lower-case UUIDs; `amount` is a positive safe
 * integer in minor units; `currency` is ISO 4217 upper case; `reason` is a bounded code `^[a-z][a-z0-9_]{0,63}$`. Every value
 * comes from a Core read, never from typing.
 *
 * UNCERTAIN (not a verified contract): Auth checks only the FORMAT of `reason`; the closed set of refund and fraud-hold reason
 * codes belongs to Billing and was not verified, so `reason` stays a `string` here.
 */

/** The one service allowed to consume each receipt (`receipt-binding.ts:149-156`, `RECEIPT_AUDIENCES`). */
export const RECEIPT_AUDIENCE = {
  refund: 'payment-service',
  dispute_decision: 'payment-service',
  fraud_hold_place: 'billing-service',
  fraud_hold_release: 'billing-service',
  recovery_surplus_external: 'billing-service',
  late_settlement_apply: 'billing-service',
  provider_fact_associate: 'payment-service',
  recovery_write_off: 'billing-service',
} as const satisfies Readonly<Record<ReceiptOperation, 'payment-service' | 'billing-service'>>;

/** `receipt-binding.ts:93` (`LATE_SETTLEMENT_REASONS`). */
export const LATE_SETTLEMENT_REASONS = [
  'cash_not_returned_attested',
  'cash_not_returned_evidenced',
] as const;
/** `receipt-binding.ts:110-111` (`FACT_ASSOCIATION_TARGETS`, `FACT_KINDS`). */
export const FACT_ASSOCIATION_TARGETS = ['payment', 'refund_authorization'] as const;
export const FACT_KINDS = ['capture', 'refund', 'chargeback'] as const;

/**
 * `RefundBinding` (`receipt-binding.ts:14-36`). On the wire `legalOverride` may be omitted (Core reads it as `false`) and
 * `captureFactId` is present only for a capture-specific refund (absent, never `null`, for an ordinary one).
 */
export interface RefundReceiptBinding {
  readonly operation: 'refund';
  readonly audience: 'payment-service';
  readonly companyId: string;
  readonly refundCaseId: string;
  readonly paymentId: string;
  readonly amount: number;
  readonly currency: string;
  readonly reason: string;
  readonly legalOverride?: boolean;
  readonly captureFactId?: string;
}

/** `DisputeDecisionBinding` (`receipt-binding.ts:43-50`). */
export interface DisputeDecisionReceiptBinding {
  readonly operation: 'dispute_decision';
  readonly audience: 'payment-service';
  readonly companyId: string;
  readonly disputeId: string;
  readonly paymentId: string;
  readonly decision: 'contest' | 'accept';
}

/** `FraudHoldPlaceBinding` (`receipt-binding.ts:57-65`); `holdId` is chosen before placement. */
export interface FraudHoldPlaceReceiptBinding {
  readonly operation: 'fraud_hold_place';
  readonly audience: 'billing-service';
  readonly companyId: string;
  readonly holdId: string;
  readonly beneficiaryUserId: string;
  readonly productId: string;
  readonly reason: string;
}

/** `FraudHoldReleaseBinding` (`receipt-binding.ts:66-73`). */
export interface FraudHoldReleaseReceiptBinding {
  readonly operation: 'fraud_hold_release';
  readonly audience: 'billing-service';
  readonly companyId: string;
  readonly holdId: string;
  readonly beneficiaryUserId: string;
  readonly productId: string;
}

/** `SurplusExternalBinding` (`receipt-binding.ts:79-87`). */
export interface SurplusExternalReceiptBinding {
  readonly operation: 'recovery_surplus_external';
  readonly audience: 'billing-service';
  readonly companyId: string;
  readonly surplusId: string;
  readonly organizationId: string;
  readonly amount: number;
  readonly currency: string;
}

/** `LateSettlementApplyBinding` (`receipt-binding.ts:99-107`). */
export interface LateSettlementApplyReceiptBinding {
  readonly operation: 'late_settlement_apply';
  readonly audience: 'billing-service';
  readonly companyId: string;
  readonly lateSettlementId: string;
  readonly assistanceRequestId: string;
  readonly beneficiaryUserId: string;
  readonly reasonCode: (typeof LATE_SETTLEMENT_REASONS)[number];
}

/** `ProviderFactAssociateBinding` (`receipt-binding.ts:117-127`). */
export interface ProviderFactAssociateReceiptBinding {
  readonly operation: 'provider_fact_associate';
  readonly audience: 'payment-service';
  readonly companyId: string;
  readonly factId: string;
  readonly kind: (typeof FACT_KINDS)[number];
  readonly amount: number;
  readonly currency: string;
  readonly targetType: (typeof FACT_ASSOCIATION_TARGETS)[number];
  readonly targetId: string;
}

/** `RecoveryWriteOffBinding` (`receipt-binding.ts:134-142`). */
export interface RecoveryWriteOffReceiptBinding {
  readonly operation: 'recovery_write_off';
  readonly audience: 'billing-service';
  readonly companyId: string;
  readonly obligationId: string;
  readonly organizationId: string;
  readonly amount: number;
  readonly currency: string;
}

export type ReceiptBinding =
  | RefundReceiptBinding
  | DisputeDecisionReceiptBinding
  | FraudHoldPlaceReceiptBinding
  | FraudHoldReleaseReceiptBinding
  | SurplusExternalReceiptBinding
  | LateSettlementApplyReceiptBinding
  | ProviderFactAssociateReceiptBinding
  | RecoveryWriteOffReceiptBinding;

/** The binding of exactly one operation. */
export type ReceiptBindingFor<O extends ReceiptOperation> = Extract<
  ReceiptBinding,
  { operation: O }
>;

/** The step-up purpose an operation's issuance consumes (F1-S1 registry). */
export type ReceiptPurposeOf<O extends ReceiptOperation> = (typeof RECEIPT_OPERATION_PURPOSE)[O];

/**
 * The fields of each binding, as Core accepts them (`receipt-binding.ts:164-173`): an unknown field is refused, every
 * non-optional one is required.
 */
export const RECEIPT_BINDING_FIELDS = {
  refund: {
    required: [
      'operation',
      'audience',
      'companyId',
      'refundCaseId',
      'paymentId',
      'amount',
      'currency',
      'reason',
    ],
    optional: ['legalOverride', 'captureFactId'],
  },
  dispute_decision: {
    required: ['operation', 'audience', 'companyId', 'disputeId', 'paymentId', 'decision'],
    optional: [],
  },
  fraud_hold_place: {
    required: [
      'operation',
      'audience',
      'companyId',
      'holdId',
      'beneficiaryUserId',
      'productId',
      'reason',
    ],
    optional: [],
  },
  fraud_hold_release: {
    required: ['operation', 'audience', 'companyId', 'holdId', 'beneficiaryUserId', 'productId'],
    optional: [],
  },
  recovery_surplus_external: {
    required: [
      'operation',
      'audience',
      'companyId',
      'surplusId',
      'organizationId',
      'amount',
      'currency',
    ],
    optional: [],
  },
  late_settlement_apply: {
    required: [
      'operation',
      'audience',
      'companyId',
      'lateSettlementId',
      'assistanceRequestId',
      'beneficiaryUserId',
      'reasonCode',
    ],
    optional: [],
  },
  provider_fact_associate: {
    required: [
      'operation',
      'audience',
      'companyId',
      'factId',
      'kind',
      'amount',
      'currency',
      'targetType',
      'targetId',
    ],
    optional: [],
  },
  recovery_write_off: {
    required: [
      'operation',
      'audience',
      'companyId',
      'obligationId',
      'organizationId',
      'amount',
      'currency',
    ],
    optional: [],
  },
} as const satisfies Readonly<
  Record<
    ReceiptOperation,
    { readonly required: readonly string[]; readonly optional: readonly string[] }
  >
>;

/**
 * What a future adapter sends to `POST /auth/admin/authorization-receipts`: the binding and the step-up of exactly its
 * operation's purpose in the JSON body, and the `Idempotency-Key` header (`authorization-receipt.controller.ts:44-50`).
 */
export type ReceiptIssueRequest<O extends ReceiptOperation = ReceiptOperation> =
  O extends ReceiptOperation
    ? {
        readonly binding: ReceiptBindingFor<O>;
        readonly stepUp: ReceiptStepUpProof<ReceiptPurposeOf<O>>;
        readonly idempotencyKey: string;
      }
    : never;

/**
 * An issued receipt (`IssuedReceiptDto`, `dto.ts:116-120`: `receiptId`, `secret`, `expiresAt`). The secret is returned once,
 * never on a replay, and lives 10 minutes (`authorization-receipt.service.ts:14-15`). Issued is not completed: an issued
 * receipt proves nothing about the financial operation it may later authorize.
 */
export interface IssuedReceipt<O extends ReceiptOperation = ReceiptOperation> {
  readonly receiptId: string;
  readonly secret: ReceiptSecret;
  /** Core's expiry (issuedAt + 10 minutes by the database clock), UTC ISO 8601. */
  readonly expiresAt: string;
  /** The binding as it was requested (Core does not echo it back). */
  readonly binding: ReceiptIssueRequest<O>['binding'];
  /** Present only on a demo receipt (F1-S4): simulated, never issued by Nawara Core, never valid against Core. */
  readonly simulated?: true;
}
