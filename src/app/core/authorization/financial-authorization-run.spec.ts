import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { NW_CLOCK } from '../../shared/format/clock';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID, DEMO_OWNER_USER_ID } from '../../demo/world/seed';
import { DEMO_TOTP_CODE } from '../auth/auth.fixtures';
import { DemoAuthState } from '../auth/auth.mock-state';
import { FactorProof } from '../auth/auth.model';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError, adapterUnavailable } from '../errors/app-error';
import { MOCK_AUTHORIZATION_RECEIPT_PROVIDERS } from './authorization-receipt.mock';
import { DemoReceiptState } from './authorization-receipt.mock-state';
import {
  FinancialAuthorizationRun,
  FinancialRunContext,
  ReconciliationAnswer,
} from './financial-authorization-run';
import { ReceiptOperation, ReceiptPurpose } from './purpose-registry';
import {
  AuthorizationReceiptGateway,
  UnavailableAuthorizationReceiptGateway,
} from './receipt.gateway';
import { IssuedReceipt, ReceiptBindingFor, ReceiptIssueRequest } from './receipt.model';
import { ReceiptSecret } from './receipt-secret';
import { ReceiptStepUpGateway, UnavailableReceiptStepUpGateway } from './receipt-step-up.gateway';
import { ReceiptStepUpProof, receiptStepUpProof } from './step-up-proof';
import { UncertainFinancialTargets, targetOf } from './uncertain-financial-targets';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000';
const id = (n: number) => `${ID}${String(n).padStart(2, '0')}`;
const TOTP: FactorProof = { method: 'totp', code: '123456' };
const SECRET = 'A'.repeat(43);
const OWNER: FinancialRunContext = {
  actorId: 'owner-1',
  sessionKey: 'session-1',
  scope: 'company',
};

const lateSettlement = (): ReceiptBindingFor<'late_settlement_apply'> => ({
  operation: 'late_settlement_apply',
  audience: 'billing-service',
  companyId: id(1),
  lateSettlementId: id(2),
  assistanceRequestId: id(3),
  beneficiaryUserId: id(4),
  reasonCode: 'cash_not_returned_attested',
});

const writeOff = (amount = 900): ReceiptBindingFor<'recovery_write_off'> => ({
  operation: 'recovery_write_off',
  audience: 'billing-service',
  companyId: id(1),
  obligationId: id(5),
  organizationId: id(6),
  amount,
  currency: 'TND',
});

type TestOperation = 'late_settlement_apply' | 'recovery_write_off';
type TestBinding = ReceiptBindingFor<TestOperation>;

/** Answers the test controls one at a time. */
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

function setUp(binding: TestBinding, shared: { uncertain?: UncertainFinancialTargets } = {}) {
  const env = {
    context: OWNER as FinancialRunContext | null,
    now: NOW,
    stepUp: new FakeStepUp(),
    receipts: new FakeReceipts(),
    consumer: new Answers<string>(),
    reads: new Answers<ReconciliationAnswer<string>>(),
    uncertain: shared.uncertain ?? new UncertainFinancialTargets(),
    keys: 0,
  };
  const run = new FinancialAuthorizationRun<TestOperation, string>({
    operation: binding.operation,
    context: () => env.context,
    stepUp: env.stepUp,
    receipts: env.receipts,
    submit: (receipt, request) =>
      env.consumer.take({ receipt, idempotencyKey: request.idempotencyKey }),
    reconcile: (b) => env.reads.take(b),
    uncertain: env.uncertain,
    now: () => env.now,
    newKey: () => `key-${String(++env.keys).padStart(4, '0')}`,
  });
  return { ...env, run, env, binding };
}

const proofOf = (purpose: ReceiptPurpose) =>
  receiptStepUpProof(purpose, { token: 'step-up-token-1', expiresAt: '2026-10-30T12:05:00Z' });

function issued(binding: ReceiptIssueRequest['binding'], lifetimeMs = 600_000): IssuedReceipt {
  return {
    receiptId: id(90),
    secret: ReceiptSecret.fromIssued(SECRET),
    expiresAt: new Date(NOW + lifetimeMs).toISOString(),
    binding,
    simulated: true,
  };
}

