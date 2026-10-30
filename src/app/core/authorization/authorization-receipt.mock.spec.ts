import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { NW_CLOCK } from '../../shared/format/clock';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID, DEMO_OWNER_USER_ID } from '../../demo/world/seed';
import { DEMO_TOTP_CODE } from '../auth/auth.fixtures';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import {
  MOCK_AUTHORIZATION_RECEIPT_PROVIDERS,
  RECEIPT_DEMO_SCENARIO,
  ReceiptDemoScenario,
} from './authorization-receipt.mock';
import {
  DEMO_RECEIPT_LIFETIME_MS,
  DEMO_RECEIPT_STEP_UP_LIFETIME_MS,
  DemoReceiptState,
} from './authorization-receipt.mock-state';
import { RECEIPT_OPERATION_PURPOSE, ReceiptOperation } from './purpose-registry';
import { receiptIssueFailureOf } from './receipt-failure';
import { ReceiptHolderScope } from './receipt-holder-scope';
import { AuthorizationReceiptGateway } from './receipt.gateway';
import { ReceiptBindingFor, ReceiptIssueRequest } from './receipt.model';
import { ReceiptStepUpGateway } from './receipt-step-up.gateway';

const START = Date.parse('2026-10-30T12:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000';
const id = (n: number) => `${ID}${String(n).padStart(2, '0')}`;
const TOTP = { method: 'totp' as const, code: DEMO_TOTP_CODE };

const refund = (): ReceiptBindingFor<'refund'> => ({
  operation: 'refund',
  audience: 'payment-service',
  companyId: DEMO_COMPANY_ID,
  refundCaseId: id(1),
  paymentId: id(2),
  amount: 1500,
  currency: 'TND',
  reason: 'customer_request',
});

function setUp(
  options: { tier?: 'owner' | 'operator' | null; scenario?: ReceiptDemoScenario } = {},
) {
  const clock = { now: START };
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => clock.now },
      { provide: RECEIPT_DEMO_SCENARIO, useValue: options.scenario ?? 'normal' },
      ...MOCK_AUTHORIZATION_RECEIPT_PROVIDERS,
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  const tier = options.tier === undefined ? 'owner' : options.tier;
  if (tier === 'owner')
    auth.signedIn.set(
      auth.openSession(
        { userId: DEMO_OWNER_USER_ID, email: null, phone: null, adminTier: 'owner' },
        DEMO_OWNER_ID,
      ),
    );
  if (tier === 'operator')
    auth.signedIn.set({
      identity: { userId: 'operator-1', email: null, phone: null, adminTier: 'operator' },
      businessIdentityId: null,
    });
  return {
    clock,
    auth,
    state: TestBed.inject(DemoReceiptState),
    stepUps: TestBed.inject(ReceiptStepUpGateway),
    receipts: TestBed.inject(AuthorizationReceiptGateway),
  };
}

async function failure(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected an error');
}

async function request<O extends ReceiptOperation>(
  env: ReturnType<typeof setUp>,
  binding: ReceiptBindingFor<O>,
  key = 'intent-key-0001',
) {
  const purpose = RECEIPT_OPERATION_PURPOSE[binding.operation];
  const stepUp = await firstValueFrom(env.stepUps.obtain(purpose, TOTP));
  return { binding, stepUp, idempotencyKey: key } as ReceiptIssueRequest<O>;
}

