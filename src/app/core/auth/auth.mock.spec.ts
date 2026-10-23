import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { DEMO_DRIVE_PLATFORM_ID } from '../context/scope-directory.fixtures';
import { AppError } from '../errors/app-error';
import {
  DEMO_CONFIRMATION_CODE,
  DEMO_NEW_OPERATORS,
  DEMO_PASSWORD,
  DEMO_SIGN_IN_HINT,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
  DEMO_WORKING_CODE,
} from './auth.fixtures';
import { MockAuthGateway } from './auth.mock';
import { DemoAuthState } from './auth.mock-state';
import { OperatorIdentifier } from './operator-identifier';

const SCHOOL_OPERATOR: OperatorIdentifier = {
  kind: 'email',
  email: 'operator.school@demo.nawara.invalid',
};
const PHONE_OPERATOR: OperatorIdentifier = { kind: 'phone', phone: '+99900000001' };

function gateway() {
  TestBed.configureTestingModule({
    providers: [MockAuthGateway, { provide: DEMO_LATENCY_MS, useValue: 0 }],
  });
  return TestBed.inject(MockAuthGateway);
}

async function error(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockAuthGateway: working code (demo only)', () => {
  it('answers every well-formed request alike, known or not', async () => {
    const mock = gateway();
    await expect(firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR))).resolves.toBeUndefined();
    await expect(
      firstValueFrom(mock.requestWorkingCode({ kind: 'email', email: 'nobody@demo.invalid' })),
    ).resolves.toBeUndefined();
  });

  it('accepts the code only after a request, and only once', async () => {
    const mock = gateway();
    expect(await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).toMatchObject({
      status: 401,
      code: 'operator_code_invalid',
    });
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    await firstValueFrom(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE));
    expect((await firstValueFrom(mock.me())).adminTier).toBe('operator');
    await firstValueFrom(mock.logout());
    expect((await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).status).toBe(
      401,
    );
  });

  it('kills a code after five wrong guesses, like Core, until a new one is requested', async () => {
    const mock = gateway();
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    for (let i = 0; i < 5; i++) await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, '111111'));
    expect((await error(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE))).status).toBe(
      401,
    );
    await firstValueFrom(mock.requestWorkingCode(SCHOOL_OPERATOR));
    await expect(
      firstValueFrom(mock.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE)),
    ).resolves.toBeUndefined();
  });

  it('signs in the phone-only operator with no email', async () => {
    const mock = gateway();
    await firstValueFrom(mock.requestWorkingCode(PHONE_OPERATOR));
    await firstValueFrom(mock.verifyWorkingCode(PHONE_OPERATOR, DEMO_WORKING_CODE));
    expect(await firstValueFrom(mock.me())).toMatchObject({ email: null, phone: '+99900000001' });
    expect((await firstValueFrom(mock.grants())).platformAssignments).toEqual([
      DEMO_DRIVE_PLATFORM_ID,
    ]);
    expect(await firstValueFrom(mock.platformAccess(DEMO_DRIVE_PLATFORM_ID))).toBe(true);
  });

  it('simulates the rate-limited and unavailable scenarios', async () => {
    const mock = gateway();
    const at = (name: string): OperatorIdentifier => ({
      kind: 'email',
      email: `operator.${name}@demo.nawara.invalid`,
    });
    expect((await error(mock.requestWorkingCode(at('busy')))).status).toBe(429);
    await firstValueFrom(mock.requestWorkingCode(at('limited')));
    expect((await error(mock.verifyWorkingCode(at('limited'), DEMO_WORKING_CODE))).status).toBe(
      429,
    );
    await firstValueFrom(mock.requestWorkingCode(at('offline')));
    expect((await error(mock.verifyWorkingCode(at('offline'), DEMO_WORKING_CODE))).kind).toBe(
      'unavailable',
    );
  });
});