/** Opens, verifies and receives a receipt: the run is `issued`, nothing submitted. */
function toIssued(binding: TestBinding, shared: { uncertain?: UncertainFinancialTargets } = {}) {
  const t = setUp(binding, shared);
  expect(t.run.open(binding)).toBe(true);
  t.run.verify(TOTP);
  t.stepUp.answers.ok(
    proofOf(
      binding.operation === 'late_settlement_apply'
        ? 'billing.late_settlement.apply'
        : 'billing.recovery.write_off',
    ),
  );
  const receipt = issued(binding);
  t.receipts.answers.ok(receipt);
  return { ...t, receipt };
}

const sent = (t: { consumer: Answers<string> }, n: number) => t.consumer.calls[n] as Sent;

const error = (kind: AppError['kind'], status: number, code?: string): AppError =>
  ({
    kind,
    status,
    ...(code === undefined ? {} : { code }),
    ...(kind === 'validation' ? { messages: [] } : {}),
  }) as AppError;

describe('FinancialAuthorizationRun (F1-S5): authorization and outcome are separate machines', () => {
  it('runs one intent: factor-only step-up of the right purpose, receipt, one consumer call, applied', () => {
    const t = setUp(lateSettlement());
    expect(t.run.authorization()).toEqual({ step: 'closed' });
    expect(t.run.open(t.binding)).toBe(true);
    expect(t.run.authorization()).toEqual({ step: 'awaitingFactor', failure: null });

    t.run.verify(TOTP);
    expect(t.run.authorization().step).toBe('verifying');
    expect(t.stepUp.answers.calls).toEqual([
      { purpose: 'billing.late_settlement.apply', proof: TOTP },
    ]);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));

    expect(t.run.authorization().step).toBe('issuing');
    expect(t.receipts.requests).toHaveLength(1);
    const request = t.receipts.requests[0]!;
    expect(request.binding).toEqual(t.binding);
    expect(request.binding).not.toBe(t.binding); // a private copy
    expect(request.idempotencyKey).toBe('key-0001');
    const receipt = issued(t.binding);
    t.receipts.answers.ok(receipt);

    // Issued is NOT done: the outcome is still "not submitted".
    expect(t.run.authorization()).toEqual({
      step: 'issued',
      receiptId: receipt.receiptId,
      expiresAt: receipt.expiresAt,
      simulated: true,
    });
    expect(t.run.outcome()).toEqual({ status: 'notSubmitted', lastFailure: null });

    t.run.submit();
    expect(t.run.outcome()).toEqual({ status: 'submitted' });
    expect(sent(t, 0).receipt).toBe(receipt);
    expect(sent(t, 0).idempotencyKey).toBe('key-0002'); // Kc, distinct from Ki
    t.consumer.ok('purchase-1');

    expect(t.run.outcome()).toEqual({ status: 'applied', result: 'purchase-1', via: 'answer' });
    expect(t.run.authorization()).toEqual({ step: 'consumed', receiptId: receipt.receiptId });
    expect(receipt.secret.held).toBe(false);
  });

  it('a later intent gets new keys and never replays an earlier outcome', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.ok('done');
    expect(t.run.open(t.binding)).toBe(true);
    t.run.verify(TOTP);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    expect(t.receipts.requests.map((r) => r.idempotencyKey)).toEqual(['key-0001', 'key-0003']);
  });
});