describe('MockAuthorizationReceiptGateway (F1-S4, simulated; never a Core receipt)', () => {
  it('issues a simulated, 10-minute receipt for the owner, with a held, redacted secret', async () => {
    const env = setUp();
    const issued = await firstValueFrom(env.receipts.issue(await request(env, refund())));
    expect(issued.simulated).toBe(true);
    expect(Date.parse(issued.expiresAt) - START).toBe(DEMO_RECEIPT_LIFETIME_MS);
    expect(issued.secret.held).toBe(true);
    expect(JSON.stringify(issued)).not.toMatch(/[A-Za-z0-9_-]{43}/);
    expect(env.state.statusOf(issued.receiptId)).toBe('issued');
  });

  it('refuses a signed-out caller, a revoked session and an operator', async () => {
    expect(
      (await failure(setUp({ tier: null }).stepUps.obtain('refund.authorize', TOTP))).status,
    ).toBe(401);
    TestBed.resetTestingModule();
    expect(
      (await failure(setUp({ tier: 'operator' }).stepUps.obtain('refund.authorize', TOTP))).status,
    ).toBe(403);
    TestBed.resetTestingModule();
    const env = setUp();
    const req = await request(env, refund());
    env.auth.endSession(env.auth.signedIn());
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe(
      'sessionOrAuthorityRevoked',
    );
  });

  it.each<[string, (b: ReceiptBindingFor<'refund'>) => unknown]>([
    ['an unknown field', (b) => ({ ...b, note: 'x' })],
    [
      'a missing field',
      (b) => {
        const { paymentId, ...rest } = b;
        void paymentId;
        return rest;
      },
    ],
    ['the wrong audience', (b) => ({ ...b, audience: 'billing-service' })],
    ['a non-canonical id', (b) => ({ ...b, paymentId: 'NOT-A-UUID' })],
    ['a zero amount', (b) => ({ ...b, amount: 0 })],
    ['a lower-case currency', (b) => ({ ...b, currency: 'tnd' })],
    ['another Company', (b) => ({ ...b, companyId: id(99) })],
  ])(
    'refuses %s as receipt_binding_invalid, without spending the step-up',
    async (_name, change) => {
      const env = setUp();
      const req = await request(env, refund());
      const bad = { ...req, binding: change(req.binding) } as ReceiptIssueRequest<'refund'>;
      expect(receiptIssueFailureOf(await failure(env.receipts.issue(bad))).kind).toBe(
        'bindingInvalid',
      );
      expect((await firstValueFrom(env.receipts.issue(req))).simulated).toBe(true);
    },
  );

  it("accepts only a live step-up of exactly the operation's purpose, from this session, once", async () => {
    const env = setUp();
    const wrongPurpose = await firstValueFrom(env.stepUps.obtain('payment.dispute.decide', TOTP));
    const req = await request(env, refund());
    const mismatch = { ...req, stepUp: wrongPurpose } as unknown as ReceiptIssueRequest<'refund'>;
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(mismatch))).kind).toBe(
      'stepUpRefused',
    );
    await firstValueFrom(env.receipts.issue(req));
    const reused = { ...req, idempotencyKey: 'intent-key-0002' };
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(reused))).kind).toBe(
      'stepUpRefused',
    );
    const late = await request(env, refund(), 'intent-key-0003');
    env.clock.now += DEMO_RECEIPT_STEP_UP_LIFETIME_MS;
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(late))).kind).toBe(
      'stepUpRefused',
    );
  });

  it('refuses a step-up obtained in another session', async () => {
    const env = setUp();
    const req = await request(env, refund());
    env.auth.signedIn.set(
      env.auth.openSession(
        { userId: DEMO_OWNER_USER_ID, email: null, phone: null, adminTier: 'owner' },
        DEMO_OWNER_ID,
      ),
    );
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe(
      'stepUpRefused',
    );
  });

  it('applies Core replay rules: same key voids a live receipt, a different request is a key conflict', async () => {
    const env = setUp();
    const req = await request(env, refund());
    const issued = await firstValueFrom(env.receipts.issue(req));
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe('voided');
    expect(env.state.statusOf(issued.receiptId)).toBe('voided');
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe('voided');
    const other = { ...req, binding: { ...req.binding, amount: 999 } };
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(other))).kind).toBe(
      'idempotencyConflict',
    );
  });

  it('answers expired, then consumed, on replay', async () => {
    const env = setUp();
    const req = await request(env, refund());
    await firstValueFrom(env.receipts.issue(req));
    env.clock.now += DEMO_RECEIPT_LIFETIME_MS;
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe('expired');

    TestBed.resetTestingModule();
    const env2 = setUp();
    const req2 = await request(env2, refund());
    const issued = await firstValueFrom(env2.receipts.issue(req2));
    expect(
      env2.state.consume(
        issued.secret,
        req2.binding,
        'payment-service',
        id(50),
        true,
        env2.clock.now,
      ).ok,
    ).toBe(true);
    expect(receiptIssueFailureOf(await failure(env2.receipts.issue(req2))).kind).toBe(
      'alreadyConsumed',
    );
  });

  it('treats concurrent requests under one key as a replay, and under two keys as two receipts', async () => {
    const env = setUp();
    const first = await request(env, refund(), 'intent-key-0100');
    const second = await request(env, refund(), 'intent-key-0200');
    const [a, b] = await Promise.allSettled([
      firstValueFrom(env.receipts.issue(first)),
      firstValueFrom(env.receipts.issue({ ...first })),
    ]);
    expect(a.status).toBe('fulfilled');
    expect(b.status === 'rejected' && receiptIssueFailureOf(b.reason as AppError).kind).toBe(
      'voided',
    );
    expect((await firstValueFrom(env.receipts.issue(second))).simulated).toBe(true);
  });

  it.each<[ReceiptDemoScenario, string]>([
    ['outcomeUnknown', 'outcomeUnknown'],
    ['responseLost', 'outcomeUnknown'],
  ])(
    '%s: the receipt is recorded, nothing usable is returned, and a same-key replay voids it',
    async (scenario, kind) => {
      const env = setUp({ scenario });
      const req = await request(env, refund());
      expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe(kind);
      // Replaying the same key reaches Core's rules: the recorded receipt is voided, never re-issued with a secret.
      expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe('voided');
      expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe('voided');
    },
  );

  it('unavailable: changes nothing, so the same step-up still issues once the service answers', async () => {
    const env = setUp({ scenario: 'unavailable' });
    const req = await request(env, refund());
    expect(receiptIssueFailureOf(await failure(env.receipts.issue(req))).kind).toBe(
      'unavailableNoMutation',
    );
    expect(
      env.state.takeStepUp(
        req.stepUp.token,
        'refund.authorize',
        DEMO_OWNER_USER_ID,
        env.auth.signedIn()?.sessionId,
        env.clock.now,
      ),
    ).toBe(true);
  });
});

