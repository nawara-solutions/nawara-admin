import { ADAPTER_UNAVAILABLE, AppError } from '../errors/app-error';
import { ReceiptOperation } from './purpose-registry';

/**
 * Receipt and financial-command failures (F1-S3; docs/design/f1-financial-authorization.md §6.4, §7.2; docs/CORE-INTEGRATION.md
 * §11.12). Mapped from HTTP status and Core `code` only (never Core's `message`), at nawara-core `0044b20`. A failure carries no
 * request value and no secret. Classification only: nothing here resends anything.
 */

/** Why receipt issuance did not produce a secret (auth-service `src/receipts/receipt-http.ts:11-20`, controller `:36-43`). */
export type ReceiptIssueFailure =
  /** `403 step_up_required`: the receipt-purpose step-up was missing, expired, used, of another purpose or session. */
  | { readonly kind: 'stepUpRefused' }
  /** `400 receipt_binding_invalid` (malformed, or not the Owner's own Company). */
  | { readonly kind: 'bindingInvalid' }
  /** `400` otherwise (`idempotency_key_required`, `validation_error`, `step_up_unsupported`). */
  | { readonly kind: 'requestInvalid'; readonly code?: string }
  /** `409 receipt_issued_response_lost`: a replay voided the issued receipt. A new intent needs a new step-up and key. */
  | { readonly kind: 'voided' }
  /** `409 receipt_expired`. */
  | { readonly kind: 'expired' }
  /** `409 receipt_already_consumed`. */
  | { readonly kind: 'alreadyConsumed' }
  /** `409 idempotency_key_reused`: the key was used for another request. */
  | { readonly kind: 'idempotencyConflict' }
  /** `503 receipt_unavailable`, or a refusal before processing (`429`): nothing changed. */
  | { readonly kind: 'unavailableNoMutation' }
  /** `503 receipt_outcome_unknown`, or no answer at all: Core says replay the SAME key (never a new one). */
  | { readonly kind: 'outcomeUnknown' }
  /** `401` (session ended) or `403` (`authority_revoked`, or not an Owner). */
  | { readonly kind: 'sessionOrAuthorityRevoked'; readonly code?: string }
  /** No adapter in this build: nothing was ever sent. */
  | { readonly kind: 'contractUnavailable' };

export function receiptIssueFailureOf(error: AppError): ReceiptIssueFailure {
  const code = 'code' in error ? error.code : undefined;
  switch (error.kind) {
    case 'forbidden':
      return code === 'step_up_required' ? { kind: 'stepUpRefused' } : revoked(code);
    case 'unauthenticated':
      return revoked(code);
    case 'validation':
      return code === 'receipt_binding_invalid'
        ? { kind: 'bindingInvalid' }
        : code === undefined
          ? { kind: 'requestInvalid' }
          : { kind: 'requestInvalid', code };
    case 'conflict':
      switch (code) {
        case 'receipt_issued_response_lost':
          return { kind: 'voided' };
        case 'receipt_expired':
          return { kind: 'expired' };
        case 'receipt_already_consumed':
          return { kind: 'alreadyConsumed' };
        case 'idempotency_key_reused':
          return { kind: 'idempotencyConflict' };
        default:
          // An undocumented 409 at issuance: treated as unknown, never as a usable answer.
          return { kind: 'outcomeUnknown' };
      }
    case 'rate_limited':
      return { kind: 'unavailableNoMutation' };
    case 'unavailable':
      if (code === ADAPTER_UNAVAILABLE) return { kind: 'contractUnavailable' };
      return code === 'receipt_unavailable'
        ? { kind: 'unavailableNoMutation' }
        : { kind: 'outcomeUnknown' };
    case 'not_found':
    case 'network':
    case 'unexpected':
      return { kind: 'outcomeUnknown' };
  }
}

const revoked = (code: string | undefined): ReceiptIssueFailure =>
  code === undefined
    ? { kind: 'sessionOrAuthorityRevoked' }
    : { kind: 'sessionOrAuthorityRevoked', code };