describe('FinancialAuthorizationRun (F1-S5): issuance transition table', () => {
  const table: [AppError, string, string | null][] = [
    [error('forbidden', 403, 'step_up_required'), 'awaitingFactor', null],
    [error('unavailable', 503, 'receipt_unavailable'), 'awaitingFactor', null],
    [error('rate_limited', 429), 'awaitingFactor', null],
    [error('conflict', 409, 'receipt_issued_response_lost'), 'ended', 'voided'],
    [error('conflict', 409, 'receipt_expired'), 'ended', 'expired'],
    [error('conflict', 409, 'receipt_already_consumed'), 'ended', 'issueRefused'],
    [error('conflict', 409, 'idempotency_key_reused'), 'ended', 'issueRefused'],
    [error('validation', 400, 'receipt_binding_invalid'), 'ended', 'issueRefused'],
    [error('validation', 400, 'idempotency_key_required'), 'ended', 'issueRefused'],
    [error('forbidden', 403, 'authority_revoked'), 'ended', 'revoked'],
    [error('unauthenticated', 401), 'ended', 'revoked'],
    [adapterUnavailable(), 'ended', 'notInBuild'],
    [error('unavailable', 503, 'receipt_outcome_unknown'), 'issueUnknown', null],
    [error('network', 0), 'issueUnknown', null],
  ];
  for (const [answer, step, reason] of table)
    it(`${answer.kind} ${'code' in answer ? (answer.code ?? '') : ''} → ${reason ?? step}`, () => {
      const t = setUp(lateSettlement());
      t.run.open(t.binding);
      t.run.verify(TOTP);
      t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
      t.receipts.answers.fail(answer);
      const state = t.run.authorization();
      expect(state.step).toBe(step);
      if (state.step === 'ended') expect(state.reason).toBe(reason);
      expect(t.consumer.calls).toHaveLength(0);
    });

  it('a lost issuance answer: the SAME request once (same key, same step-up), never a new receipt', () => {
    const t = setUp(lateSettlement());
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    t.receipts.answers.fail(error('network', 0));
    t.run.replayIssue();
    t.run.replayIssue(); // a double click while the replay is in flight
    expect(t.receipts.requests).toHaveLength(2);
    expect(t.receipts.requests[1]).toEqual(t.receipts.requests[0]);
    expect(t.stepUp.answers.calls).toHaveLength(1);
    // Core voided the receipt it had issued: the intent ends; a new one starts afresh.
    t.receipts.answers.fail(error('conflict', 409, 'receipt_issued_response_lost'));
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'voided' });
  });

  it('a second lost issuance answer ends the intent: no third send', () => {
    const t = setUp(lateSettlement());
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    t.receipts.answers.fail(error('network', 0));
    t.run.replayIssue();
    t.receipts.answers.fail(error('network', 0));
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'issueRefused' });
    t.run.replayIssue();
    expect(t.receipts.requests).toHaveLength(2);
  });

  it('step-up: a refused factor asks again; no adapter or no authority ends the intent', () => {
    const t = setUp(lateSettlement());
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.stepUp.answers.fail(error('unauthenticated', 401));
    expect(t.run.authorization()).toEqual({
      step: 'awaitingFactor',
      failure: { kind: 'verificationRefused' },
    });
    t.run.verify(TOTP);
    t.stepUp.answers.fail(error('forbidden', 403, 'admin_forbidden'));
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'revoked' });
    expect(t.receipts.requests).toHaveLength(0);
  });
});

describe('FinancialAuthorizationRun (F1-S5): consumer outcomes and Core-sanctioned repeats', () => {
  it('unresolved: the identical request again (same receipt, same key), only as an explicit action', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('unavailable', 503, 'late_settlement_authorization_unresolved'));
    expect(t.run.outcome()).toMatchObject({ status: 'unresolved' });
    expect(t.consumer.calls).toHaveLength(1); // nothing automatic
    expect(t.receipt.secret.held).toBe(true);
    expect(t.run.canRepeatIdentical()).toBe(true);
    t.run.repeatIdentical();
    t.run.repeatIdentical(); // single flight
    expect(t.consumer.calls).toHaveLength(2);
    expect(sent(t, 1)).toEqual(sent(t, 0));
    t.consumer.ok('purchase-1');
    expect(t.run.outcome()).toMatchObject({ status: 'applied' });
    expect(t.receipt.secret.held).toBe(false);
  });

  it('no answer on a route WITH a key: same-key replay is offered, never a new receipt', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('network', 0));
    expect(t.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
    expect(t.run.authorization().step).toBe('issued');
    expect(t.receipt.secret.held).toBe(true);
    t.run.submit(); // not a fresh submission
    expect(t.consumer.calls).toHaveLength(1);
    t.run.repeatIdentical();
    expect(sent(t, 1)).toEqual(sent(t, 0));
    expect(t.receipts.requests).toHaveLength(1);
  });

  it('"nothing changed": the same request may be sent again, same key, while unexpired', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('unavailable', 503, 'late_settlement_evidence_unavailable'));
    expect(t.run.outcome()).toMatchObject({
      status: 'notSubmitted',
      lastFailure: { kind: 'unavailableNoMutation' },
    });
    t.run.submit();
    expect(sent(t, 1).idempotencyKey).toBe(sent(t, 0).idempotencyKey);
  });

  it('a definitive refusal discards the secret; nothing can be repeated', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('conflict', 409, 'late_settlement_authorization_refused'));
    expect(t.run.outcome()).toMatchObject({
      status: 'refused',
      failure: { kind: 'receiptRefused' },
    });
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'spent' });
    expect(t.receipt.secret.held).toBe(false);
    t.run.repeatIdentical();
    t.run.submit();
    expect(t.consumer.calls).toHaveLength(1);
  });

  it('a 401 from the consumer ends the intent as revoked', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('unauthenticated', 401));
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'revoked' });
    expect(t.receipt.secret.held).toBe(false);
  });
});

