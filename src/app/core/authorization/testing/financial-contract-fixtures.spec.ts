import { Observable, Subject } from 'rxjs';
import { OperatorActor, OwnerActor } from '../../auth/actor';
import { FactorProof } from '../../auth/auth.model';
import { companyId, platformId } from '../../context/scope.model';
import { AppError } from '../../errors/app-error';
import {
  FinancialContext,
  attemptableFinancialOperations,
  financialDecision,
  isFinancialOperation,
} from '../financial-authority';
import {
  FinancialAuthorizationRun,
  FinancialRunContext,
  ReceiptAuthorizationState,
  ReconciliationAnswer,
} from '../financial-authorization-run';
import { FINANCIAL_OPERATIONS, FinancialOperation } from '../financial-operation';
import {
  ASSISTANCE_STEP_UP_PURPOSE,
  CorePurpose,
  EXCLUDED_CORE_PURPOSES,
  PURPOSE_REGISTRY_BASELINE,
  PURPOSE_RULES,
  RECEIPT_OPERATION_PURPOSE,
  ReceiptOperation,
  ReceiptPurpose,
  allowsFactor,
  isCorePurpose,
} from '../purpose-registry';
import {
  RECEIPT_CONSUMERS,
  ReceiptIssueFailure,
  ResubmissionPolicy,
  financialCommandFailureOf,
  receiptIssueFailureOf,
  resubmissionPolicy,
} from '../receipt-failure';
import {
  AuthorizationReceiptGateway,
  UnavailableAuthorizationReceiptGateway,
} from '../receipt.gateway';
import {
  IssuedReceipt,
  RECEIPT_AUDIENCE,
  RECEIPT_BINDING_FIELDS,
  RECOVERY_RESTRICTION_REVOKE_REASONS,
  RECOVERY_RESTRICTION_SUSPEND_REASONS,
  ReceiptBinding,
  ReceiptBindingFor,
  ReceiptIssueRequest,
} from '../receipt.model';
import { ReceiptSecret } from '../receipt-secret';
import { ReceiptStepUpGateway, UnavailableReceiptStepUpGateway } from '../receipt-step-up.gateway';
import { ReceiptStepUpProof, receiptStepUpProof } from '../step-up-proof';
import { UncertainFinancialTargets } from '../uncertain-financial-targets';
import consumersFixture from './fixtures/receipt-consumers.json';
import issuanceFixture from './fixtures/receipt-issuance.json';
import stepUpFixture from './fixtures/step-up-transports.json';

/**
 * F1-S7: Admin's financial authorization tables and coordinator, checked against Core's recorded contracts
 * (docs/design/f1-s7-contract-fixtures.md). The fixtures hold Core facts only, each citing nawara-core `0044b20` unless an
 * entry carries its own `revision` (`8d89bed`: the Core V2 S0-C14 additions of WP-2.1, and the purpose list); this spec
 * never manufactures a Core response beyond a status and code Core documents, sends nothing and calls no HTTP adapter (none
 * exists).
 */

const REVISION = '0044b20';
/** WP-2.1: the purpose list, and the S0-C14 entries, verified at this later revision only. */
const ADDITIONS_REVISION = '8d89bed';
const S0_C14_OPERATIONS: readonly string[] = [
  'recovery_restriction_suspend',
  'recovery_restriction_revoke',
];
const S0_C14_PURPOSES: readonly string[] = [
  'billing.recovery_restriction.suspend',
  'billing.recovery_restriction.revoke',
];
const OPERATIONS = Object.keys(RECEIPT_OPERATION_PURPOSE) as ReceiptOperation[];

type ConsumerFixture = (typeof consumersFixture.consumers)[number];
interface CoreAnswer {
  readonly status: number;
  readonly code: string | null;
}

const consumerFixture = (operation: ReceiptOperation): ConsumerFixture => {
  const found = consumersFixture.consumers.find((c) => c.operation === operation);
  if (found === undefined) throw new Error(`no consumer fixture for ${operation}`);
  return found;
};

/**
 * TEST ONLY: how a future HTTP adapter must turn Core's status and `code` into an `AppError` (HTTP adapter checklist,
 * docs/design/f1-s7-contract-fixtures.md §5). Core's `message` is never read. Not an adapter: nothing here makes a request.
 */
function appErrorOf(answer: CoreAnswer | 'noAnswer'): AppError {
  if (answer === 'noAnswer') return { kind: 'network', status: 0 };
  const code = answer.code === null ? {} : { code: answer.code };
  const status = answer.status;
  switch (status) {
    case 400:
    case 422:
      return { kind: 'validation', messages: [], status, ...code };
    case 401:
      return { kind: 'unauthenticated', status, ...code };
    case 403:
      return { kind: 'forbidden', status, ...code };
    case 404:
      return { kind: 'not_found', status, ...code };
    case 409:
      return { kind: 'conflict', status, ...code };
    case 429:
      return { kind: 'rate_limited', status };
    case 503:
      return { kind: 'unavailable', status, ...code };
    default:
      return { kind: 'unexpected', status };
  }
}

// ── Fakes the test answers one at a time (no Core, no HTTP) ──────────────────────────────────────────────────────────

class Answers<T> {
  readonly calls: unknown[] = [];
  private readonly pending: Subject<T>[] = [];
  take(call: unknown): Observable<T> {
    this.calls.push(call);
    const answer = new Subject<T>();
    this.pending.push(answer);
    return answer;
  }
  ok(value: T): void {
    const answer = this.pending.shift();
    answer?.next(value);
    answer?.complete();
  }
  fail(error: AppError): void {
    this.pending.shift()?.error(error);
  }
}