describe('MockAuthGateway: contact confirmation (demo only)', () => {
  const NEW: OperatorIdentifier = { kind: 'email', email: 'operator.new@demo.nawara.invalid' };
  const at = (name: string): OperatorIdentifier => ({
    kind: 'email',
    email: `operator.new.${name}@demo.nawara.invalid`,
  });

  it('issues no working code before confirmation, then confirms without signing in', async () => {
    const mock = gateway();
    await firstValueFrom(mock.requestWorkingCode(NEW));
    expect(await error(mock.verifyWorkingCode(NEW, DEMO_WORKING_CODE))).toMatchObject({
      code: 'operator_code_invalid',
    });
    await expect(
      firstValueFrom(mock.confirmOperatorContact(NEW, DEMO_CONFIRMATION_CODE)),
    ).resolves.toBeUndefined();
    expect((await error(mock.me())).status).toBe(401);
    // Confirmation issues no working code: none is accepted until one is requested.
    expect(await error(mock.verifyWorkingCode(NEW, DEMO_WORKING_CODE))).toMatchObject({
      code: 'operator_code_invalid',
    });
    await firstValueFrom(mock.requestWorkingCode(NEW));
    await expect(
      firstValueFrom(mock.verifyWorkingCode(NEW, DEMO_WORKING_CODE)),
    ).resolves.toBeUndefined();
  });

  it('answers a confirmed contact with 204 without checking the code, like Core', async () => {
    const mock = gateway();
    await expect(
      firstValueFrom(mock.confirmOperatorContact(SCHOOL_OPERATOR, '999999')),
    ).resolves.toBeUndefined();
  });

  it('refuses everything else with the one generic 401, and kills the code after five wrong guesses', async () => {
    const mock = gateway();
    const unknown: OperatorIdentifier = { kind: 'email', email: 'nobody@demo.nawara.invalid' };
    expect(await error(mock.confirmOperatorContact(unknown, DEMO_CONFIRMATION_CODE))).toMatchObject(
      { code: 'operator_code_invalid' },
    );
    expect(await error(mock.confirmOperatorContact(NEW, '5318'))).toMatchObject({
      code: 'operator_code_invalid',
    });
    for (let i = 0; i < 4; i++) await error(mock.confirmOperatorContact(NEW, '000000'));
    expect(await error(mock.confirmOperatorContact(NEW, DEMO_CONFIRMATION_CODE))).toMatchObject({
      code: 'operator_code_invalid',
    });
  });

  it('simulates the rate-limited and unavailable scenarios', async () => {
    const mock = gateway();
    expect(
      (await error(mock.confirmOperatorContact(at('limited'), DEMO_CONFIRMATION_CODE))).kind,
    ).toBe('rate_limited');
    expect(
      (await error(mock.confirmOperatorContact(at('offline'), DEMO_CONFIRMATION_CODE))).kind,
    ).toBe('unavailable');
  });
});