describe('FinancialAuthorizationRun (F1-S5): no-key routes after an uncertain outcome (CF-74)', () => {
  it('blocks the target: no repeat, no new intent, secret discarded', () => {
    const uncertain = new UncertainFinancialTargets();
    const t = toIssued(writeOff(), { uncertain });
    t.run.submit();
    t.consumer.fail(error('network', 0));
    expect(t.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'blockedUntilCF74' });
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'outcomeUncertain' });
    expect(t.receipt.secret.held).toBe(false);
    expect(t.run.canRepeatIdentical()).toBe(false);
    t.run.repeatIdentical();
    t.run.submit();
    expect(t.consumer.calls).toHaveLength(1);

    // Not this run, not another one, and not with a re-read binding of another amount.
    expect(t.run.open(writeOff(400))).toBe(false);
    expect(t.run.authorization()).toEqual({ step: 'blocked' });
    const other = setUp(writeOff(400), { uncertain });
    expect(other.run.open(other.binding)).toBe(false);
    expect(other.receipts.requests).toHaveLength(0);
  });

  it('a read showing nothing applied does not unblock; a read proving it applied does', () => {
    const uncertain = new UncertainFinancialTargets();
    const t = toIssued(writeOff(), { uncertain });
    t.run.submit();
    t.consumer.fail(error('unavailable', 503, 'unexpected_service_error'));
    expect(t.run.outcome()).toMatchObject({ policy: 'blockedUntilCF74' });

    t.run.reconcile();
    t.run.reconcile(); // single flight
    expect(t.reads.calls).toHaveLength(1);
    t.reads.ok({ applied: false });
    expect(t.run.outcome()).toMatchObject({ policy: 'blockedUntilCF74' });
    expect(uncertain.isBlocked(writeOff())).toBe(true);

    t.run.reconcile();
    t.reads.ok({ applied: true, result: 'loss-1' });
    expect(t.run.outcome()).toEqual({ status: 'applied', result: 'loss-1', via: 'reconciliation' });
    expect(uncertain.isBlocked(writeOff())).toBe(false);
    expect(t.consumer.calls).toHaveLength(1);
  });

  it('unresolved on a no-key route: Core sanctions the identical repeat; cancelling it blocks the target', () => {
    const uncertain = new UncertainFinancialTargets();
    const t = toIssued(writeOff(), { uncertain });
    t.run.submit();
    t.consumer.fail(error('unavailable', 503, 'recovery_authorization_unresolved'));
    expect(t.run.canRepeatIdentical()).toBe(true);
    t.run.cancel();
    expect(t.receipt.secret.held).toBe(false);
    expect(t.run.outcome()).toMatchObject({ policy: 'blockedUntilCF74' });
    expect(uncertain.isBlocked(writeOff())).toBe(true);
  });

  it('a target key leaves amounts and reasons out', () => {
    expect(targetOf(writeOff(100))).toBe(targetOf(writeOff(200)));
    expect(targetOf(writeOff())).not.toBe(targetOf({ ...writeOff(), obligationId: id(7) }));
  });
});