class FakeStepUp extends ReceiptStepUpGateway {
  readonly answers = new Answers<ReceiptStepUpProof>();
  obtain<P extends ReceiptPurpose>(
    purpose: P,
    proof: FactorProof,
  ): Observable<ReceiptStepUpProof<P>> {
    // The fake answers whatever the test gives it; the purpose is checked through `calls`.
    return this.answers.take({ purpose, proof }) as Observable<ReceiptStepUpProof<P>>;
  }
}

class FakeReceipts extends AuthorizationReceiptGateway {
  readonly answers = new Answers<IssuedReceipt>();
  readonly requests: ReceiptIssueRequest[] = [];
  issue<O extends ReceiptOperation>(request: ReceiptIssueRequest<O>): Observable<IssuedReceipt<O>> {
    this.requests.push(request);
    return this.answers.take(request) as Observable<IssuedReceipt<O>>;
  }
}

interface Sent {
  readonly receipt: IssuedReceipt;
  readonly idempotencyKey: string;
}

const NOW = Date.parse('2026-11-01T09:00:00Z');
const LIFETIME_MS = issuanceFixture.lifetimeMs.value;
const TOTP: FactorProof = { method: 'totp', code: '123456' };
const SECRET = 'S'.repeat(43);
const OWNER_CONTEXT: FinancialRunContext = {
  actorId: 'owner-1',
  sessionKey: 'session-1',
  scope: 'company:company-a',
};
const KEY_PATTERN = new RegExp(issuanceFixture.headers['Idempotency-Key'].pattern);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** One binding per operation, shaped exactly by Core's field list (values are placeholders, never Core data). */
const BINDINGS: { readonly [O in ReceiptOperation]: ReceiptBindingFor<O> } = {
  refund: {
    operation: 'refund',
    audience: 'payment-service',
    companyId: uuid(1),
    refundCaseId: uuid(2),
    paymentId: uuid(3),
    amount: 1200,
    currency: 'TND',
    reason: 'duplicate_charge',
  },
  dispute_decision: {
    operation: 'dispute_decision',
    audience: 'payment-service',
    companyId: uuid(1),
    disputeId: uuid(4),
    paymentId: uuid(3),
    decision: 'contest',
  },
  fraud_hold_place: {
    operation: 'fraud_hold_place',
    audience: 'billing-service',
    companyId: uuid(1),
    holdId: uuid(5),
    beneficiaryUserId: uuid(6),
    productId: uuid(7),
    reason: 'chargeback_abuse',
  },
  fraud_hold_release: {
    operation: 'fraud_hold_release',
    audience: 'billing-service',
    companyId: uuid(1),
    holdId: uuid(5),
    beneficiaryUserId: uuid(6),
    productId: uuid(7),
  },
  recovery_surplus_external: {
    operation: 'recovery_surplus_external',
    audience: 'billing-service',
    companyId: uuid(1),
    surplusId: uuid(8),
    organizationId: uuid(9),
    amount: 300,
    currency: 'TND',
  },
  late_settlement_apply: {
    operation: 'late_settlement_apply',
    audience: 'billing-service',
    companyId: uuid(1),
    lateSettlementId: uuid(10),
    assistanceRequestId: uuid(11),
    beneficiaryUserId: uuid(6),
    reasonCode: 'cash_not_returned_attested',
  },
  provider_fact_associate: {
    operation: 'provider_fact_associate',
    audience: 'payment-service',
    companyId: uuid(1),
    factId: uuid(12),
    kind: 'capture',
    amount: 1200,
    currency: 'TND',
    targetType: 'payment',
    targetId: uuid(3),
  },
  recovery_write_off: {
    operation: 'recovery_write_off',
    audience: 'billing-service',
    companyId: uuid(1),
    obligationId: uuid(13),
    organizationId: uuid(9),
    amount: 900,
    currency: 'TND',
  },
  recovery_restriction_suspend: {
    operation: 'recovery_restriction_suspend',
    audience: 'billing-service',
    companyId: uuid(1),
    suspensionId: uuid(14),
    obligationId: uuid(13),
    organizationId: uuid(9),
    disputeId: uuid(15),
    refundCaseId: uuid(16),
    reasonCode: 'refund_chargeback_overlap',
  },
  recovery_restriction_revoke: {
    operation: 'recovery_restriction_revoke',
    audience: 'billing-service',
    companyId: uuid(1),
    suspensionId: uuid(14),
    obligationId: uuid(13),
    organizationId: uuid(9),
    disputeId: uuid(15),
    refundCaseId: uuid(16),
    reasonCode: 'owner_reinstated_restriction',
  },
};

interface SetUpOptions {
  readonly uncertain?: UncertainFinancialTargets;
  readonly deterministicKeys?: boolean;
  readonly stepUp?: ReceiptStepUpGateway;
  readonly receipts?: AuthorizationReceiptGateway;
}

function setUp(operation: ReceiptOperation, options: SetUpOptions = {}) {
  const env = {
    context: OWNER_CONTEXT as FinancialRunContext | null,
    now: NOW,
    stepUp: new FakeStepUp(),
    receipts: new FakeReceipts(),
    consumer: new Answers<string>(),
    reads: new Answers<ReconciliationAnswer<string>>(),
    uncertain: options.uncertain ?? new UncertainFinancialTargets(),
    keys: 0,
  };
  const run = new FinancialAuthorizationRun<ReceiptOperation, string>({
    operation,
    context: () => env.context,
    stepUp: options.stepUp ?? env.stepUp,
    receipts: options.receipts ?? env.receipts,
    submit: (receipt, request) =>
      env.consumer.take({ receipt, idempotencyKey: request.idempotencyKey }),
    reconcile: (binding) => env.reads.take(binding),
    uncertain: env.uncertain,
    now: () => env.now,
    ...(options.deterministicKeys === false
      ? {}
      : { newKey: () => `key-${String(++env.keys).padStart(4, '0')}` }),
  });
  return { env, run, binding: structuredClone(BINDINGS[operation]) as ReceiptBinding };
}

