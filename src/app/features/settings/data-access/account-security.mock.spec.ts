import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import {
  DEMO_ENROLLMENT_ACCOUNT,
  DEMO_OPERATORS,
  DEMO_OWNER_ACCOUNT,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
} from '../../../core/auth/auth.fixtures';
import { MockAuthGateway } from '../../../core/auth/auth.mock';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
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