describe('DemoReceiptState.consume (simulated AUTH-02 for later consumer mocks)', () => {
  async function issued() {
    const env = setUp();
    const req = await request(env, refund());
    return { env, req, receipt: await firstValueFrom(env.receipts.issue(req)) };
  }

  it('consumes once; the same consumeRef replays, another is refused', async () => {
    const { env, req, receipt } = await issued();
    const now = env.clock.now;
    expect(
      env.state.consume(receipt.secret, req.binding, 'payment-service', id(60), true, now),
    ).toMatchObject({ ok: true, replayed: false });
    expect(
      env.state.consume(receipt.secret, req.binding, 'payment-service', id(60), true, now),
    ).toMatchObject({ ok: true, replayed: true });
    expect(
      env.state.consume(receipt.secret, req.binding, 'payment-service', id(61), true, now),
    ).toEqual({
      ok: false,
      refusal: 'receipt_already_consumed',
    });
  });

  it('refuses another binding, another audience, an expired receipt, a revoked issuer and a discarded secret', async () => {
    const { env, req, receipt } = await issued();
    const now = env.clock.now;
    const refuse = (refusal: string) => ({ ok: false, refusal });
    expect(
      env.state.consume(
        receipt.secret,
        { ...req.binding, amount: 1 },
        'payment-service',
        id(70),
        true,
        now,
      ),
    ).toEqual(refuse('receipt_invalid'));
    expect(
      env.state.consume(receipt.secret, req.binding, 'billing-service', id(70), true, now),
    ).toEqual(refuse('receipt_invalid'));
    expect(
      env.state.consume(receipt.secret, req.binding, 'payment-service', id(70), false, now),
    ).toEqual(refuse('authority_revoked'));
    expect(
      env.state.consume(
        receipt.secret,
        req.binding,
        'payment-service',
        id(70),
        true,
        now + DEMO_RECEIPT_LIFETIME_MS,
      ),
    ).toEqual(refuse('receipt_expired'));
    receipt.secret.discard();
    expect(
      env.state.consume(receipt.secret, req.binding, 'payment-service', id(70), true, now),
    ).toEqual(refuse('receipt_invalid'));
  });
});

describe('ReceiptHolderScope and secrecy', () => {
  it('discards on cancellation, on release, and when the session changes', async () => {
    const env = setUp();
    const scope = new ReceiptHolderScope(env.auth.signedIn()?.sessionId ?? null);
    const first = scope.track(
      (await firstValueFrom(env.receipts.issue(await request(env, refund(), 'intent-key-0301'))))
        .secret,
    );
    const second = scope.track(
      (await firstValueFrom(env.receipts.issue(await request(env, refund(), 'intent-key-0302'))))
        .secret,
    );
    scope.release(first);
    expect(first.held).toBe(false);
    expect(scope.discardIfSessionChanged(env.auth.signedIn()?.sessionId ?? null)).toBe(false);
    expect(second.held).toBe(true);
    env.auth.endSession(env.auth.signedIn());
    env.auth.signedIn.set(null);
    expect(scope.discardIfSessionChanged(null)).toBe(true);
    expect(second.held).toBe(false);
    expect(scope.size).toBe(0);
  });

  it('never writes to browser storage or the console while issuing and consuming', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m),
    );
    const env = setUp();
    const req = await request(env, refund());
    const receipt = await firstValueFrom(env.receipts.issue(req));
    env.state.consume(receipt.secret, req.binding, 'payment-service', id(80), true, env.clock.now);
    receipt.secret.discard();
    expect(setItem).not.toHaveBeenCalled();
    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