/** Why a receipt-consuming financial command did not complete. Never "completed": an answer that proves completion is a result. */
export type FinancialCommandFailure =
  /** A documented definitive refusal (`409`, `404`, `400`): nothing to repeat. */
  | { readonly kind: 'definitiveRefusal'; readonly code?: string }
  /** The receipt was refused as expired (or is otherwise unusable) by Core. */
  | { readonly kind: 'receiptExpiredOrVoided'; readonly code: string }
  /** The consumer refused the receipt (`…_authorization_refused`); Core does not say whether it was invalid, expired or used. */
  | { readonly kind: 'receiptRefused'; readonly code: string }
  | { readonly kind: 'idempotencyConflict'; readonly code: string }
  /** Core states nothing was changed (`…_unavailable`, `auth_timeout`, `auth_unavailable`, `owner_authority_unavailable`, `429`). */
  | { readonly kind: 'unavailableNoMutation'; readonly code?: string }
  /** Core recorded the request but has no outcome yet (`…_unresolved`, `refund_payment_unavailable`). */
  | { readonly kind: 'recordedUnresolved'; readonly code: string }
  /** No answer, or an undocumented one: it may or may not have been applied. */
  | { readonly kind: 'outcomeUnknown' }
  | { readonly kind: 'sessionOrAuthorityRevoked'; readonly code?: string }
  | { readonly kind: 'contractUnavailable' };

interface ConsumerContract {
  readonly register: string;
  readonly route: string;
  /** Whether the route takes `Idempotency-Key` (a same-key repeat replays Core's stored outcome). */
  readonly idempotencyKey: boolean;
  readonly expired: readonly string[];
  readonly refused: readonly string[];
  readonly recorded: readonly string[];
  readonly noMutation: readonly string[];
  readonly evidence: string;
}

const IDEMPOTENCY_CONFLICTS = [
  'idempotency_key_conflict',
  'idempotency_key_reused',
  'idempotency_key_in_use',
];

/**
 * The documented answers of each receipt consumer at nawara-core `0044b20` (paths relative to `apps/`). Codes not listed here are
 * definitive when they are 4xx, and unknown when they are 5xx.
 */
export const RECEIPT_CONSUMERS = {
  refund: {
    register: 'BIL-24',
    route: 'POST /billing/admin/refund-cases/:id/authorizations',
    idempotencyKey: true,
    expired: ['refund_authorization_expired'],
    refused: ['refund_authorization_invalid', 'refund_authorization_conflict'],
    recorded: ['refund_authorization_unresolved', 'refund_payment_unavailable'],
    noMutation: ['auth_timeout', 'auth_unavailable'],
    evidence: 'billing-service/src/refunds/refund-case.controller.ts:115-120',
  },
  dispute_decision: {
    register: 'PAY-11',
    route: 'POST /payment/admin/disputes/:id/decision',
    idempotencyKey: true,
    expired: [],
    refused: ['dispute_decision_refused'],
    recorded: ['dispute_decision_unresolved'],
    noMutation: ['owner_authority_unavailable'],
    evidence: 'payment-service/src/disputes/disputes.controller.ts:117-120',
  },
  fraud_hold_place: {
    register: 'BIL-27',
    route: 'POST /billing/admin/fraud-holds',
    idempotencyKey: false,
    expired: [],
    refused: ['fraud_hold_authorization_refused'],
    recorded: ['fraud_hold_authorization_unresolved'],
    noMutation: ['fraud_evidence_unavailable', 'fraud_hold_unavailable'],
    evidence: 'billing-service/src/fraud-holds/fraud-hold.controller.ts:38-41',
  },
  fraud_hold_release: {
    register: 'BIL-27',
    route: 'POST /billing/admin/fraud-holds/:id/release',
    idempotencyKey: false,
    expired: [],
    refused: ['fraud_hold_authorization_refused'],
    recorded: ['fraud_hold_authorization_unresolved'],
    noMutation: ['fraud_hold_unavailable'],
    evidence: 'billing-service/src/fraud-holds/fraud-hold.controller.ts:54-56',
  },
  recovery_surplus_external: {
    register: 'BIL-30',
    route: 'POST /billing/admin/recovery-surpluses/:id/resolution',
    idempotencyKey: false,
    expired: [],
    refused: ['recovery_authorization_refused'],
    recorded: ['recovery_authorization_unresolved'],
    noMutation: ['surplus_evidence_unavailable', 'recovery_authorization_unavailable'],
    evidence: 'billing-service/src/recovery/recovery.controller.ts:178-181',
  },
  late_settlement_apply: {
    register: 'BIL-32',
    route: 'POST /billing/admin/late-settlements/:id/application',
    idempotencyKey: true,
    expired: [],
    refused: ['late_settlement_authorization_refused'],
    recorded: ['late_settlement_authorization_unresolved'],
    noMutation: [
      'late_settlement_evidence_unavailable',
      'late_settlement_authorization_unavailable',
    ],
    evidence: 'billing-service/src/late-settlements/late-settlement.controller.ts:136-139',
  },
  provider_fact_associate: {
    register: 'PAY-13',
    route: 'POST /payment/admin/provider-facts/:id/associations',
    idempotencyKey: true,
    expired: [],
    refused: ['provider_fact_association_refused'],
    recorded: ['provider_fact_association_unresolved'],
    noMutation: ['owner_authority_unavailable'],
    evidence: 'payment-service/src/reconciliation/reconciliation.controller.ts:87-90',
  },
  recovery_write_off: {
    register: 'BIL-34',
    route: 'POST /billing/admin/recovery-obligations/:id/write-off',
    idempotencyKey: false,
    expired: [],
    refused: ['recovery_authorization_refused'],
    recorded: ['recovery_authorization_unresolved'],
    noMutation: ['recovery_authorization_unavailable'],
    evidence: 'billing-service/src/reconciliation/reconciliation.controller.ts:103-104',
  },
} as const satisfies Readonly<Record<ReceiptOperation, ConsumerContract>>;

