import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import {
  DEMO_ENROLLMENT_ACCOUNT,
  DEMO_NEW_AUTHENTICATOR_CODE,
  DEMO_OPERATORS,
  DEMO_OWNER_ACCOUNT,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
} from '../../../core/auth/auth.fixtures';
import { MockAuthGateway } from '../../../core/auth/auth.mock';
import {
  DemoAuthState,
  FACTOR_ENROLLMENT_LIMIT,
  demoSecretKeyDigest,
} from '../../../core/auth/auth.mock-state';
import { DEMO_STEP_UP_LIFETIME_MS, MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import { AccountSecurity } from './account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  AccountSecurityDemoScenario,
  MockAccountSecurityGateway,
} from './account-security.mock';

const NOW = Date.parse('2026-10-25T09:30:00Z');

function setUp(scenario: AccountSecurityDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
      { provide: NW_CLOCK, useValue: () => NOW },
    ],
  });
  const state = TestBed.inject(DemoAuthState);
  const gateway = TestBed.runInInjectionContext(() => new MockAccountSecurityGateway());
  const signIn = (
    identity: typeof DEMO_OWNER_ACCOUNT.identity | (typeof DEMO_OPERATORS)[number]['identity'],
  ) => state.signedIn.set({ identity, businessIdentityId: null });
  return { state, gateway, signIn };
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('Account security mock (P9-S4a)', () => {
  it('answers the signed-in owner their own factors: the fixture’s TOTP and passkey, confirmed, with no invented time', async () => {
    const { gateway, signIn } = setUp();
    signIn(DEMO_OWNER_ACCOUNT.identity);
    const { factors } = await firstValueFrom(gateway.load());
    expect(
      factors.map(({ type, confirmed, createdAt, lastUsedAt }) => ({
        type,
        confirmed,
        createdAt,
        lastUsedAt,
      })),
    ).toEqual([
      { type: 'totp', confirmed: true, createdAt: null, lastUsedAt: null },
      { type: 'webauthn', confirmed: true, createdAt: null, lastUsedAt: null },
    ]);
  });

  it('carries only Core’s factor metadata: no seed, code, name, key, token or grant', async () => {
    const { gateway, signIn, state } = setUp();
    signIn(DEMO_OWNER_ACCOUNT.identity);
    const grant = state.issueStepUp(
      'platform.create',
      DEMO_OWNER_ACCOUNT.identity.userId,
      NOW + 60_000,
    );
    const security: AccountSecurity = await firstValueFrom(gateway.load());
    expect(Object.keys(security)).toEqual(['factors']);
    for (const f of security.factors)
      expect(Object.keys(f).sort()).toEqual(['confirmed', 'createdAt', 'id', 'lastUsedAt', 'type']);
    const json = JSON.stringify(security);
    for (const secret of [DEMO_TOTP_SECRET, DEMO_TOTP_CODE, DEMO_PASSWORD, grant, 'otpauth'])
      expect(json).not.toContain(secret);
  });

  it('returns a copy: changing the answer never changes the simulated records', async () => {
    const { gateway, signIn, state } = setUp();
    signIn(DEMO_OWNER_ACCOUNT.identity);
    const { factors } = await firstValueFrom(gateway.load());
    (factors[0] as { confirmed: boolean }).confirmed = false;
    expect(state.ownerFactors.get(DEMO_OWNER_ACCOUNT.identity.userId)?.[0]?.confirmed).toBe(true);
  });

  it('refuses every operator (403), whatever their assignments, and answers 401 without a session', async () => {
    const { gateway, signIn } = setUp();
    expect(await error(gateway.load())).toMatchObject({ kind: 'unauthenticated', status: 401 });
    for (const operator of DEMO_OPERATORS) {
      signIn(operator.identity);
      expect(await error(gateway.load())).toMatchObject({ kind: 'forbidden', status: 403 });
    }
  });

  it('another owner identity sees only its own factors (by the session, never a parameter)', async () => {
    const { gateway, signIn } = setUp();
    signIn(DEMO_ENROLLMENT_ACCOUNT.identity);
    expect((await firstValueFrom(gateway.load())).factors).toEqual([]);
  });

  it('can be unavailable (the error scenario)', async () => {
    const { gateway, signIn } = setUp('error');
    signIn(DEMO_OWNER_ACCOUNT.identity);
    expect(await error(gateway.load())).toMatchObject({ kind: 'unavailable', status: 503 });
  });

  it('records what the demo saw: a sign-in and a step-up set the proving factor’s last use, nothing else', async () => {
    const { gateway, state } = setUp();
    const auth = TestBed.runInInjectionContext(() => new MockAuthGateway());
    const outcome = await firstValueFrom(
      auth.login(DEMO_OWNER_ACCOUNT.identity.email, DEMO_PASSWORD),
    );
    if (outcome.kind !== 'mfa_required') throw new Error('expected mfa');
    await firstValueFrom(
      auth.verifyOwnerFactor(outcome.challenge.token, { method: 'totp', code: DEMO_TOTP_CODE }),
    );
    let { factors } = await firstValueFrom(gateway.load());
    expect(factors.find((f) => f.type === 'totp')?.lastUsedAt).toBe(new Date(NOW).toISOString());
    expect(factors.find((f) => f.type === 'webauthn')?.lastUsedAt).toBeNull();
    const stepUp = TestBed.runInInjectionContext(() => new MockStepUpGateway());
    await firstValueFrom(
      stepUp.obtain('platform.create', { method: 'passkey', assertion: { credential: null } }),
    );
    ({ factors } = await firstValueFrom(gateway.load()));
    expect(factors.find((f) => f.type === 'webauthn')?.lastUsedAt).toBe(
      new Date(NOW).toISOString(),
    );
    expect(state.ownerFactors.get(DEMO_OWNER_ACCOUNT.identity.userId)).toHaveLength(2);
  });

  it('an unfinished authenticator setup is listed unconfirmed, and only one is ever kept (like Core)', async () => {
    const { gateway, signIn, state } = setUp();
    signIn(DEMO_OWNER_ACCOUNT.identity);
    const userId = DEMO_OWNER_ACCOUNT.identity.userId;
    state.beginTotpFactor(userId, '2026-10-25T08:00:00.000Z');
    const second = state.beginTotpFactor(userId, '2026-10-25T09:00:00.000Z');
    const { factors } = await firstValueFrom(gateway.load());
    const unfinished = factors.filter((f) => !f.confirmed);
    expect(unfinished).toEqual([
      {
        id: second,
        type: 'totp',
        confirmed: false,
        createdAt: '2026-10-25T09:00:00.000Z',
        lastUsedAt: null,
      },
    ]);
    expect(factors.filter((f) => f.confirmed)).toHaveLength(2);
  });

  it('a factor added by first-factor enrollment carries its demo times', async () => {
    const { gateway, signIn } = setUp();
    const auth = TestBed.runInInjectionContext(() => new MockAuthGateway());
    const outcome = await firstValueFrom(
      auth.login(DEMO_ENROLLMENT_ACCOUNT.identity.email, DEMO_PASSWORD),
    );
    if (outcome.kind !== 'enrollment_required') throw new Error('expected enrollment');
    const setup = await firstValueFrom(auth.beginTotpEnrollment(outcome.enrollmentToken));
    await firstValueFrom(
      auth.confirmTotpEnrollment(outcome.enrollmentToken, setup.factorId, DEMO_TOTP_CODE),
    );
    signIn(DEMO_ENROLLMENT_ACCOUNT.identity);
    const at = new Date(NOW).toISOString();
    expect((await firstValueFrom(gateway.load())).factors).toEqual([
      { id: setup.factorId, type: 'totp', confirmed: true, createdAt: at, lastUsedAt: at },
    ]);
  });
});