type Harness = ReturnType<typeof setUp>;

const proofOf = (purpose: ReceiptPurpose) =>
  receiptStepUpProof(purpose, { token: 'step-up-token-1', expiresAt: '2026-11-01T09:05:00Z' });

/** A receipt shaped as Core issues it: a Core-format secret and `expiresAt` = issue time + Core's lifetime. */
const issuedFor = (binding: ReceiptBinding): IssuedReceipt => ({
  receiptId: uuid(90),
  secret: ReceiptSecret.fromIssued(SECRET),
  expiresAt: new Date(NOW + LIFETIME_MS).toISOString(),
  binding,
  simulated: true,
});

function toIssued(operation: ReceiptOperation, options: SetUpOptions = {}) {
  const t = setUp(operation, options);
  expect(t.run.open(t.binding)).toBe(true);
  t.run.verify(TOTP);
  t.env.stepUp.answers.ok(proofOf(RECEIPT_OPERATION_PURPOSE[operation]));
  const receipt = issuedFor(t.binding);
  t.env.receipts.answers.ok(receipt);
  return { ...t, receipt };
}

const sent = (t: Harness, n: number) => t.env.consumer.calls[n] as Sent;

// ── 1. The fixtures themselves ──────────────────────────────────────────────────────────────────────────────────────

describe('F1-S7 fixtures are Core evidence at 0044b20 (S0-C14 additions at 8d89bed)', () => {
  it('pins every fixture to the same Core revisions as Admin’s registries', () => {
    for (const fixture of [stepUpFixture, issuanceFixture, consumersFixture])
      expect(fixture.core.repository).toBe('nawara-solutions/nawara-core');
    expect(issuanceFixture.core.revision).toBe(REVISION);
    expect(consumersFixture.core.revision).toBe(REVISION);
    // The purpose list was re-verified whole at 8d89bed; the earlier purposes' routes stay at 0044b20.
    expect(stepUpFixture.core.revision).toBe(ADDITIONS_REVISION);
    expect(stepUpFixture.core.routesRevision).toBe(REVISION);
    expect(PURPOSE_REGISTRY_BASELINE.revision).toBe(ADDITIONS_REVISION);
    expect(PURPOSE_REGISTRY_BASELINE.routesRevision).toBe(REVISION);
    expect(stepUpFixture.core.source.endsWith(PURPOSE_REGISTRY_BASELINE.source)).toBe(true);
  });

  it('marks exactly the S0-C14 entries as verified at 8d89bed, and no other', () => {
    const later = <T extends object>(entries: readonly T[], name: (entry: T) => string) =>
      entries
        .filter((entry) => 'revision' in entry && entry.revision === ADDITIONS_REVISION)
        .map(name);
    expect(later(stepUpFixture.purposes, (p) => p.purpose)).toEqual(S0_C14_PURPOSES);
    expect(later(consumersFixture.consumers, (c) => c.operation)).toEqual(S0_C14_OPERATIONS);
    expect(
      later(
        Object.entries(issuanceFixture.operations).map(([operation, entry]) => ({
          operation,
          ...entry,
        })),
        (o) => o.operation,
      ),
    ).toEqual(S0_C14_OPERATIONS);
    for (const entry of [
      ...stepUpFixture.purposes,
      ...consumersFixture.consumers,
      ...Object.values(issuanceFixture.operations),
    ])
      if ('revision' in entry) expect(entry.revision).toBe(ADDITIONS_REVISION);
  });

  it('carries each S0-C14 receipt’s closed reason code, exactly as Core declares it', () => {
    expect(issuanceFixture.operations.recovery_restriction_suspend.reasonCodes).toEqual([
      ...RECOVERY_RESTRICTION_SUSPEND_REASONS,
    ]);
    expect(issuanceFixture.operations.recovery_restriction_revoke.reasonCodes).toEqual([
      ...RECOVERY_RESTRICTION_REVOKE_REASONS,
    ]);
  });

  it('cites a Core source line for every fact', () => {
    const sources: string[] = [];
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(collect);
      else if (typeof value === 'object' && value !== null) {
        for (const [key, inner] of Object.entries(value)) {
          if (
            (key === 'source' || key.endsWith('Source') || key === 'basis') &&
            typeof inner === 'string'
          )
            sources.push(inner);
          else collect(inner);
        }
      }
    };
    collect([stepUpFixture, issuanceFixture, consumersFixture]);
    expect(sources.length).toBeGreaterThan(80);
    for (const source of sources) expect(source).toMatch(/^apps\/[a-z-]+\/src\/.+:\d+/);
    for (const purpose of stepUpFixture.purposes) expect(purpose.source).toMatch(/:\d+$/);
    for (const consumer of consumersFixture.consumers) {
      expect(consumer.source).toMatch(/:\d+-\d+$/);
      for (const answer of consumer.answers)
        if (answer.coreSays !== null && 'basis' in answer) expect(answer.basis).toMatch(/:\d+/);
    }
  });

  it('accounts for all 34 Core purposes: 33 represented, 1 excluded with its reason', () => {
    expect(stepUpFixture.purposes.length + stepUpFixture.excluded.length).toBe(
      stepUpFixture.core.purposeCount,
    );
    expect(stepUpFixture.core.purposeCount).toBe(PURPOSE_REGISTRY_BASELINE.corePurposeCount);
    expect(new Set(stepUpFixture.purposes.map((p) => p.purpose)).size).toBe(33);
  });
});

// ── 2. Step-up purposes and transports ──────────────────────────────────────────────────────────────────────────────

