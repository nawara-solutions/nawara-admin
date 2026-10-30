import { Injectable } from '@angular/core';
import { IDEMPOTENCY_KEY_FORMAT } from '../actions/command-options';
import { StepUpFactor } from './purpose-registry';
import { ReceiptPurpose } from './purpose-registry';
import { ReceiptSecret } from './receipt-secret';
import {
  FACT_ASSOCIATION_TARGETS,
  FACT_KINDS,
  LATE_SETTLEMENT_REASONS,
  RECEIPT_AUDIENCE,
  RECEIPT_BINDING_FIELDS,
  ReceiptBinding,
} from './receipt.model';

/**
 * DEMO ONLY (F1-S4): what the simulated Auth service remembers about receipt-purpose step-ups and authorization receipts.
 * Root-provided and imported only by the demo receipt adapters, which are reached only through the demo bindings, so a
 * production build never contains it. A reload starts it afresh; each TestBed gets a fresh one.
 *
 * It follows nawara-core `0044b20` auth-service `src/receipts/` (issuance replay rules, 10-minute expiry, single consumption by
 * `consumeRef`) and `src/owner/step-up.service.ts` (factor-only, session- and purpose-bound, single-use step-ups).
 *
 * It never holds a secret value, nor a digest of one: a demo receipt is identified by its `ReceiptSecret` holder (a
 * `WeakMap` key), so nothing here can leak a secret. NOTHING here is a Core receipt.
 */

/** Core's step-up lifetime default, `STEP_UP_TTL_SEC` = 300 s (auth-service `src/config/app-config.ts:260`). */
export const DEMO_RECEIPT_STEP_UP_LIFETIME_MS = 300_000;
/** Core's receipt lifetime (auth-service `src/receipts/authorization-receipt.service.ts:14-15`). */
export const DEMO_RECEIPT_LIFETIME_MS = 10 * 60_000;

/** Core's receipt error codes this simulation answers with (auth-service `src/receipts/receipt-http.ts:11-20`). */
export type DemoReceiptRefusal =
  | 'receipt_binding_invalid'
  | 'idempotency_key_required'
  | 'idempotency_key_reused'
  | 'receipt_issued_response_lost'
  | 'receipt_already_consumed'
  | 'receipt_expired'
  | 'receipt_invalid'
  | 'consume_ref_conflict'
  | 'authority_revoked'
  | 'step_up_required';

type ReceiptStatus = 'issued' | 'consumed' | 'voided';

interface DemoStepUp {
  readonly purpose: ReceiptPurpose;
  readonly userId: string;
  readonly sessionId: string | undefined;
  readonly expiresAt: number;
  readonly factor: StepUpFactor;
}

interface DemoReceipt {
  readonly receiptId: string;
  readonly issuerUserId: string;
  readonly companyId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly binding: string;
  readonly audience: string;
  readonly expiresAt: number;
  status: ReceiptStatus;
  consumeRef: string | null;
}

export type DemoConsumption =
  | {
      readonly ok: true;
      readonly receiptId: string;
      readonly approvedBy: string;
      readonly replayed: boolean;
    }
  | { readonly ok: false; readonly refusal: DemoReceiptRefusal };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;
const REASON = /^[a-z][a-z0-9_]{0,63}$/;
const ID_FIELDS = new Set([
  'companyId',
  'refundCaseId',
  'paymentId',
  'disputeId',
  'holdId',
  'beneficiaryUserId',
  'productId',
  'surplusId',
  'organizationId',
  'lateSettlementId',
  'assistanceRequestId',
  'factId',
  'targetId',
  'obligationId',
  'captureFactId',
]);

/**
 * Core's binding validation (auth-service `src/receipts/receipt-binding.ts:175-330`): the exact field set, canonical UUIDs,
 * positive safe-integer amounts, ISO 4217 currencies, bounded reason codes and the operation's closed values and audience.
 */