describe('Account security mock: adding an authenticator (P9-S4b)', () => {
  const owner = DEMO_OWNER_ACCOUNT.identity;

  function setUpAdd(scenario: AccountSecurityDemoScenario = 'normal') {
    const clock = { now: NOW };
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
        { provide: NW_CLOCK, useValue: () => clock.now },
      ],
    });
    const state = TestBed.inject(DemoAuthState);
    const gateway = TestBed.runInInjectionContext(() => new MockAccountSecurityGateway());
    const stepUp = TestBed.runInInjectionContext(() => new MockStepUpGateway());
    state.signedIn.set({ identity: owner, businessIdentityId: null });
    const grant = async (code = DEMO_TOTP_CODE) =>
      (await firstValueFrom(stepUp.obtain('owner.factor.enroll', { method: 'totp', code }))).token;
    const factors = () => state.ownerFactors.get(owner.userId) ?? [];
    return { state, gateway, stepUp, grant, factors, clock };
  }

  it('begins an unconfirmed authenticator and leaves the confirmed factors untouched', async () => {
    const { gateway, factors } = setUpAdd();
    const before = factors().map((f) => ({ ...f }));
    const setup = await firstValueFrom(gateway.beginTotp());
    expect(setup.secret).toBe(DEMO_TOTP_SECRET);
    expect(setup.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(factors().slice(0, 2)).toEqual(before);
    expect(factors()[2]).toMatchObject({ id: setup.factorId, type: 'totp', confirmed: false });
    expect(factors()[2]?.createdAt).toBe(new Date(NOW).toISOString());
  });

  it('a second begin (another tab) replaces the unconfirmed one only; the first can then never be confirmed', async () => {
    const { gateway, grant, factors } = setUpAdd();
    const first = await firstValueFrom(gateway.beginTotp());
    const second = await firstValueFrom(gateway.beginTotp());
    expect(
      factors()
        .filter((f) => !f.confirmed)
        .map((f) => f.id),
    ).toEqual([second.factorId]);
    expect(factors().filter((f) => f.confirmed)).toHaveLength(2);
    const token = await grant();
    expect(
      await error(gateway.confirmTotp(first.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token)),
    ).toMatchObject({ kind: 'validation', code: 'verification_failed', status: 400 });
    // the refusal rolled back: the same grant still confirms the current setup
    await firstValueFrom(gateway.confirmTotp(second.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token));
    expect(factors().find((f) => f.id === second.factorId)?.confirmed).toBe(true);
  });

  it('confirms with the NEW app’s code and a live owner.factor.enroll grant, which it spends once', async () => {
    const { gateway, grant, factors, state } = setUpAdd();
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    await firstValueFrom(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token));
    expect(factors().find((f) => f.id === setup.factorId)).toMatchObject({
      confirmed: true,
      lastUsedAt: new Date(NOW).toISOString(),
    });
    expect(factors().filter((f) => f.confirmed)).toHaveLength(3);
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(false);
    // a second confirmation of the same (now confirmed) factor: the spent grant is refused first
    expect(
      await error(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token)),
    ).toMatchObject({ kind: 'forbidden', code: 'step_up_required', status: 403 });
  });

  it('a wrong new code is a definite 400 that spends nothing: the grant still works, the factor stays unconfirmed', async () => {
    const { gateway, grant, factors, state } = setUpAdd();
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    // the existing factor's code is not the new app's
    for (const wrong of [DEMO_TOTP_CODE, '000000'])
      expect(await error(gateway.confirmTotp(setup.factorId, wrong, token))).toMatchObject({
        kind: 'validation',
        code: 'verification_failed',
        status: 400,
      });
    expect(factors().find((f) => f.id === setup.factorId)?.confirmed).toBe(false);
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(true);
    await firstValueFrom(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token));
    expect(factors().find((f) => f.id === setup.factorId)?.confirmed).toBe(true);
  });

  it('a malformed request is 400 validation_error, before the grant is looked at', async () => {
    const { gateway, grant, state } = setUpAdd();
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    for (const [factorId, code] of [
      ['not-a-uuid', DEMO_NEW_AUTHENTICATOR_CODE],
      [setup.factorId, '12345'],
      [setup.factorId, '12a456'],
    ] as const)
      expect(await error(gateway.confirmTotp(factorId, code, token))).toMatchObject({
        kind: 'validation',
        code: 'validation_error',
      });
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(true);
  });

  it('refuses a grant of another purpose, of another owner, an expired one, or none (403 step_up_required)', async () => {
    const { gateway, state, stepUp, factors, clock } = setUpAdd();
    const setup = await firstValueFrom(gateway.beginTotp());
    const other = (
      await firstValueFrom(
        stepUp.obtain('platform.create', { method: 'totp', code: DEMO_TOTP_CODE }),
      )
    ).token;
    const someoneElse = state.issueStepUp(
      'owner.factor.enroll',
      DEMO_ENROLLMENT_ACCOUNT.identity.userId,
      NOW + 60_000,
    );
    const secretKeyProof = state.issueStepUp(
      'owner.factor.enroll',
      owner.userId,
      NOW + 60_000,
      'secret_key',
    );
    const expiring = state.issueStepUp('owner.factor.enroll', owner.userId, NOW + 1_000);
    clock.now = NOW + 2_000;
    for (const token of [other, someoneElse, secretKeyProof, expiring, 'demo-step-up-forged'])
      expect(
        await error(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token)),
      ).toMatchObject({ kind: 'forbidden', code: 'step_up_required', status: 403 });
    expect(factors().find((f) => f.id === setup.factorId)?.confirmed).toBe(false);
  });

  it('a step-up grant for adding a factor lasts the demo lifetime and accepts factors only', async () => {
    const { state, grant } = setUpAdd();
    const token = await grant();
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(true);
    expect(
      state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW + DEMO_STEP_UP_LIFETIME_MS),
    ).toBe(false);
    expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(false);
  });

  it('refuses operators (403) and answers 401 without a session, beginning nothing', async () => {
    const { gateway, state, factors } = setUpAdd();
    const count = factors().length;
    for (const operator of DEMO_OPERATORS) {
      state.signedIn.set({ identity: operator.identity, businessIdentityId: null });
      expect(await error(gateway.beginTotp())).toMatchObject({ kind: 'forbidden', status: 403 });
      expect(await error(gateway.confirmTotp('x', '123456', 't'))).toMatchObject({
        kind: 'forbidden',
        status: 403,
      });
    }
    state.signedIn.set(null);
    expect(await error(gateway.beginTotp())).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
    expect(factors()).toHaveLength(count);
  });

  it('throttles begins and confirmations together, like Core (429), changing nothing', async () => {
    const { gateway, factors, clock } = setUpAdd();
    for (let i = 0; i < FACTOR_ENROLLMENT_LIMIT.requests; i++)
      await firstValueFrom(gateway.beginTotp());
    const pending = factors().find((f) => !f.confirmed)?.id;
    expect(await error(gateway.beginTotp())).toMatchObject({ kind: 'rate_limited', status: 429 });
    expect(await error(gateway.confirmTotp(pending ?? '', '246810', 't'))).toMatchObject({
      kind: 'rate_limited',
    });
    expect(factors().find((f) => !f.confirmed)?.id).toBe(pending);
    clock.now = NOW + FACTOR_ENROLLMENT_LIMIT.windowMs + 1;
    await firstValueFrom(gateway.beginTotp());
  });

  it('a lost answer (confirmLost) is applied: the list shows the factor confirmed and the grant spent', async () => {
    const { gateway, grant, factors, state } = setUpAdd('confirmLost');
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    expect(
      await error(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token)),
    ).toMatchObject({ kind: 'network' });
    expect(factors().find((f) => f.id === setup.factorId)?.confirmed).toBe(true);
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(false);
  });

  it('an unavailable confirmation (503) applies nothing and spends nothing', async () => {
    const { gateway, grant, factors, state } = setUpAdd('confirmUnavailable');
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    expect(
      await error(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token)),
    ).toMatchObject({ kind: 'unavailable', status: 503 });
    expect(factors().find((f) => f.id === setup.factorId)?.confirmed).toBe(false);
    expect(state.checkStepUp(token, 'owner.factor.enroll', owner.userId, NOW)).toBe(true);
  });

  it('keeps no setup key, URI, code or grant with the factor records', async () => {
    const { gateway, grant, state } = setUpAdd();
    const setup = await firstValueFrom(gateway.beginTotp());
    const token = await grant();
    await firstValueFrom(gateway.confirmTotp(setup.factorId, DEMO_NEW_AUTHENTICATOR_CODE, token));
    const records = JSON.stringify([...state.ownerFactors.values()]);
    for (const secret of [
      setup.secret,
      'otpauth',
      DEMO_NEW_AUTHENTICATOR_CODE,
      DEMO_TOTP_CODE,
      token,
    ])
      expect(records).not.toContain(secret);
    const listed = JSON.stringify(await firstValueFrom(gateway.load()));
    for (const secret of [setup.secret, 'otpauth', token]) expect(listed).not.toContain(secret);
  });
});