describe('F1-S7 step-up purposes and their transports (T1, T2, T3)', () => {
  it('registers exactly Core’s purposes, no more and no fewer', () => {
    expect(Object.keys(PURPOSE_RULES).sort()).toEqual(
      stepUpFixture.purposes.map((p) => p.purpose).sort(),
    );
    expect(Object.keys(EXCLUDED_CORE_PURPOSES)).toEqual(
      stepUpFixture.excluded.map((p) => p.purpose),
    );
    for (const excluded of stepUpFixture.excluded)
      expect(isCorePurpose(excluded.purpose)).toBe(false);
  });

  for (const fixture of stepUpFixture.purposes) {
    it(`${fixture.purpose}: ${fixture.transport}, ${fixture.delivery} to ${fixture.recipient}`, () => {
      if (!isCorePurpose(fixture.purpose)) throw new Error(`unregistered ${fixture.purpose}`);
      const rule = PURPOSE_RULES[fixture.purpose];
      expect(rule.transport).toBe(fixture.transport);
      expect(rule.delivery).toBe(fixture.delivery);
      expect(rule.recipient).toBe(fixture.recipient);
      expect([...rule.factors]).toEqual(fixture.factors);
      for (const factor of ['totp', 'webauthn', 'secret_key'] as const)
        expect(allowsFactor(fixture.purpose, factor)).toBe(fixture.factors.includes(factor));
    });
  }

  const byTransport = (transport: string) =>
    stepUpFixture.purposes.filter((p) => p.transport === transport);

  it('T1 Auth-local: every proof travels in Core’s step-up header to Auth’s own route', () => {
    expect(stepUpFixture.headerName.value).toBe('x-step-up-token');
    const authLocal = byTransport('authLocal');
    expect(authLocal).toHaveLength(15);
    for (const p of authLocal) {
      expect(p.delivery).toBe('header');
      expect(p.recipient).toBe('auth');
    }
  });

  it('T2 service-verified: header to the receiving service, except Audit legal holds (body field)', () => {
    const serviceVerified = byTransport('serviceVerified');
    expect(serviceVerified).toHaveLength(8);
    for (const p of serviceVerified) expect(p.recipient).not.toBe('auth');
    expect(serviceVerified.filter((p) => p.delivery === 'body').map((p) => p.purpose)).toEqual([
      'audit.legal_hold.place',
      'audit.legal_hold.release',
    ]);
    expect(stepUpFixture.bodyField.value).toBe('stepUpToken');
    expect(stepUpFixture.serviceVerify.route).toBe('/auth/step-up/verify');
    expect(Object.values(ASSISTANCE_STEP_UP_PURPOSE).map((p) => PURPOSE_RULES[p])).toEqual([
      expect.objectContaining({
        transport: 'serviceVerified',
        delivery: 'header',
        recipient: 'billing',
      }),
      expect.objectContaining({
        transport: 'serviceVerified',
        delivery: 'header',
        recipient: 'billing',
      }),
    ]);
  });

  it('T3 receipt: each receipt purpose is presented only to receipt issuance, in the body, factor only', () => {
    const receipt = byTransport('receipt');
    expect(receipt.map((p) => p.purpose).sort()).toEqual(
      Object.values(RECEIPT_OPERATION_PURPOSE).sort(),
    );
    for (const p of receipt) {
      expect(p.delivery).toBe('body');
      expect(p.recipient).toBe('auth');
      expect(allowsFactor(p.purpose as CorePurpose, 'secret_key')).toBe(false);
    }
    // Core's generic verify refuses these purposes: no service-verified path exists for them.
    expect(stepUpFixture.serviceVerify.refusesWithoutConsuming).toContain('receipt purposes');
    expect(issuanceFixture.body.fields).toContain(stepUpFixture.bodyField.value);
  });
});

// ── 3. T3 receipt issuance ─────────────────────────────────────────────────────────────────────────────────────────

/** Admin's reading of each documented issuance answer (receipt-failure.ts). */
const ISSUANCE_READING: Readonly<Record<string, ReceiptIssueFailure['kind']>> = {
  '400 idempotency_key_required': 'requestInvalid',
  '400 receipt_binding_invalid': 'bindingInvalid',
  '400 validation_error': 'requestInvalid',
  '400 step_up_unsupported': 'requestInvalid',
  '401 -': 'sessionOrAuthorityRevoked',
  '403 forbidden': 'sessionOrAuthorityRevoked',
  '403 step_up_required': 'stepUpRefused',
  '403 authority_revoked': 'sessionOrAuthorityRevoked',
  '409 receipt_issued_response_lost': 'voided',
  '409 receipt_already_consumed': 'alreadyConsumed',
  '409 receipt_expired': 'expired',
  '409 idempotency_key_reused': 'idempotencyConflict',
  '503 receipt_unavailable': 'unavailableNoMutation',
  '503 receipt_outcome_unknown': 'outcomeUnknown',
};
const answerKey = (a: CoreAnswer) => `${a.status} ${a.code ?? '-'}`;

/** Where the coordinator is after each issuance reading. */
const ISSUANCE_STEP: Readonly<
  Record<ReceiptIssueFailure['kind'], ReceiptAuthorizationState['step']>
> = {
  stepUpRefused: 'awaitingFactor',
  unavailableNoMutation: 'awaitingFactor',
  outcomeUnknown: 'issueUnknown',
  bindingInvalid: 'ended',
  requestInvalid: 'ended',
  voided: 'ended',
  expired: 'ended',
  alreadyConsumed: 'ended',
  idempotencyConflict: 'ended',
  sessionOrAuthorityRevoked: 'ended',
  contractUnavailable: 'ended',
};