describe('FinancialAuthorizationRun (F1-S5): expiry, identity and scope', () => {
  it('an unsubmitted receipt past its expiresAt is discarded and never sent', () => {
    const t = toIssued(lateSettlement());
    t.env.now = NOW + 600_000;
    t.run.checkExpiry();
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'expired' });
    expect(t.receipt.secret.held).toBe(false);
    t.run.submit();
    expect(t.consumer.calls).toHaveLength(0);
  });

  it('submitting after expiry ends the intent locally', () => {
    const t = toIssued(lateSettlement());
    t.env.now = NOW + 600_001;
    t.run.submit();
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'expired' });
    expect(t.consumer.calls).toHaveLength(0);
  });

  it('a receipt that arrives already expired is never held', () => {
    const t = setUp(lateSettlement());
    t.run.open(t.binding);
    t.run.verify(TOTP);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    const receipt = issued(t.binding, 0);
    t.receipts.answers.ok(receipt);
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'expired' });
    expect(receipt.secret.held).toBe(false);
  });

  it('after submission, expiry does not discard: Core decides a sanctioned repeat', () => {
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('unavailable', 503, 'late_settlement_authorization_unresolved'));
    t.env.now = NOW + 3_600_000;
    t.run.checkExpiry();
    expect(t.run.canRepeatIdentical()).toBe(true);
  });

  for (const change of [
    ['signed out', null],
    ['another account', { ...OWNER, actorId: 'owner-2' }],
    ['another session', { ...OWNER, sessionKey: 'session-2' }],
    ['another scope', { ...OWNER, scope: 'platform:p-1' }],
  ] as const)
    it(`${change[0]}: answers are dropped and the secret discarded`, () => {
      // During the step-up: nothing is issued.
      const a = setUp(lateSettlement());
      a.run.open(a.binding);
      a.run.verify(TOTP);
      a.env.context = change[1];
      a.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
      expect(a.run.authorization()).toMatchObject({ step: 'ended', reason: 'contextChanged' });
      expect(a.receipts.requests).toHaveLength(0);

      // During issuance: the secret that arrives is discarded at once.
      const b = setUp(lateSettlement());
      b.run.open(b.binding);
      b.run.verify(TOTP);
      b.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
      b.env.context = change[1];
      const receipt = issued(b.binding);
      b.receipts.answers.ok(receipt);
      expect(receipt.secret.held).toBe(false);
      expect(b.run.authorization()).toMatchObject({ step: 'ended', reason: 'contextChanged' });

      // While issued: nothing is sent.
      const c = toIssued(lateSettlement());
      c.env.context = change[1];
      c.run.submit();
      expect(c.consumer.calls).toHaveLength(0);
      expect(c.receipt.secret.held).toBe(false);
    });

  it('a context change while submitted: a key route stays replayable by Core, a no-key route is blocked', () => {
    const key = toIssued(lateSettlement());
    key.run.submit();
    key.env.context = { ...OWNER, sessionKey: 'session-2' };
    key.run.checkContext();
    expect(key.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
    expect(key.run.canRepeatIdentical()).toBe(false); // the secret is gone with the session
    key.consumer.ok('late answer');
    expect(key.run.outcome().status).toBe('outcomeUnknown');

    const uncertain = new UncertainFinancialTargets();
    const noKey = toIssued(writeOff(), { uncertain });
    noKey.run.submit();
    noKey.env.context = null;
    noKey.run.checkContext();
    expect(noKey.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'blockedUntilCF74' });
    expect(uncertain.isBlocked(writeOff())).toBe(true);
  });

  it('cancellation (or the page going away) discards the secret and drops late answers', () => {
    const t = toIssued(lateSettlement());
    t.run.cancel();
    expect(t.run.authorization()).toMatchObject({ step: 'ended', reason: 'cancelled' });
    expect(t.receipt.secret.held).toBe(false);
    t.run.submit();
    expect(t.consumer.calls).toHaveLength(0);
  });
});

describe('FinancialAuthorizationRun (F1-S5): single flight', () => {
  it('double clicks send one step-up, one issuance and one consumer call', () => {
    const t = setUp(lateSettlement());
    t.run.open(t.binding);
    expect(t.run.open(t.binding)).toBe(false); // an intent is under way
    t.run.verify(TOTP);
    t.run.verify(TOTP);
    expect(t.stepUp.answers.calls).toHaveLength(1);
    t.stepUp.answers.ok(proofOf('billing.late_settlement.apply'));
    t.run.verify(TOTP);
    expect(t.receipts.requests).toHaveLength(1);
    t.receipts.answers.ok(issued(t.binding));
    t.run.submit();
    t.run.submit();
    expect(t.run.busy()).toBe(true);
    expect(t.consumer.calls).toHaveLength(1);
  });
});