describe('MockAuthGateway: owner authenticator enrollment (demo only)', () => {
  async function enrollmentToken(mock: MockAuthGateway, email: string): Promise<string> {
    const outcome = await firstValueFrom(mock.login(email, DEMO_PASSWORD));
    if (outcome.kind !== 'enrollment_required') throw new Error('expected enrollment_required');
    return outcome.enrollmentToken;
  }

  it('begins a setup with the fictional key and an otpauth URI, then signs in on the right code', async () => {
    const mock = gateway();
    const token = await enrollmentToken(mock, 'enrollment@demo.nawara.invalid');
    const setup = await firstValueFrom(mock.beginTotpEnrollment(token));
    expect(setup.secret).toBe(DEMO_TOTP_SECRET);
    expect(setup.otpauthUri).toBe(
      `otpauth://totp/Nawara%20Admin:enrollment%40demo.nawara.invalid?secret=${DEMO_TOTP_SECRET}&issuer=Nawara%20Admin&algorithm=SHA1&digits=6&period=30`,
    );
    await firstValueFrom(mock.confirmTotpEnrollment(token, setup.factorId, DEMO_TOTP_CODE));
    expect((await firstValueFrom(mock.me())).email).toBe('enrollment@demo.nawara.invalid');
    // The token is used up; the next sign-in asks for the code.
    expect(await error(mock.confirmTotpEnrollment(token, setup.factorId, DEMO_TOTP_CODE))).toEqual(
      expect.objectContaining({ status: 401 }),
    );
    const next = await firstValueFrom(mock.login('enrollment@demo.nawara.invalid', DEMO_PASSWORD));
    expect(next.kind).toBe('mfa_required');
  });

  it('follows Core’s five-attempt boundary: the fifth refusal is still 400, then the token is dead (401)', async () => {
    const mock = gateway();
    const token = await enrollmentToken(mock, 'enrollment@demo.nawara.invalid');
    const { factorId } = await firstValueFrom(mock.beginTotpEnrollment(token));
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect((await error(mock.confirmTotpEnrollment(token, factorId, '000000'))).status).toBe(400);
    }
    // The fifth refusal answers its own 400 and consumes the token (`recordFailure`).
    expect(await error(mock.confirmTotpEnrollment(token, factorId, '000000'))).toEqual({
      kind: 'validation',
      messages: [],
      status: 400,
    });
    // Afterwards Core no longer finds the token: even the right code, and a new begin, are 401.
    expect(await error(mock.confirmTotpEnrollment(token, factorId, DEMO_TOTP_CODE))).toEqual({
      kind: 'unauthenticated',
      code: 'verification_failed',
      status: 401,
    });
    expect((await error(mock.beginTotpEnrollment(token))).status).toBe(401);
  });

  it('accepts the right code after four refusals', async () => {
    const mock = gateway();
    const token = await enrollmentToken(mock, 'enrollment@demo.nawara.invalid');
    const { factorId } = await firstValueFrom(mock.beginTotpEnrollment(token));
    for (let attempt = 1; attempt <= 4; attempt++) {
      await error(mock.confirmTotpEnrollment(token, factorId, '000000'));
    }
    await expect(
      firstValueFrom(mock.confirmTotpEnrollment(token, factorId, DEMO_TOTP_CODE)),
    ).resolves.toBeUndefined();
  });

  it('refuses an unknown token (401), and counts a factor that is not the one begun as a refused code (400)', async () => {
    const mock = gateway();
    expect((await error(mock.beginTotpEnrollment('unknown'))).status).toBe(401);
    const token = await enrollmentToken(mock, 'enrollment@demo.nawara.invalid');
    const { factorId } = await firstValueFrom(mock.beginTotpEnrollment(token));
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect((await error(mock.confirmTotpEnrollment(token, 'other', DEMO_TOTP_CODE))).status).toBe(
        400,
      );
    }
    expect((await error(mock.confirmTotpEnrollment(token, factorId, '000000'))).status).toBe(400);
    expect((await error(mock.confirmTotpEnrollment(token, factorId, DEMO_TOTP_CODE))).status).toBe(
      401,
    );
  });

  it.each([
    ['enrollment.enrolled@demo.nawara.invalid', 'begin', 403],
    ['enrollment.unavailable@demo.nawara.invalid', 'begin', 503],
    ['enrollment.busy@demo.nawara.invalid', 'begin', 429],
    ['enrollment.limited@demo.nawara.invalid', 'confirm', 429],
    ['enrollment.offline@demo.nawara.invalid', 'confirm', 503],
  ] as const)('simulates %s on %s (%i)', async (email, step, status) => {
    const mock = gateway();
    const token = await enrollmentToken(mock, email);
    if (step === 'begin') {
      expect((await error(mock.beginTotpEnrollment(token))).status).toBe(status);
      return;
    }
    const { factorId } = await firstValueFrom(mock.beginTotpEnrollment(token));
    expect((await error(mock.confirmTotpEnrollment(token, factorId, DEMO_TOTP_CODE))).status).toBe(
      status,
    );
  });
});

describe('MockAuthGateway: enrollment answer order, as in Core (A4-S4 remediation)', () => {
  async function tokenFor(mock: MockAuthGateway, email: string): Promise<string> {
    const outcome = await firstValueFrom(mock.login(email, DEMO_PASSWORD));
    if (outcome.kind !== 'enrollment_required') throw new Error('expected enrollment_required');
    return outcome.enrollmentToken;
  }

  it('answers a dead token 401 before any simulated 429, on both routes', async () => {
    const mock = gateway();
    expect((await error(mock.beginTotpEnrollment('unknown-token'))).status).toBe(401);
    const token = await tokenFor(mock, 'enrollment.busy@demo.nawara.invalid');
    expect((await error(mock.beginTotpEnrollment(token))).status).toBe(429);
    expect(
      (await error(mock.confirmTotpEnrollment('unknown-token', 'f', DEMO_TOTP_CODE))).status,
    ).toBe(401);
  });

  it('answers 403 factor_already_enrolled on confirmation too, without counting an attempt', async () => {
    const mock = gateway();
    const token = await tokenFor(mock, 'enrollment.enrolled@demo.nawara.invalid');
    for (let attempt = 1; attempt <= 6; attempt++) {
      expect(await error(mock.confirmTotpEnrollment(token, 'f', '000000'))).toEqual(
        expect.objectContaining({ status: 403, code: 'factor_already_enrolled' }),
      );
    }
  });
});