describe('F1-S7 T3 receipt issuance (AUTH-01)', () => {
  it('binds each operation to Core’s purpose, audience and exact field list', () => {
    expect(Object.keys(issuanceFixture.operations).sort()).toEqual([...OPERATIONS].sort());
    for (const operation of OPERATIONS) {
      const core = issuanceFixture.operations[operation];
      expect(RECEIPT_OPERATION_PURPOSE[operation]).toBe(core.purpose);
      expect(RECEIPT_AUDIENCE[operation]).toBe(core.audience);
      const fields = RECEIPT_BINDING_FIELDS[operation];
      expect([...fields.required, ...fields.optional].sort()).toEqual([...core.fields].sort());
      expect([...fields.optional].sort()).toEqual([...core.optional].sort());
      expect(Object.keys(BINDINGS[operation]).sort()).toEqual([...fields.required].sort());
    }
  });

  it('holds a secret only in Core’s format, and never prints it', () => {
    expect(issuanceFixture.secret.pattern).toBe(consumersFixture.secretPattern.value);
    const held = ReceiptSecret.fromIssued('aZ09_-'.repeat(7) + 'x');
    expect(held.held).toBe(true);
    expect(String(held)).not.toContain('aZ09');
    expect(JSON.stringify({ held })).not.toContain('aZ09');
    for (const malformed of ['a'.repeat(42), 'a'.repeat(44), '+'.repeat(43), '='.repeat(43)])
      expect(() => ReceiptSecret.fromIssued(malformed)).toThrow(TypeError);
  });

  it('reads every documented issuance answer, and only those', () => {
    expect(issuanceFixture.answers.map(answerKey).sort()).toEqual(
      Object.keys(ISSUANCE_READING).sort(),
    );
    for (const answer of issuanceFixture.answers) {
      const kind = receiptIssueFailureOf(appErrorOf(answer)).kind;
      expect([answerKey(answer), kind]).toEqual([
        answerKey(answer),
        ISSUANCE_READING[answerKey(answer)],
      ]);
      if (answer.coreSays === 'nothing changed') expect(kind).toBe('unavailableNoMutation');
      if (answer.coreSays === 'replay the same key') expect(kind).toBe('outcomeUnknown');
    }
  });

  it('never treats a service-only receipt code or a lost answer as a usable issuance', () => {
    for (const code of issuanceFixture.serviceOnly.codes)
      expect(receiptIssueFailureOf(appErrorOf({ status: 409, code })).kind).toBe('outcomeUnknown');
    expect(receiptIssueFailureOf(appErrorOf('noAnswer')).kind).toBe('outcomeUnknown');
  });

  for (const answer of issuanceFixture.answers) {
    it(`drives the coordinator on ${answerKey(answer)} without a secret or a consumer call`, () => {
      const t = setUp('late_settlement_apply');
      t.run.open(t.binding);
      t.run.verify(TOTP);
      t.env.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
      t.env.receipts.answers.fail(appErrorOf(answer));
      const step = ISSUANCE_STEP[receiptIssueFailureOf(appErrorOf(answer)).kind];
      expect(t.run.authorization().step).toBe(step);
      expect(t.run.outcome()).toEqual({ status: 'notSubmitted', lastFailure: null });
      t.run.submit();
      expect(t.env.consumer.calls).toHaveLength(0);
    });
  }

  it('replays a lost issuance answer once with the SAME key and step-up, never a new one', () => {
    const t = setUp('refund');
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('refund.authorize'));
    t.env.receipts.answers.fail(appErrorOf({ status: 503, code: 'receipt_outcome_unknown' }));
    t.run.replayIssue();
    const [first, replay] = t.env.receipts.requests;
    expect(replay).toEqual(first);
    t.env.receipts.answers.fail(appErrorOf('noAnswer'));
    t.run.replayIssue();
    expect(t.env.receipts.requests).toHaveLength(2);
    expect(t.run.authorization()).toEqual(
      expect.objectContaining({ step: 'ended', reason: 'issueRefused' }),
    );
  });

  it('keeps the issuance key after "nothing changed" (Core’s replay hash covers the binding, not the step-up)', () => {
    expect(issuanceFixture.replayHashCoversStepUp.value).toBe(false);
    const t = setUp('dispute_decision');
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('payment.dispute.decide'));
    t.env.receipts.answers.fail(appErrorOf({ status: 503, code: 'receipt_unavailable' }));
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('payment.dispute.decide'));
    const [first, second] = t.env.receipts.requests;
    expect(second?.idempotencyKey).toBe(first?.idempotencyKey);
  });
});

// ── 4. Receipt consumers ───────────────────────────────────────────────────────────────────────────────────────────

/** What Core permits after each documented consumer answer, from Core's own words. */
function expectedPolicy(answer: ConsumerFixture['answers'][number]): ResubmissionPolicy {
  if (answer.status < 500) return 'notPermitted';
  if (answer.coreSays === 'nothing changed') return 'retryAllowed';
  return 'sameRequestSanctionedByCore';
}