describe('Account security mock: creating a new secret key (P9-S4c)', () => {
  const owner = DEMO_OWNER_ACCOUNT.identity;
  const KEY_SHAPE = /^([A-Z2-9]{4}-){12}[A-Z2-9]{4}$/;

  function setUpKey(scenario: AccountSecurityDemoScenario = 'normal') {
    const clock = { now: NOW };
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
        { provide: NW_CLOCK, useValue: () => clock.now },
      ],
    });
    const state = TestBed.inject(DemoAuthState);
    const gateway = TestBed.runInInjectionContext(() => new MockAccountSecurityGateway());
    const stepUp = TestBed.runInInjectionContext(() => new MockStepUpGateway());
    state.signedIn.set({ identity: owner, businessIdentityId: null });
    const grant = async () =>
      (
        await firstValueFrom(
          stepUp.obtain('owner.secret_key.rotate', { method: 'totp', code: DEMO_TOTP_CODE }),
        )
      ).token;
    const works = async (key: string, userId = owner.userId) =>
      state.secretKeyMatches(userId, await demoSecretKeyDigest(key));
    return { state, gateway, grant, works, clock };
  }

  it('creates a key with a live owner.secret_key.rotate grant: 13 groups of 4, issued now; only its digest is kept', async () => {
    const { gateway, grant, works } = setUpKey();
    const issue = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    expect(Object.keys(issue).sort()).toEqual(['issuedAt', 'secretKey']);
    expect(issue.secretKey).toMatch(KEY_SHAPE);
    expect(issue.issuedAt).toBe(new Date(NOW).toISOString());
    expect(await works(issue.secretKey)).toBe(true);
    // separators and case do not matter to the verifier
    expect(await works(issue.secretKey.replace(/-/g, ' ').toLowerCase())).toBe(true);
  });

  it('the first key and a replacement are the same call; every call makes a new key and the previous one stops working', async () => {
    const { gateway, grant, works } = setUpKey();
    const first = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    const second = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    expect(second.secretKey).not.toBe(first.secretKey);
    expect(await works(first.secretKey)).toBe(false);
    expect(await works(second.secretKey)).toBe(true);
  });

  it('spends the grant with the change: the same grant never creates a second key', async () => {
    const { gateway, grant, works } = setUpKey();
    const token = await grant();
    const issued = await firstValueFrom(gateway.rotateSecretKey(token));
    expect(await error(gateway.rotateSecretKey(token))).toMatchObject({
      kind: 'forbidden',
      code: 'step_up_required',
      status: 403,
    });
    expect(await works(issued.secretKey)).toBe(true);
  });

  it('refuses a grant of another purpose, of another owner, proved by the secret key, expired, forged or missing (403): nothing changes', async () => {
    const { gateway, state, grant, works, clock } = setUpKey();
    const current = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    const enroll = state.issueStepUp('owner.factor.enroll', owner.userId, NOW + 60_000);
    const someoneElse = state.issueStepUp(
      'owner.secret_key.rotate',
      DEMO_ENROLLMENT_ACCOUNT.identity.userId,
      NOW + 60_000,
    );
    const secretKeyProof = state.issueStepUp(
      'owner.secret_key.rotate',
      owner.userId,
      NOW + 60_000,
      'secret_key',
    );
    const expiring = state.issueStepUp('owner.secret_key.rotate', owner.userId, NOW + 1_000);
    clock.now = NOW + 2_000;
    for (const token of [enroll, someoneElse, secretKeyProof, expiring, 'demo-step-up-forged', ''])
      expect(await error(gateway.rotateSecretKey(token))).toMatchObject({
        kind: 'forbidden',
        code: 'step_up_required',
        status: 403,
      });
    expect(await works(current.secretKey)).toBe(true);
    // the refused grants were not spent
    expect(state.checkStepUp(enroll, 'owner.factor.enroll', owner.userId, clock.now)).toBe(true);
  });

  it('refuses every operator (403) and answers 401 without a session, creating nothing', async () => {
    const { gateway, state } = setUpKey();
    const operator = DEMO_OPERATORS[0];
    if (!operator) throw new Error('no operator fixture');
    const token = state.issueStepUp(
      'owner.secret_key.rotate',
      operator.identity.userId,
      NOW + 60_000,
    );
    state.signedIn.set({ identity: operator.identity, businessIdentityId: null });
    expect(await error(gateway.rotateSecretKey(token))).toMatchObject({ status: 403 });
    state.signedIn.set(null);
    expect(await error(gateway.rotateSecretKey(token))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
    expect(state.checkStepUp(token, 'owner.secret_key.rotate', operator.identity.userId, NOW)).toBe(
      true,
    );
  });

  it('the uncertain scenarios commit: a lost answer, a 500 and a 200 without a key all replace the verifier and spend the grant', async () => {
    for (const [scenario, expected] of [
      ['rotateLost', { kind: 'network' }],
      ['rotateServerError', { kind: 'unexpected', status: 500 }],
    ] as const) {
      TestBed.resetTestingModule();
      const { gateway, state, grant, works } = setUpKey(scenario);
      state.replaceSecretKeyVerifier(owner.userId, await demoSecretKeyDigest('OLD'), 'x');
      const token = await grant();
      expect(await error(gateway.rotateSecretKey(token))).toMatchObject(expected);
      expect(await works('OLD')).toBe(false);
      expect(state.checkStepUp(token, 'owner.secret_key.rotate', owner.userId, NOW)).toBe(false);
    }
    TestBed.resetTestingModule();
    const { gateway, state, grant, works } = setUpKey('rotateIncomplete');
    state.replaceSecretKeyVerifier(owner.userId, await demoSecretKeyDigest('OLD'), 'x');
    const issue = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    expect(issue.secretKey).toBe('');
    expect(await works('OLD')).toBe(false);
  });

  it('a throttled request (429) changes nothing and spends nothing', async () => {
    const { gateway, state, grant, works } = setUpKey('rotateRateLimited');
    state.replaceSecretKeyVerifier(owner.userId, await demoSecretKeyDigest('OLD'), 'x');
    const token = await grant();
    expect(await error(gateway.rotateSecretKey(token))).toMatchObject({
      kind: 'rate_limited',
      status: 429,
    });
    expect(await works('OLD')).toBe(true);
    expect(state.checkStepUp(token, 'owner.secret_key.rotate', owner.userId, NOW)).toBe(true);
  });

  it('the key cannot be read back: no gateway read carries it and the simulated state keeps no plaintext', async () => {
    const { gateway, state, grant } = setUpKey();
    const { secretKey } = await firstValueFrom(gateway.rotateSecretKey(await grant()));
    const compact = secretKey.replace(/-/g, '');
    const security = await firstValueFrom(gateway.load());
    expect(JSON.stringify(security)).not.toContain(compact.slice(0, 8));
    const methods = Object.getOwnPropertyNames(MockAccountSecurityGateway.prototype);
    expect(methods.sort()).toEqual(
      [
        'beginTotp',
        'confirmTotp',
        'constructor',
        'fail',
        'load',
        'owner',
        'removeFactor',
        'rotateSecretKey',
      ].sort(),
    );
    const dump = JSON.stringify(
      Object.values(state).map((v: unknown) => (v instanceof Map ? [...v.entries()] : v)),
    );
    for (const fragment of [secretKey, compact, compact.slice(0, 12)])
      expect(dump).not.toContain(fragment);
  });
});