export function bindingProblem(binding: unknown): 'receipt_binding_invalid' | null {
  if (typeof binding !== 'object' || binding === null) return 'receipt_binding_invalid';
  const value = binding as Record<string, unknown>;
  const operation = value['operation'];
  if (typeof operation !== 'string' || !Object.hasOwn(RECEIPT_BINDING_FIELDS, operation))
    return 'receipt_binding_invalid';
  const fields = RECEIPT_BINDING_FIELDS[operation as keyof typeof RECEIPT_BINDING_FIELDS];
  const allowed = new Set<string>([...fields.required, ...fields.optional]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return 'receipt_binding_invalid';
  if (fields.required.some((key) => !Object.hasOwn(value, key))) return 'receipt_binding_invalid';
  if (value['audience'] !== RECEIPT_AUDIENCE[operation as keyof typeof RECEIPT_AUDIENCE])
    return 'receipt_binding_invalid';
  for (const [key, field] of Object.entries(value)) {
    if (ID_FIELDS.has(key) && (typeof field !== 'string' || !UUID.test(field)))
      return 'receipt_binding_invalid';
    if (
      key === 'amount' &&
      (typeof field !== 'number' || !Number.isSafeInteger(field) || field <= 0)
    )
      return 'receipt_binding_invalid';
    if (key === 'currency' && (typeof field !== 'string' || !CURRENCY.test(field)))
      return 'receipt_binding_invalid';
    if (key === 'reason' && (typeof field !== 'string' || !REASON.test(field)))
      return 'receipt_binding_invalid';
    if (key === 'legalOverride' && typeof field !== 'boolean') return 'receipt_binding_invalid';
  }
  const closed: Readonly<Record<string, readonly unknown[]>> = {
    decision: ['contest', 'accept'],
    reasonCode: LATE_SETTLEMENT_REASONS,
    kind: FACT_KINDS,
    targetType: FACT_ASSOCIATION_TARGETS,
  };
  for (const [key, values] of Object.entries(closed))
    if (Object.hasOwn(value, key) && !values.includes(value[key])) return 'receipt_binding_invalid';
  return null;
}

/** The binding's canonical form (sorted keys; `legalOverride` false unless given), the only thing the request hash covers. */
export function canonicalBinding(binding: ReceiptBinding): string {
  const value: Record<string, unknown> = { ...binding };
  if (binding.operation === 'refund' && value['legalOverride'] === undefined)
    value['legalOverride'] = false;
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
}

@Injectable({ providedIn: 'root' })
export class DemoReceiptState {
  private readonly stepUps = new Map<string, DemoStepUp>();
  private readonly receipts = new Map<string, DemoReceipt>();
  private readonly byKey = new Map<string, string>();
  private readonly byHolder = new WeakMap<ReceiptSecret, string>();
  private readonly consumeRefs = new Map<string, string>();

  /** Records a receipt-purpose step-up (after the factor was accepted). */
  issueStepUp(step: DemoStepUp): string {
    const token = crypto.randomUUID();
    this.stepUps.set(token, step);
    return token;
  }

  /**
   * Consumes a step-up for exactly `purpose`, user and session, live and proved by an allowed factor; a refused proof is NOT
   * consumed (Core consumes it inside the issuance transaction, which a refusal rolls back).
   */
  takeStepUp(
    token: string,
    purpose: ReceiptPurpose,
    userId: string,
    sessionId: string | undefined,
    now: number,
  ): boolean {
    const step = this.stepUps.get(token);
    const valid =
      step !== undefined &&
      step.purpose === purpose &&
      step.userId === userId &&
      step.sessionId === sessionId &&
      step.expiresAt > now &&
      step.factor !== 'secret_key';
    if (valid) this.stepUps.delete(token);
    return valid;
  }

  validKey(key: string): boolean {
    return IDEMPOTENCY_KEY_FORMAT.test(key);
  }

  /**
   * Core's replay rules for a key already used by this owner (`authorization-receipt.service.ts:147-163`): a different request
   * is `idempotency_key_reused`; a consumed receipt `receipt_already_consumed`; a voided one `receipt_issued_response_lost`; an
   * expired one `receipt_expired`; a live `issued` one is VOIDED now and answers `receipt_issued_response_lost`. Never a secret.
   * `null`: the key is new.
   */
  replay(userId: string, key: string, requestHash: string, now: number): DemoReceiptRefusal | null {
    const id = this.byKey.get(`${userId}\u0000${key}`);
    const receipt = id === undefined ? undefined : this.receipts.get(id);
    if (receipt === undefined) return null;
    if (receipt.requestHash !== requestHash) return 'idempotency_key_reused';
    if (receipt.status === 'consumed') return 'receipt_already_consumed';
    if (receipt.status === 'voided') return 'receipt_issued_response_lost';
    if (receipt.expiresAt <= now) return 'receipt_expired';
    receipt.status = 'voided';
    return 'receipt_issued_response_lost';
  }

  /** Records a new issued receipt for the holder Core would return. */
  record(
    holder: ReceiptSecret,
    issue: { userId: string; companyId: string; key: string; binding: ReceiptBinding; now: number },
  ): { receiptId: string; expiresAt: number } {
    const receiptId = crypto.randomUUID();
    const canonical = canonicalBinding(issue.binding);
    const expiresAt = issue.now + DEMO_RECEIPT_LIFETIME_MS;
    this.receipts.set(receiptId, {
      receiptId,
      issuerUserId: issue.userId,
      companyId: issue.companyId,
      idempotencyKey: issue.key,
      requestHash: canonical,
      binding: canonical,
      audience: issue.binding.audience,
      expiresAt,
      status: 'issued',
      consumeRef: null,
    });
    this.byKey.set(`${issue.userId}\u0000${issue.key}`, receiptId);
    this.byHolder.set(holder, receiptId);
    return { receiptId, expiresAt };
  }

  /**
   * Simulated AUTH-02 for later consumer mocks (none in F1-S4): consumes the holder's receipt once, for exactly its binding and
   * audience, while unexpired and while its issuer is still the Company's active owner. The SAME `consumeRef` answers the same
   * consumption again (`replayed`); another reference is `receipt_already_consumed`, and a reference already used by another
   * receipt is `consume_ref_conflict`.
   */
  consume(
    holder: ReceiptSecret,
    binding: ReceiptBinding,
    audience: string,
    consumeRef: string,
    issuerStillOwner: boolean,
    now: number,
  ): DemoConsumption {
    const id = this.byHolder.get(holder);
    const receipt = id === undefined ? undefined : this.receipts.get(id);
    if (!holder.held || receipt === undefined) return { ok: false, refusal: 'receipt_invalid' };
    if (
      receipt.binding !== canonicalBinding(binding) ||
      receipt.audience !== audience ||
      receipt.status === 'voided'
    )
      return { ok: false, refusal: 'receipt_invalid' };
    if (receipt.status === 'consumed')
      return receipt.consumeRef === consumeRef
        ? {
            ok: true,
            receiptId: receipt.receiptId,
            approvedBy: receipt.issuerUserId,
            replayed: true,
          }
        : { ok: false, refusal: 'receipt_already_consumed' };
    const owner = this.consumeRefs.get(consumeRef);
    if (owner !== undefined && owner !== receipt.receiptId)
      return { ok: false, refusal: 'consume_ref_conflict' };
    if (receipt.expiresAt <= now) return { ok: false, refusal: 'receipt_expired' };
    if (!issuerStillOwner) return { ok: false, refusal: 'authority_revoked' };
    receipt.status = 'consumed';
    receipt.consumeRef = consumeRef;
    this.consumeRefs.set(consumeRef, receipt.receiptId);
    return {
      ok: true,
      receiptId: receipt.receiptId,
      approvedBy: receipt.issuerUserId,
      replayed: false,
    };
  }

  /** For specs and later mocks: a receipt's simulated status, by id. */
  statusOf(receiptId: string): ReceiptStatus | undefined {
    return this.receipts.get(receiptId)?.status;
  }
}