describe('F1-S7 receipt consumers (one per receipt operation)', () => {
  it('covers exactly the ten receipt operations', () => {
    expect(consumersFixture.consumers.map((c) => c.operation).sort()).toEqual(
      [...OPERATIONS].sort(),
    );
  });

  for (const operation of OPERATIONS) {
    describe(operation, () => {
      const core = consumerFixture(operation);
      const admin = RECEIPT_CONSUMERS[operation];

      it('matches Core’s route, register, key requirement and receipt field', () => {
        expect(admin.route).toBe(`${core.method} ${core.route}`);
        expect(admin.register).toBe(core.register);
        expect(admin.idempotencyKey).toBe(core.idempotencyKey);
        expect(core.body).toContain(core.receiptField);
        expect(core.receiptField).toBe('receiptSecret');
        expect(core.production).not.toBe('mounted');
      });

      it('lists only codes Core documents, each with the right status', () => {
        const statusOf = (code: string) => core.answers.find((a) => a.code === code)?.status;
        for (const code of [...admin.expired, ...admin.refused])
          expect([code, statusOf(code)]).toEqual([code, 409]);
        for (const code of [...admin.recorded, ...admin.noMutation])
          expect([code, statusOf(code)]).toEqual([code, 503]);
        for (const code of admin.noMutation)
          expect([code, core.answers.find((a) => a.code === code)?.coreSays]).toEqual([
            code,
            'nothing changed',
          ]);
      });

      it('classifies every documented 503 (none is left to guesswork)', () => {
        for (const answer of core.answers.filter((a) => a.status === 503)) {
          expect(answer.coreSays).not.toBeNull();
          expect([...admin.recorded, ...admin.noMutation]).toContain(answer.code);
        }
      });

      for (const answer of core.answers) {
        it(`${answerKey(answer)} → ${expectedPolicy(answer)}`, () => {
          const failure = financialCommandFailureOf(operation, appErrorOf(answer));
          expect(failure.kind).not.toBe('outcomeUnknown');
          expect(resubmissionPolicy(operation, failure)).toBe(expectedPolicy(answer));
        });
      }

      it(`no answer → ${core.idempotencyKey ? 'same-key replay' : 'blocked until CF-74'}`, () => {
        const failure = financialCommandFailureOf(operation, appErrorOf('noAnswer'));
        expect(failure.kind).toBe('outcomeUnknown');
        expect(resubmissionPolicy(operation, failure)).toBe(
          core.idempotencyKey ? 'sameKeyReplay' : 'blockedUntilCF74',
        );
        // An undocumented 503 may have been recorded: never "nothing changed".
        const undocumented = financialCommandFailureOf(
          operation,
          appErrorOf({ status: 503, code: 'some_undocumented_code' }),
        );
        expect(undocumented.kind).toBe('outcomeUnknown');
      });
    });
  }
});

// ── 5. The coordinator, per operation, on Core's documented answers ─────────────────────────────────────────────────

describe('F1-S7 coordinator contract per receipt operation', () => {
  for (const operation of OPERATIONS) {
    describe(operation, () => {
      const core = consumerFixture(operation);
      const purpose = RECEIPT_OPERATION_PURPOSE[operation];

      it('asks for the operation’s own purpose and binding; authorization is not completion', () => {
        const t = setUp(operation);
        const callerCopy = t.binding as unknown as Record<string, unknown>;
        expect(t.run.open(t.binding)).toBe(true);
        callerCopy['companyId'] = 'changed-after-open';
        t.run.verify(TOTP);
        expect(t.env.stepUp.answers.calls).toEqual([{ purpose, proof: TOTP }]);
        t.env.stepUp.answers.ok(proofOf(purpose));
        const request = t.env.receipts.requests[0];
        expect(request?.binding).toEqual(BINDINGS[operation]);
        expect(request?.stepUp.purpose).toBe(purpose);
        const receipt = issuedFor(BINDINGS[operation]);
        t.env.receipts.answers.ok(receipt);
        expect(t.run.authorization().step).toBe('issued');
        expect(t.run.outcome()).toEqual({ status: 'notSubmitted', lastFailure: null });
        expect(t.env.consumer.calls).toHaveLength(0);
        t.run.submit();
        t.env.consumer.ok('applied');
        expect(t.run.outcome()).toEqual({ status: 'applied', result: 'applied', via: 'answer' });
        expect(receipt.secret.held).toBe(false);
      });

      it('uses two distinct keys in Core’s key format, fixed for the intent and new for the next', () => {
        const t = toIssued(operation, { deterministicKeys: false });
        const issuanceKey = t.env.receipts.requests[0]?.idempotencyKey ?? '';
        t.run.submit();
        const consumerKey = sent(t, 0).idempotencyKey;
        expect(issuanceKey).toMatch(KEY_PATTERN);
        expect(consumerKey).toMatch(KEY_PATTERN);
        expect(consumerKey).not.toBe(issuanceKey);
        t.env.consumer.ok('done');
        expect(t.run.open(t.binding)).toBe(true);
        t.run.verify(TOTP);
        t.env.stepUp.answers.ok(proofOf(purpose));
        expect(t.env.receipts.requests[1]?.idempotencyKey).not.toBe(issuanceKey);
      });

      it('expires at Core’s expiresAt: never sent afterwards, secret discarded', () => {
        const t = toIssued(operation);
        expect(Date.parse(t.receipt.expiresAt) - NOW).toBe(LIFETIME_MS);
        t.env.now = NOW + LIFETIME_MS;
        t.run.submit();
        expect(t.env.consumer.calls).toHaveLength(0);
        expect(t.run.authorization()).toEqual(
          expect.objectContaining({ step: 'ended', reason: 'expired' }),
        );
        expect(t.receipt.secret.held).toBe(false);
      });

      it('is single use: one consumer call per receipt, nothing after a terminal answer', () => {
        const t = toIssued(operation);
        t.run.submit();
        t.run.submit();
        t.run.repeatIdentical();
        expect(t.env.consumer.calls).toHaveLength(1);
        t.env.consumer.ok('done');
        t.run.submit();
        t.run.repeatIdentical();
        expect(t.env.consumer.calls).toHaveLength(1);
      });

      for (const answer of core.answers) {
        it(`on ${answerKey(answer)}: ${expectedPolicy(answer)}`, () => {
          const t = toIssued(operation);
          t.run.submit();
          t.env.consumer.fail(appErrorOf(answer));
          const first = sent(t, 0);
          switch (expectedPolicy(answer)) {
            case 'sameRequestSanctionedByCore':
              expect(t.run.outcome().status).toBe('unresolved');
              expect(t.run.canRepeatIdentical()).toBe(true);
              t.run.repeatIdentical();
              expect(sent(t, 1).receipt).toBe(first.receipt);
              expect(sent(t, 1).idempotencyKey).toBe(first.idempotencyKey);
              break;
            case 'retryAllowed':
              expect(t.run.outcome()).toEqual(
                expect.objectContaining({ status: 'notSubmitted', lastFailure: expect.anything() }),
              );
              expect(t.receipt.secret.held).toBe(true);
              t.run.submit();
              expect(sent(t, 1).receipt).toBe(first.receipt);
              expect(sent(t, 1).idempotencyKey).toBe(first.idempotencyKey);
              break;
            default:
              expect(t.run.outcome().status).toBe('refused');
              expect(t.run.authorization().step).toBe('ended');
              expect(t.receipt.secret.held).toBe(false);
              t.run.submit();
              t.run.repeatIdentical();
              expect(t.env.consumer.calls).toHaveLength(1);
          }
        });
      }

      if (core.idempotencyKey) {
        it('no answer: the identical request under the same key, by the person, never automatically', () => {
          const t = toIssued(operation);
          t.run.submit();
          t.env.consumer.fail(appErrorOf('noAnswer'));
          expect(t.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
          expect(t.env.consumer.calls).toHaveLength(1);
          t.run.repeatIdentical();
          expect(sent(t, 1)).toEqual(sent(t, 0));
        });
      } else {
        it('no answer: blocked pending reconciliation (CF-74); only a proving read lifts it', () => {
          const uncertain = new UncertainFinancialTargets();
          const t = toIssued(operation, { uncertain });
          t.run.submit();
          t.env.consumer.fail(appErrorOf('noAnswer'));
          expect(t.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'blockedUntilCF74' });
          expect(t.receipt.secret.held).toBe(false);
          expect(t.run.canRepeatIdentical()).toBe(false);
          t.run.repeatIdentical();
          expect(t.env.consumer.calls).toHaveLength(1);

          const next = setUp(operation, { uncertain });
          expect(next.run.open(next.binding)).toBe(false);
          expect(next.run.authorization()).toEqual({ step: 'blocked' });

          t.run.reconcile();
          t.env.reads.ok({ applied: false });
          expect(next.run.open(next.binding)).toBe(false);
          t.run.reconcile();
          t.env.reads.ok({ applied: true, result: 'found' });
          expect(t.run.outcome()).toEqual({
            status: 'applied',
            result: 'found',
            via: 'reconciliation',
          });
          expect(next.run.open(next.binding)).toBe(true);
        });
      }
    });
  }
});