describe('Account security mock: removing a factor (P9-S4d)', () => {
  const owner = DEMO_OWNER_ACCOUNT.identity;
  const other = DEMO_ENROLLMENT_ACCOUNT.identity;

  function setUpRemove(scenario: AccountSecurityDemoScenario = 'normal') {
    const clock = { now: NOW };
    TestBed.configureTestingModule({
      providers: [
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
        { provide: NW_CLOCK, useValue: () => clock.now },
      ],
    });
    const state = TestBed.inject(DemoAuthState);
    const gateway = TestBed.runInInjectionContext(() => new MockAccountSecurityGateway());
    const stepUp = TestBed.runInInjectionContext(() => new MockStepUpGateway());
    state.signedIn.set({ identity: owner, businessIdentityId: null });
    const grant = async () =>
      (
        await firstValueFrom(
          stepUp.obtain('owner.factor.remove', { method: 'totp', code: DEMO_TOTP_CODE }),
        )
      ).token;
    const factors = () => state.ownerFactors.get(owner.userId) ?? [];
    /** A second confirmed authenticator, so that one can be removed. */
    const second = () => {
      const id = state.beginTotpFactor(owner.userId, '2026-10-25T09:00:00.000Z');
      state.confirmTotpFactor(owner.userId, id, '2026-10-25T09:01:00.000Z');
      return id;
    };
    const done = (source: Observable<void>) =>
      new Promise<void>((resolve, reject) =>
        source.subscribe({ complete: resolve, error: reject }),
      );
    return { state, gateway, grant, factors, second, clock, done };
  }

  it('removes the owner’s confirmed factor with a live owner.factor.remove grant (204), spending it once', async () => {
    const { gateway, state, grant, factors, second, done } = setUpRemove();
    const id = second();
    const token = await grant();
    await done(gateway.removeFactor(id, token));
    expect(factors().some((f) => f.id === id)).toBe(false);
    expect(factors().filter((f) => f.confirmed)).toHaveLength(2);
    expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(false);
  });

  it('cancels the owner’s pending enrollment and leaves an unfinished setup and the session as they were', async () => {
    const { gateway, state, grant, factors, second, done } = setUpRemove();
    const id = second();
    const pending = state.beginTotpFactor(owner.userId, '2026-10-25T09:05:00.000Z');
    for (const [token, account] of [
      ['enroll-owner', DEMO_OWNER_ACCOUNT],
      ['enroll-other', DEMO_ENROLLMENT_ACCOUNT],
    ] as const)
      state.enrollments.set(token, {
        account,
        expiresAt: NOW + 60_000,
        factorId: null,
        attemptsLeft: 5,
      });
    await done(gateway.removeFactor(id, await grant()));
    expect([...state.enrollments.keys()]).toEqual(['enroll-other']);
    expect(factors().find((f) => f.id === pending)?.confirmed).toBe(false);
    expect(state.signedIn()?.identity.userId).toBe(owner.userId);
  });

  it('refuses in Core’s order: a malformed id (400) before the grant, which is not spent', async () => {
    const { gateway, state, grant } = setUpRemove();
    const token = await grant();
    expect(await error(gateway.removeFactor('not-a-uuid', token))).toMatchObject({
      kind: 'validation',
      code: 'validation_error',
      status: 400,
    });
    expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(true);
  });

  it('refuses a grant of another purpose, of another owner, proved by the secret key, expired, forged or missing (403)', async () => {
    const { gateway, state, factors, second, clock } = setUpRemove();
    const id = second();
    const tokens = [
      state.issueStepUp('owner.factor.enroll', owner.userId, NOW + 60_000),
      state.issueStepUp('owner.factor.remove', other.userId, NOW + 60_000),
      state.issueStepUp('owner.factor.remove', owner.userId, NOW + 60_000, 'secret_key'),
      state.issueStepUp('owner.factor.remove', owner.userId, NOW + 1_000),
    ];
    clock.now = NOW + 2_000;
    for (const token of [...tokens, 'demo-step-up-forged', ''])
      expect(await error(gateway.removeFactor(id, token))).toMatchObject({
        kind: 'forbidden',
        code: 'step_up_required',
        status: 403,
      });
    expect(factors().some((f) => f.id === id)).toBe(true);
  });

  it('answers 404 for an unknown factor, another owner’s, or one already removed; the grant stays unspent', async () => {
    const { gateway, state, grant, second, done } = setUpRemove();
    const id = second();
    const othersFactor = state.ownerFactors.get(other.userId)?.[0]?.id ?? crypto.randomUUID();
    await done(gateway.removeFactor(id, await grant()));
    const token = await grant();
    for (const target of [id, othersFactor, crypto.randomUUID()])
      expect(await error(gateway.removeFactor(target, token))).toMatchObject({
        kind: 'not_found',
        status: 404,
      });
    expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(true);
  });

  it('keeps the last confirmed factor (409 factor_required), even with an unfinished setup beside it', async () => {
    const { gateway, state, grant, factors, done } = setUpRemove();
    const [totp, passkey] = factors();
    if (!totp || !passkey) throw new Error('fixture factors');
    await done(gateway.removeFactor(passkey.id, await grant()));
    state.beginTotpFactor(owner.userId, '2026-10-25T09:05:00.000Z');
    const token = await grant();
    expect(await error(gateway.removeFactor(totp.id, token))).toMatchObject({
      kind: 'conflict',
      code: 'factor_required',
      status: 409,
    });
    expect(factors().find((f) => f.id === totp.id)?.confirmed).toBe(true);
    expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(true);
  });

  it('refuses operators (403) and answers 401 without a session, removing nothing', async () => {
    const { gateway, state, factors } = setUpRemove();
    const operator = DEMO_OPERATORS[0];
    if (!operator) throw new Error('no operator fixture');
    const id = factors()[0]?.id ?? '';
    state.signedIn.set({ identity: operator.identity, businessIdentityId: null });
    expect(await error(gateway.removeFactor(id, 'x'))).toMatchObject({ status: 403 });
    state.signedIn.set(null);
    expect(await error(gateway.removeFactor(id, 'x'))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
    expect(factors().some((f) => f.id === id)).toBe(true);
  });

  it('the uncertain scenarios commit: a lost answer and a 500 both remove the factor and spend the grant', async () => {
    for (const [scenario, expected] of [
      ['removeLost', { kind: 'network' }],
      ['removeServerError', { kind: 'unexpected', status: 500 }],
    ] as const) {
      TestBed.resetTestingModule();
      const { gateway, state, grant, factors, second } = setUpRemove(scenario);
      const id = second();
      const token = await grant();
      expect(await error(gateway.removeFactor(id, token))).toMatchObject(expected);
      expect(factors().some((f) => f.id === id)).toBe(false);
      expect(state.checkStepUp(token, 'owner.factor.remove', owner.userId, NOW)).toBe(false);
    }
  });
});