export function financialCommandFailureOf(
  operation: ReceiptOperation,
  error: AppError,
): FinancialCommandFailure {
  const consumer: ConsumerContract = RECEIPT_CONSUMERS[operation];
  const code = 'code' in error ? error.code : undefined;
  if (code !== undefined) {
    if (consumer.recorded.includes(code)) return { kind: 'recordedUnresolved', code };
    if (consumer.noMutation.includes(code)) return { kind: 'unavailableNoMutation', code };
    if (consumer.expired.includes(code)) return { kind: 'receiptExpiredOrVoided', code };
    if (consumer.refused.includes(code)) return { kind: 'receiptRefused', code };
    if (IDEMPOTENCY_CONFLICTS.includes(code)) return { kind: 'idempotencyConflict', code };
  }
  switch (error.kind) {
    case 'unauthenticated':
    case 'forbidden':
      return code === undefined
        ? { kind: 'sessionOrAuthorityRevoked' }
        : { kind: 'sessionOrAuthorityRevoked', code };
    case 'conflict':
    case 'not_found':
    case 'validation':
      return code === undefined
        ? { kind: 'definitiveRefusal' }
        : { kind: 'definitiveRefusal', code };
    case 'rate_limited':
      return { kind: 'unavailableNoMutation' };
    case 'unavailable':
      // Only a documented "nothing changed" 503 is safe; any other may have been recorded.
      return code === ADAPTER_UNAVAILABLE
        ? { kind: 'contractUnavailable' }
        : { kind: 'outcomeUnknown' };
    case 'network':
    case 'unexpected':
      return { kind: 'outcomeUnknown' };
  }
}

/**
 * What Core permits after a failure, as data for a later coordinator (F1-S5). Nothing here sends a request.
 * - `sameRequestSanctionedByCore`: Core documents "repeat the same request" (same body and receipt, same key where the route
 *   takes one) for this exact answer;
 * - `sameKeyReplay`: no answer arrived, and the route takes `Idempotency-Key`: an identical request under the same key replays
 *   Core's stored outcome;
 * - `blockedUntilCF74`: no answer arrived on a route WITHOUT `Idempotency-Key`: no automatic and no unverified manual
 *   resubmission until Core answers CF-74 (a read showing nothing applied does not authorize a repeat);
 * - `retryAllowed`: Core states nothing changed; the same request may be sent again while the receipt is unexpired;
 * - `notPermitted`: a definitive answer; only a new intent (new step-up, new receipt, new keys) can follow, if any.
 */
export type ResubmissionPolicy =
  | 'sameRequestSanctionedByCore'
  | 'sameKeyReplay'
  | 'blockedUntilCF74'
  | 'retryAllowed'
  | 'notPermitted';

export function resubmissionPolicy(
  operation: ReceiptOperation,
  failure: FinancialCommandFailure,
): ResubmissionPolicy {
  switch (failure.kind) {
    case 'recordedUnresolved':
      return 'sameRequestSanctionedByCore';
    case 'outcomeUnknown':
      return RECEIPT_CONSUMERS[operation].idempotencyKey ? 'sameKeyReplay' : 'blockedUntilCF74';
    case 'unavailableNoMutation':
      return 'retryAllowed';
    default:
      return 'notPermitted';
  }
}