// ── 6. Secret disposal, context and repeated intents ───────────────────────────────────────────────────────────────

describe('F1-S7 secret disposal on cancellation, expiry and session or scope changes', () => {
  const changes: readonly [string, (t: Harness) => void][] = [
    ['cancellation', (t) => t.run.cancel()],
    [
      'expiry',
      (t) => {
        t.env.now = NOW + LIFETIME_MS + 1;
        t.run.checkExpiry();
      },
    ],
    [
      'sign-out',
      (t) => {
        t.env.context = null;
        t.run.checkContext();
      },
    ],
    [
      'another account',
      (t) => {
        t.env.context = { ...OWNER_CONTEXT, actorId: 'owner-2' };
        t.run.checkContext();
      },
    ],
    [
      'another session',
      (t) => {
        t.env.context = { ...OWNER_CONTEXT, sessionKey: 'session-2' };
        t.run.checkContext();
      },
    ],
    [
      'another scope',
      (t) => {
        t.env.context = { ...OWNER_CONTEXT, scope: 'company:company-b' };
        t.run.checkContext();
      },
    ],
  ];

  for (const [name, change] of changes) {
    it(`${name}: the held secret is discarded and nothing is ever sent`, () => {
      const t = toIssued('refund');
      expect(t.receipt.secret.held).toBe(true);
      change(t);
      expect(t.receipt.secret.held).toBe(false);
      expect(t.run.authorization().step).toBe('ended');
      t.run.submit();
      t.run.repeatIdentical();
      expect(t.env.consumer.calls).toHaveLength(0);
    });
  }

  it('a receipt arriving after the intent ended is discarded at once, never held', () => {
    const t = setUp('recovery_write_off');
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('billing.recovery.write_off'));
    t.run.cancel();
    const late = issuedFor(t.binding);
    t.env.receipts.answers.ok(late);
    expect(late.secret.held).toBe(false);
    expect(t.run.authorization()).toEqual(
      expect.objectContaining({ step: 'ended', reason: 'cancelled' }),
    );
  });

  it('a context change while a no-key command is in flight blocks the target (CF-74)', () => {
    const uncertain = new UncertainFinancialTargets();
    const t = toIssued('fraud_hold_release', { uncertain });
    t.run.submit();
    t.env.context = { ...OWNER_CONTEXT, sessionKey: 'session-2' };
    t.run.checkContext();
    expect(t.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'blockedUntilCF74' });
    expect(uncertain.isBlocked(t.binding)).toBe(true);
  });

  it('a repeated intent cannot start while one is under way, and input is single flight', () => {
    const t = setUp('provider_fact_associate');
    expect(t.run.open(t.binding)).toBe(true);
    expect(t.run.open(t.binding)).toBe(false);
    t.run.verify(TOTP);
    t.run.verify(TOTP);
    expect(t.env.stepUp.answers.calls).toHaveLength(1);
  });

  it('a denied step-up (403 step_up_required) asks for the factor again; 401 ends the intent', () => {
    const t = setUp('late_settlement_apply');
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    t.env.receipts.answers.fail(appErrorOf({ status: 403, code: 'step_up_required' }));
    expect(t.run.authorization()).toEqual({ step: 'awaitingFactor', failure: null });
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    t.env.receipts.answers.fail(appErrorOf({ status: 401, code: null }));
    expect(t.run.authorization()).toEqual(
      expect.objectContaining({ step: 'ended', reason: 'revoked' }),
    );
  });
});

// ── 7. Authority and the production boundary ───────────────────────────────────────────────────────────────────────