describe('FinancialAuthorizationRun (F1-S5): secrecy and production separation', () => {
  it('no secret in its state, storage or logs', () => {
    const storage = [
      vi.spyOn(Storage.prototype, 'setItem'),
      vi.spyOn(console, 'log'),
      vi.spyOn(console, 'info'),
      vi.spyOn(console, 'warn'),
      vi.spyOn(console, 'error'),
    ];
    const t = toIssued(lateSettlement());
    t.run.submit();
    t.consumer.fail(error('network', 0));
    const snapshot = JSON.stringify([t.run.authorization(), t.run.outcome(), t.receipt]);
    expect(snapshot).not.toContain(SECRET);
    for (const spy of storage) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('with the unavailable gateways (every non-demo build) nothing is issued and nothing sent', async () => {
    const submit = vi.fn(() => of('never'));
    const run = new FinancialAuthorizationRun<'late_settlement_apply', string>({
      operation: 'late_settlement_apply',
      context: () => OWNER,
      stepUp: new UnavailableReceiptStepUpGateway(),
      receipts: new UnavailableAuthorizationReceiptGateway(),
      submit,
      uncertain: new UncertainFinancialTargets(),
      now: () => NOW,
    });
    run.open(lateSettlement());
    run.verify(TOTP);
    await Promise.resolve();
    expect(run.authorization()).toMatchObject({ step: 'ended', reason: 'notInBuild' });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('FinancialAuthorizationRun (F1-S5) with the F1-S4 demo gateways and a test consumer', () => {
  const START = Date.parse('2026-10-30T12:00:00Z');

  function demo() {
    const clock = { now: START };
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => clock.now },
        ...MOCK_AUTHORIZATION_RECEIPT_PROVIDERS,
      ],
    });
    const auth = TestBed.inject(DemoAuthState);
    auth.signedIn.set(
      auth.openSession(
        { userId: DEMO_OWNER_USER_ID, email: null, phone: null, adminTier: 'owner' },
        DEMO_OWNER_ID,
      ),
    );
    const state = TestBed.inject(DemoReceiptState);
    const binding: ReceiptBindingFor<'late_settlement_apply'> = {
      ...lateSettlement(),
      companyId: DEMO_COMPANY_ID,
    };
    let lost = false;
    const run = new FinancialAuthorizationRun<'late_settlement_apply', string>({
      operation: 'late_settlement_apply',
      context: () => {
        const session = auth.signedIn();
        return session === null || auth.sessionRevoked(session)
          ? null
          : {
              actorId: session.identity.userId,
              sessionKey: session.sessionId ?? '',
              scope: 'company',
            };
      },
      stepUp: TestBed.inject(ReceiptStepUpGateway),
      receipts: TestBed.inject(AuthorizationReceiptGateway),
      // The TEST consumer: Core's single consumption by consumeRef (= the consumer key), simulated by F1-S4's state.
      submit: (receipt, request) => {
        const answer = state.consume(
          receipt.secret,
          receipt.binding,
          'billing-service',
          request.idempotencyKey,
          true,
          clock.now,
        );
        if (lost) {
          lost = false;
          return throwError(() => ({ kind: 'network', status: 0 }) as AppError);
        }
        return answer.ok
          ? of(answer.replayed ? 'replayed' : 'applied')
          : throwError(
              () =>
                ({
                  kind: 'conflict',
                  code: 'late_settlement_authorization_refused',
                  status: 409,
                }) as AppError,
            );
      },
      uncertain: new UncertainFinancialTargets(),
      now: () => clock.now,
    });
    return { run, binding, auth, state, clock, loseNextAnswer: () => (lost = true) };
  }

  afterEach(() => TestBed.resetTestingModule());

  /** The demo adapters answer after `DEMO_LATENCY_MS` (0 here) timers. */
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
  };

  it('issues a simulated receipt and consumes it once; a lost answer is replayed by the same consumer key', async () => {
    const d = demo();
    d.run.open(d.binding);
    d.run.verify({ method: 'totp', code: DEMO_TOTP_CODE });
    await settle();
    const issuedState = d.run.authorization();
    expect(issuedState).toMatchObject({ step: 'issued', simulated: true });
    d.loseNextAnswer();
    d.run.submit();
    expect(d.run.outcome()).toEqual({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
    d.run.repeatIdentical();
    expect(d.run.outcome()).toEqual({ status: 'applied', result: 'replayed', via: 'answer' });
    if (issuedState.step === 'issued')
      expect(d.state.statusOf(issuedState.receiptId)).toBe('consumed');
  });

  it('a revoked demo session ends the intent before anything is sent', async () => {
    const d = demo();
    d.run.open(d.binding);
    d.run.verify({ method: 'totp', code: DEMO_TOTP_CODE });
    await settle();
    d.auth.endSession(d.auth.signedIn());
    d.run.submit();
    expect(d.run.authorization()).toMatchObject({ step: 'ended', reason: 'contextChanged' });
  });
});