describe('demo sign-in hint: enrollment scenario labels', () => {
  it('labels each enrollment account by its own scenario', () => {
    const roles = Object.fromEntries(DEMO_SIGN_IN_HINT.accounts.map((a) => [a.email, a.roleKey]));
    expect(roles).toMatchObject({
      'enrollment@demo.nawara.invalid': 'auth.demo.enrollment',
      'enrollment.enrolled@demo.nawara.invalid': 'auth.demo.enrollmentAlready',
      'enrollment.limited@demo.nawara.invalid': 'auth.demo.enrollmentConfirmLimited',
      'enrollment.offline@demo.nawara.invalid': 'auth.demo.enrollmentConfirmUnavailable',
      'enrollment.unavailable@demo.nawara.invalid': 'auth.demo.enrollmentBeginUnavailable',
      'enrollment.busy@demo.nawara.invalid': 'auth.demo.enrollmentBeginLimited',
    });
  });
});

describe('MockAuthGateway: one simulated Auth service across route injectors (A3-S3)', () => {
  /** Two route injectors, as the sign-in routes and the shell each bind their own mock instance. */
  function twoRoutes() {
    TestBed.configureTestingModule({ providers: [{ provide: DEMO_LATENCY_MS, useValue: 0 }] });
    const root = TestBed.inject(EnvironmentInjector);
    const route = () => createEnvironmentInjector([MockAuthGateway], root).get(MockAuthGateway);
    return { signInRoute: route(), shell: route(), state: TestBed.inject(DemoAuthState) };
  }

  it('gives each route its own instance, over the same state', () => {
    const { signInRoute, shell, state } = twoRoutes();
    expect(signInRoute).not.toBe(shell);
    expect(TestBed.inject(DemoAuthState)).toBe(state);
  });

  it('ends, from the shell, the session the sign-in pages opened', async () => {
    const { signInRoute, shell, state } = twoRoutes();
    await firstValueFrom(signInRoute.requestWorkingCode(SCHOOL_OPERATOR));
    await firstValueFrom(signInRoute.verifyWorkingCode(SCHOOL_OPERATOR, DEMO_WORKING_CODE));
    expect((await firstValueFrom(shell.me())).email).toBe('operator.school@demo.nawara.invalid');
    await firstValueFrom(shell.logout());
    expect(state.signedIn()).toBeNull();
    expect((await error(signInRoute.me())).status).toBe(401);
    expect((await error(signInRoute.grants())).status).toBe(401);
  });

  it('keeps Core records through a sign-out: an enrolled owner is asked for the code next time', async () => {
    const { signInRoute, shell } = twoRoutes();
    const outcome = await firstValueFrom(
      signInRoute.login('enrollment@demo.nawara.invalid', DEMO_PASSWORD),
    );
    if (outcome.kind !== 'enrollment_required') throw new Error('expected enrollment_required');
    const setup = await firstValueFrom(signInRoute.beginTotpEnrollment(outcome.enrollmentToken));
    await firstValueFrom(
      signInRoute.confirmTotpEnrollment(outcome.enrollmentToken, setup.factorId, DEMO_TOTP_CODE),
    );
    await firstValueFrom(shell.logout());
    const next = await firstValueFrom(
      signInRoute.login('enrollment@demo.nawara.invalid', DEMO_PASSWORD),
    );
    expect(next.kind).toBe('mfa_required');
  });

  it('keeps a confirmed operator contact through a sign-out', async () => {
    const { signInRoute, shell, state } = twoRoutes();
    const fresh: OperatorIdentifier = { kind: 'email', email: 'operator.new@demo.nawara.invalid' };
    const userId = DEMO_NEW_OPERATORS[0]?.identity.userId ?? '';
    expect(state.confirmedOperators.has(userId)).toBe(false);
    await firstValueFrom(signInRoute.confirmOperatorContact(fresh, DEMO_CONFIRMATION_CODE));
    await firstValueFrom(shell.logout());
    expect(state.confirmedOperators.has(userId)).toBe(true);
    // Already confirmed: 204 without checking the code, as Core answers.
    await firstValueFrom(signInRoute.confirmOperatorContact(fresh, '000000'));
  });
});