describe('F1-S7 authority: Company Owner, Operator and delegated fee proposals', () => {
  const COMPANY = companyId('company-a');
  const PLATFORM = platformId('platform-1');
  const OTHER = platformId('platform-2');
  const owner: OwnerActor = {
    kind: 'owner',
    userId: 'owner-1',
    email: 'owner@example.test',
    companyId: COMPANY,
  };
  const operator: OperatorActor = {
    kind: 'operator',
    userId: 'operator-1',
    email: 'operator@example.test',
    platformAssignments: [PLATFORM],
  };
  const here: FinancialContext = {
    companyId: COMPANY,
    platformId: PLATFORM,
    companyPlatforms: [PLATFORM, OTHER],
  };
  const all = Object.keys(FINANCIAL_OPERATIONS).filter(isFinancialOperation);
  const receiptBacked = all.filter((o) => FINANCIAL_OPERATIONS[o].authorization.kind === 'receipt');
  const purposeOf = (o: FinancialOperation) => {
    const authorization = FINANCIAL_OPERATIONS[o].authorization;
    return authorization.kind === 'receipt' ? authorization.purpose : null;
  };

  it('represents every receipt operation once, as an owner operation of the Company', () => {
    expect(receiptBacked.map(purposeOf).sort()).toEqual(
      Object.values(RECEIPT_OPERATION_PURPOSE).sort(),
    );
    for (const o of receiptBacked) {
      const rule = FINANCIAL_OPERATIONS[o];
      if (rule.availability === 'unavailable') continue;
      expect([o, rule.actor, rule.authority]).toEqual([o, 'owner', 'companyOwner']);
      expect(rule.pendingCoreChecks).toContain('authorizationProof');
    }
  });

  it('an owner may only attempt a receipt operation; Core’s receipt requirement travels unchanged', () => {
    for (const o of receiptBacked) {
      const decision = financialDecision(owner, o, here);
      if (FINANCIAL_OPERATIONS[o].availability === 'unavailable') {
        expect(decision.outcome).toBe('unavailable');
        continue;
      }
      expect(decision).toEqual(
        expect.objectContaining({
          outcome: 'mayAttempt',
          coreAuthorizationProven: false,
          authorization: { kind: 'receipt', purpose: purposeOf(o) },
        }),
      );
    }
  });

  it('an operator holds no financial capability but the fee proposal; never a receipt operation', () => {
    expect(attemptableFinancialOperations(operator)).toEqual(['fees.propose']);
    for (const o of receiptBacked) {
      const decision = financialDecision(operator, o, here);
      expect(decision.outcome === 'unavailable' || decision.outcome === 'refused').toBe(true);
      if (decision.outcome === 'refused') expect(decision.reason).toBe('actorKind');
    }
  });

  it('a fee proposal is delegated authority: assigned operator only, live delegation pending in Core (CF-72)', () => {
    expect(financialDecision(operator, 'fees.propose', here)).toEqual({
      outcome: 'mayAttempt',
      coreAuthorizationProven: false,
      availability: 'developmentOnly',
      authorization: { kind: 'none' },
      pendingCoreChecks: [
        'liveAuthority',
        'platformAccess',
        'liveDelegation',
        'financialInvariants',
      ],
      blockedBy: ['CF-72'],
    });
    expect(financialDecision(operator, 'fees.propose', { ...here, platformId: OTHER })).toEqual({
      outcome: 'refused',
      reason: 'outOfScope',
    });
    expect(financialDecision(owner, 'fees.propose', here)).toEqual({
      outcome: 'refused',
      reason: 'actorKind',
    });
    expect(financialDecision(owner, 'fees.decideProposal', here).outcome).toBe('mayAttempt');
    expect(financialDecision(operator, 'fees.decideProposal', here)).toEqual({
      outcome: 'refused',
      reason: 'actorKind',
    });
  });

  it('every no-key receipt operation names CF-74 as missing or blocking', () => {
    for (const o of receiptBacked) {
      const operation = OPERATIONS.find((op) => RECEIPT_OPERATION_PURPOSE[op] === purposeOf(o));
      if (operation === undefined || RECEIPT_CONSUMERS[operation].idempotencyKey) continue;
      const rule = FINANCIAL_OPERATIONS[o];
      const followUps: readonly string[] =
        rule.availability === 'unavailable' ? rule.missing : rule.blockedBy;
      expect([o, followUps.includes('CF-74')]).toEqual([o, true]);
    }
  });
});

describe('F1-S7 mock-first and production-unavailable boundaries', () => {
  it('no financial operation is production-ready; no receipt consumer is mounted in production', () => {
    for (const rule of Object.values(FINANCIAL_OPERATIONS))
      expect(['developmentOnly', 'simulationOnly', 'unavailable']).toContain(rule.availability);
    for (const consumer of consumersFixture.consumers)
      expect(['notMounted', 'notConfigured']).toContain(consumer.production);
  });

  it('without an adapter, the step-up is never obtained and nothing is issued or sent', () => {
    const t = setUp('refund', {
      stepUp: new UnavailableReceiptStepUpGateway(),
      receipts: new UnavailableAuthorizationReceiptGateway(),
    });
    t.run.open(t.binding);
    t.run.verify(TOTP);
    expect(t.run.authorization()).toEqual(
      expect.objectContaining({ step: 'ended', reason: 'notInBuild' }),
    );
    expect(t.env.consumer.calls).toHaveLength(0);
  });

  it('a step-up without a receipt adapter ends as not in this build, never as a refusal', () => {
    const t = setUp('dispute_decision', { receipts: new UnavailableAuthorizationReceiptGateway() });
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.env.stepUp.answers.ok(proofOf('payment.dispute.decide'));
    expect(t.run.authorization()).toEqual({
      step: 'ended',
      reason: 'notInBuild',
      issueFailure: { kind: 'contractUnavailable' },
    });
    expect(t.env.consumer.calls).toHaveLength(0);
  });
});
