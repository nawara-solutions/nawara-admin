import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import {
  FactorProof,
  Grants,
  Identity,
  LoginOutcome,
  PasskeyAssertion,
  PasskeyRequest,
} from '../../../core/auth/auth.model';
import { AuthSession } from '../../../core/auth/auth-session';
import { OperatorIdentifier } from '../../../core/auth/operator-identifier';
import { PasskeyPromptError, WebAuthnClient } from '../../../core/auth/webauthn-client';
import {
  APP_ENVIRONMENT,
  AppEnvironment,
  DemoBindings,
} from '../../../core/config/app-environment';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../../../core/context/scope-directory.gateway';
import { companyId, platformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import {
  AUTH_ACCEPTED_PAUSE_MS,
  AuthFlowFacade,
  WORKING_CODE_PATH,
  WORKING_CODE_VERIFY_PATH,
  signInProblemOf,
  verifyProblemOf,
  workingCodeProblemOf,
  contactConfirmationProblemOf,
} from './auth-flow.facade';

const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
  },
};
const DEMO_BUILD: AppEnvironment = { production: false, demo: { load: async () => DEMO } };

const OWNER: Identity = { userId: 'o', email: 'owner@x.invalid', phone: null, adminTier: 'owner' };
const OWNER_GRANTS: Grants = { companyId: companyId('company'), platformAssignments: [] };
const MEMBER: Identity = { userId: 'm', email: 'member@x.invalid', phone: null, adminTier: null };
const NO_GRANTS: Grants = { companyId: null, platformAssignments: [] };

const fail = <T>(error: AppError): Observable<T> => throwError(() => error);

/** A scripted gateway: each method answers what the test sets. */
class FakeGateway extends AuthGateway {
  loginAnswer: Observable<LoginOutcome> = of({
    kind: 'mfa_required',
    challenge: { token: 'challenge-1', methods: ['totp', 'passkey'] },
  });
  verifyAnswer: Observable<void> = of(undefined);
  identity: Identity = OWNER;
  grantsAnswer: Grants = OWNER_GRANTS;
  readonly proofs: { challenge: string; proof: FactorProof }[] = [];
  requestCodeAnswer: Observable<void> = of(undefined);
  verifyCodeAnswer: Observable<void> = of(undefined);
  readonly codeRequests: OperatorIdentifier[] = [];
  readonly codeVerifications: { identifier: OperatorIdentifier; code: string }[] = [];
  confirmAnswer: Observable<void> = of(undefined);
  readonly confirmations: { identifier: OperatorIdentifier; code: string }[] = [];
  logouts = 0;
  /** Calls of the access check (`/auth/me`, `/auth/grants`). */
  accessChecks = 0;
  platformAllowed = true;

  login(): Observable<LoginOutcome> {
    return this.loginAnswer;
  }
  verifyOwnerFactor(challenge: string, proof: FactorProof): Observable<void> {
    this.proofs.push({ challenge, proof });
    return this.verifyAnswer;
  }
  passkeyRequest(): Observable<PasskeyRequest> {
    return of({ publicKey: { challenge: new Uint8Array(1) } });
  }
  requestWorkingCode(identifier: OperatorIdentifier): Observable<void> {
    this.codeRequests.push(identifier);
    return this.requestCodeAnswer;
  }
  verifyWorkingCode(identifier: OperatorIdentifier, code: string): Observable<void> {
    this.codeVerifications.push({ identifier, code });
    return this.verifyCodeAnswer;
  }
  confirmOperatorContact(identifier: OperatorIdentifier, code: string): Observable<void> {
    this.confirmations.push({ identifier, code });
    return this.confirmAnswer;
  }
  me(): Observable<Identity> {
    this.accessChecks++;
    return of(this.identity);
  }
  grants(): Observable<Grants> {
    this.accessChecks++;
    return of(this.grantsAnswer);
  }
  platformAccess(): Observable<boolean> {
    return of(this.platformAllowed);
  }
  logout(): Observable<void> {
    this.logouts++;
    return of(undefined);
  }
}

class FakeWebAuthn extends WebAuthnClient {
  outcome: 'ok' | 'cancelled' = 'ok';
  async get(): Promise<PasskeyAssertion> {
    if (this.outcome === 'cancelled') throw new PasskeyPromptError('cancelled');
    return { credential: 'assertion' };
  }
}

function setUp() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: APP_ENVIRONMENT, useValue: DEMO_BUILD },
      { provide: AUTH_ACCEPTED_PAUSE_MS, useValue: 0 },
      { provide: AuthGateway, useClass: FakeGateway },
      { provide: WebAuthnClient, useClass: FakeWebAuthn },
      { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
      AuthFlowFacade,
    ],
  });
  const router = TestBed.inject(Router);
  const navigations: string[] = [];
  vi.spyOn(router, 'navigateByUrl').mockImplementation(async (url) => {
    navigations.push(String(url));
    return true;
  });
  vi.spyOn(router, 'navigate').mockImplementation(async (commands, extras) => {
    const query = new URLSearchParams(extras?.queryParams ?? {}).toString();
    navigations.push(commands.join('/') + (query ? `?${query}` : ''));
    return true;
  });
  return {
    flow: TestBed.inject(AuthFlowFacade),
    gateway: TestBed.inject(AuthGateway) as FakeGateway,
    webAuthn: TestBed.inject(WebAuthnClient) as FakeWebAuthn,
    session: TestBed.inject(AuthSession),
    navigations,
  };
}

describe('AuthFlowFacade', () => {
  it('moves to the second step with the methods in Core’s order, without a session yet', async () => {
    const { flow, session, navigations } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    expect(flow.step()).toBe('mfa');
    expect(flow.methods()).toEqual(['totp', 'passkey']);
    expect(flow.method()).toBe('totp');
    expect(flow.alternative()).toBe('passkey');
    expect(session.actor()).toBeNull();
    expect(navigations).toEqual(['/login/verify']);
  });

  it('starts with the first offered method and offers no alternative when there is none', async () => {
    const { flow, gateway } = setUp();
    gateway.loginAnswer = of({
      kind: 'mfa_required',
      challenge: { token: 't', methods: ['passkey'] },
    });
    await flow.signIn('owner@x.invalid', 'secret');
    expect(flow.method()).toBe('passkey');
    expect(flow.alternative()).toBeNull();
  });

  it('reports a refused sign-in without saying why, and keeps the email', async () => {
    const { flow, gateway, navigations } = setUp();
    gateway.loginAnswer = fail({ kind: 'unauthenticated', status: 401 });
    await flow.signIn('owner@x.invalid', 'wrong');
    expect(flow.signInProblem()).toBe('failed');
    expect(flow.email()).toBe('owner@x.invalid');
    expect(flow.busy()).toBeNull();
    expect(navigations).toEqual([]);
  });

  it('verifies a code, then resolves access before establishing the session', async () => {
    const { flow, gateway, session, navigations } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    await flow.verifyCode('123 456');
    expect(gateway.proofs).toEqual([
      { challenge: 'challenge-1', proof: { method: 'totp', code: '123 456' } },
    ]);
    expect(flow.accepted()).toBe(false); // the challenge is forgotten once resolved
    expect(session.actor()).toEqual({
      kind: 'owner',
      userId: 'o',
      email: 'owner@x.invalid',
      companyId: 'company',
    });
    expect(navigations.at(-1)).toBe('/overview');
  });

  it('returns an owner to the requested page after sign-in, and ignores an unsafe one', async () => {
    const first = setUp();
    first.flow.setReturnUrl('/platforms');
    first.gateway.loginAnswer = of({ kind: 'session' });
    await first.flow.signIn('owner@x.invalid', 'secret');
    expect(first.navigations.at(-1)).toBe('/platforms');

    TestBed.resetTestingModule();
    const second = setUp();
    second.flow.setReturnUrl('//evil.example');
    second.gateway.loginAnswer = of({ kind: 'session' });
    await second.flow.signIn('owner@x.invalid', 'secret');
    expect(second.navigations.at(-1)).toBe('/overview');
  });

  it('returns into a Platform scope only when Core confirms access', async () => {
    const allowed = setUp();
    allowed.flow.setReturnUrl('/platforms/p1');
    allowed.gateway.loginAnswer = of({ kind: 'session' });
    await allowed.flow.signIn('owner@x.invalid', 'secret');
    expect(allowed.navigations.at(-1)).toBe('/platforms/p1');

    TestBed.resetTestingModule();
    const refused = setUp();
    refused.flow.setReturnUrl('/platforms/not-mine');
    refused.gateway.loginAnswer = of({ kind: 'session' });
    refused.gateway.platformAllowed = false;
    await refused.flow.signIn('owner@x.invalid', 'secret');
    expect(refused.navigations.at(-1)).toBe('/overview');
  });

  describe('operator (landing logic only: operators cannot sign in through this prototype)', () => {
    const operatorSession = (assignments: string[], returnUrl: string | null) => {
      const ctx = setUp();
      if (returnUrl !== null) ctx.flow.setReturnUrl(returnUrl);
      ctx.gateway.loginAnswer = of({ kind: 'session' });
      ctx.gateway.identity = {
        userId: 'p',
        email: 'op@x.invalid',
        phone: null,
        adminTier: 'operator',
      };
      ctx.gateway.grantsAnswer = {
        companyId: null,
        platformAssignments: assignments.map(platformId),
      };
      return ctx;
    };

    it('enters the single assigned Platform', async () => {
      const { flow, session, navigations } = operatorSession(['school'], null);
      await flow.signIn('op@x.invalid', 'secret');
      expect(session.actor()?.kind).toBe('operator');
      expect(navigations.at(-1)).toBe('/platforms/school');
    });

    it('never returns to a Company-owner page', async () => {
      const { flow, navigations } = operatorSession(['school'], '/overview');
      await flow.signIn('op@x.invalid', 'secret');
      expect(navigations.at(-1)).toBe('/platforms/school');
    });

    it('never returns to an unassigned Platform, even if the URL is internal', async () => {
      const { flow, navigations } = operatorSession(['school', 'drive'], '/platforms/other');
      await flow.signIn('op@x.invalid', 'secret');
      expect(navigations.at(-1)).toBe('/login/platform');
    });

    it('returns to an assigned Platform instead of the choice', async () => {
      const { flow, navigations } = operatorSession(['school', 'drive'], '/platforms/drive');
      await flow.signIn('op@x.invalid', 'secret');
      expect(navigations.at(-1)).toBe('/platforms/drive');
    });
  });

  it('keeps the challenge after a refused code', async () => {
    const { flow, gateway } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    gateway.verifyAnswer = fail({ kind: 'unauthenticated', status: 401 });
    await flow.verifyCode('000000');
    expect(flow.verifyProblem()).toBe('invalidCode');
    gateway.verifyAnswer = of(undefined);
    await flow.verifyCode('123456');
    expect(gateway.proofs.map((p) => p.challenge)).toEqual(['challenge-1', 'challenge-1']);
    expect(flow.step()).toBe('resolved');
  });

  it('asks to restart when Core no longer knows the challenge', async () => {
    const { flow, gateway } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    gateway.verifyAnswer = fail({ kind: 'not_found', status: 404 });
    await flow.verifyCode('123456');
    expect(flow.verifyProblem()).toBe('expired');
    await flow.verifyCode('123456');
    expect(gateway.proofs.length).toBe(1); // nothing is sent without a challenge
  });

  it('treats a cancelled passkey prompt as retryable, and completes with the passkey', async () => {
    const { flow, gateway, webAuthn, session } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    flow.useMethod('passkey');
    webAuthn.outcome = 'cancelled';
    await flow.startPasskey();
    expect(flow.verifyProblem()).toBe('passkeyFailed');
    webAuthn.outcome = 'ok';
    await flow.startPasskey();
    expect(gateway.proofs.at(-1)?.proof).toEqual({
      method: 'passkey',
      assertion: { credential: 'assertion' },
    });
    expect(session.actor()?.kind).toBe('owner');
  });

  it('sends an authenticated account without administrative access to the no-access page', async () => {
    const { flow, gateway, session, navigations } = setUp();
    gateway.loginAnswer = of({ kind: 'session' });
    gateway.identity = MEMBER;
    gateway.grantsAnswer = NO_GRANTS;
    await flow.signIn('member@x.invalid', 'secret');
    expect(session.actor()).toBeNull();
    expect(flow.noAccessContact()).toBe('member@x.invalid');
    expect(navigations.at(-1)).toBe('/login/no-access');
  });

  it.each([
    ['enrollment_required', 'enrollmentRequired'],
    ['recovery_required', 'recoveryRequired'],
  ] as const)('stops at %s as its own state: no session, no navigation', async (kind, problem) => {
    const { flow, gateway, session, navigations } = setUp();
    gateway.loginAnswer = of({ kind });
    await flow.signIn('owner@x.invalid', 'secret');
    expect(flow.signInProblem()).toBe(problem);
    expect(flow.step()).toBe('password');
    expect(session.actor()).toBeNull();
    expect(navigations).toEqual([]);
  });

  it('drops the challenge on going back, and signs out locally even if Core does not answer', async () => {
    const { flow, gateway, session, navigations } = setUp();
    await flow.signIn('owner@x.invalid', 'secret');
    await flow.backToSignIn();
    expect(flow.methods()).toEqual([]);
    expect(flow.step()).toBe('password');

    gateway.loginAnswer = of({ kind: 'session' });
    await flow.signIn('owner@x.invalid', 'secret');
    gateway.logout = () => fail({ kind: 'network', status: 0 });
    await flow.signOut();
    expect(session.actor()).toBeNull();
    expect(navigations.at(-1)).toBe('/login?reason=signed-out');
  });
});

describe('auth error mapping (HTTP-status fallback until Core codes are verified)', () => {
  it('maps sign-in errors without revealing account state', () => {
    expect(signInProblemOf({ kind: 'unauthenticated', status: 401 })).toBe('failed');
    expect(signInProblemOf({ kind: 'forbidden', status: 403 })).toBe('failed');
    expect(signInProblemOf({ kind: 'rate_limited', status: 429 })).toBe('rateLimited');
    expect(signInProblemOf({ kind: 'network', status: 0 })).toBe('unavailable');
    expect(signInProblemOf({ kind: 'unexpected', status: 500 })).toBe('unavailable');
  });

  it('maps verification errors', () => {
    expect(verifyProblemOf({ kind: 'unauthenticated', status: 401 })).toBe('invalidCode');
    expect(verifyProblemOf({ kind: 'not_found', status: 404 })).toBe('expired');
    expect(verifyProblemOf({ kind: 'rate_limited', status: 429 })).toBe('rateLimited');
    expect(verifyProblemOf({ kind: 'unavailable', status: 503 })).toBe('unavailable');
  });

  describe('working code (operators)', () => {
    const SCHOOL = platformId('school');
    const DRIVE = platformId('drive');
    const EMAIL: OperatorIdentifier = { kind: 'email', email: 'operator@x.invalid' };
    const PHONE: OperatorIdentifier = { kind: 'phone', phone: '+99900000001' };
    const operator = (identity: Partial<Identity> = {}): Identity => ({
      userId: 'op',
      email: 'operator@x.invalid',
      phone: null,
      adminTier: 'operator',
      ...identity,
    });

    async function requested(identifier: OperatorIdentifier = EMAIL) {
      const setup = setUp();
      await setup.flow.requestWorkingCode('typed text', identifier);
      return setup;
    }

    it('requests a code, then opens the verify page with a neutral notice and no session', async () => {
      const { flow, gateway, session, navigations } = await requested();
      expect(gateway.codeRequests).toEqual([EMAIL]);
      expect(flow.workingCodeIdentifier()).toEqual(EMAIL);
      expect(flow.workingCodeNotice()).toBe('requested');
      expect(flow.identifierText()).toBe('typed text');
      expect(session.actor()).toBeNull();
      expect(navigations).toEqual([WORKING_CODE_VERIFY_PATH]);
    });

    it('keeps the requested page through the working-code pages', async () => {
      const { flow, navigations } = setUp();
      flow.setReturnUrl('/platforms/school');
      await flow.requestWorkingCode('x', EMAIL);
      expect(navigations).toEqual([`${WORKING_CODE_VERIFY_PATH}?returnUrl=%2Fplatforms%2Fschool`]);
    });

    it('never sends a second request while one is pending', async () => {
      const { flow, gateway } = setUp();
      gateway.requestCodeAnswer = new Observable<void>(() => undefined);
      void flow.requestWorkingCode('x', EMAIL);
      void flow.requestWorkingCode('x', EMAIL);
      await flow.requestWorkingCodeAgain();
      expect(gateway.codeRequests).toEqual([EMAIL]);
      expect(flow.busy()).toBe('requestCode');
    });

    it.each([
      [{ kind: 'rate_limited', status: 429 } as AppError, 'rateLimited'],
      [{ kind: 'validation', messages: [], status: 400 } as AppError, 'invalid'],
      [{ kind: 'unavailable', status: 503 } as AppError, 'unavailable'],
      [{ kind: 'network', status: 0 } as AppError, 'unavailable'],
    ])('stays on the request page after %o: %s', async (error, problem) => {
      const { flow, gateway, navigations } = setUp();
      gateway.requestCodeAnswer = fail(error);
      await flow.requestWorkingCode('x', EMAIL);
      expect(flow.codeRequestProblem()).toBe(problem);
      expect(flow.workingCodeIdentifier()).toBeNull();
      expect(flow.busy()).toBeNull();
      expect(navigations).toEqual([]);
    });

    it('sends the code as typed, a string with its leading zero', async () => {
      const { flow, gateway } = await requested();
      gateway.identity = operator();
      gateway.grantsAnswer = { companyId: null, platformAssignments: [SCHOOL] };
      await flow.verifyWorkingCode('042917');
      expect(gateway.codeVerifications).toEqual([{ identifier: EMAIL, code: '042917' }]);
    });

    it('shows one generic state for every refused code, keeping the identifier', async () => {
      const { flow, gateway, session, navigations } = await requested();
      for (const error of [
        { kind: 'unauthenticated', code: 'operator_code_invalid', status: 401 },
        { kind: 'unauthenticated', status: 401 },
        { kind: 'validation', messages: [], status: 400 },
      ] as AppError[]) {
        gateway.verifyCodeAnswer = fail(error);
        await flow.verifyWorkingCode('000000');
        expect(flow.workingCodeProblem()).toBe('invalidCode');
        expect(flow.workingCodeNotice()).toBeNull();
      }
      expect(flow.workingCodeIdentifier()).toEqual(EMAIL);
      expect(session.actor()).toBeNull();
      expect(navigations).toEqual([WORKING_CODE_VERIFY_PATH]);
    });

    it('maps verification errors by kind: generic invalid, rate limited, unavailable', () => {
      expect(workingCodeProblemOf({ kind: 'forbidden', status: 403 })).toBe('invalidCode');
      expect(workingCodeProblemOf({ kind: 'rate_limited', status: 429 })).toBe('rateLimited');
      expect(workingCodeProblemOf({ kind: 'unavailable', status: 503 })).toBe('unavailable');
      expect(workingCodeProblemOf({ kind: 'unexpected', status: 500 })).toBe('unavailable');
    });

    it('enters the only assigned Platform after Core identity and grants, never before', async () => {
      const { flow, gateway, session, navigations } = await requested();
      gateway.identity = operator();
      gateway.grantsAnswer = { companyId: null, platformAssignments: [SCHOOL] };
      await flow.verifyWorkingCode('042917');
      expect(session.actor()).toEqual({
        kind: 'operator',
        userId: 'op',
        email: 'operator@x.invalid',
        platformAssignments: [SCHOOL],
      });
      expect(navigations.at(-1)).toBe('/platforms/school');
      expect(flow.workingCodeIdentifier()).toBeNull();
    });

    it('offers the platform choice to an operator with several Platforms', async () => {
      const { flow, gateway, navigations } = await requested();
      gateway.identity = operator();
      gateway.grantsAnswer = { companyId: null, platformAssignments: [SCHOOL, DRIVE] };
      await flow.verifyWorkingCode('042917');
      expect(navigations.at(-1)).toBe('/login/platform');
    });

    it('signs in a phone-only operator (no email) and names them by phone', async () => {
      const { flow, gateway, session } = await requested(PHONE);
      gateway.identity = operator({ email: null, phone: '+99900000001' });
      gateway.grantsAnswer = { companyId: null, platformAssignments: [DRIVE] };
      await flow.verifyWorkingCode('042917');
      expect(gateway.codeVerifications[0]?.identifier).toEqual(PHONE);
      expect(session.actor()).toMatchObject({ email: null, phone: '+99900000001' });
    });

    it('lands an operator without assignments on "no access", named by their contact', async () => {
      const { flow, gateway, session, navigations } = await requested(PHONE);
      gateway.identity = operator({ email: null, phone: '+99900000001' });
      gateway.grantsAnswer = NO_GRANTS;
      await flow.verifyWorkingCode('042917');
      expect(session.actor()).toBeNull();
      expect(flow.noAccessContact()).toBe('+99900000001');
      expect(navigations.at(-1)).toBe('/login/no-access');
    });

    it('lets Core identity decide, whatever the method: an owner identity lands as an owner', async () => {
      const { flow, gateway, session, navigations } = await requested();
      gateway.identity = OWNER;
      gateway.grantsAnswer = OWNER_GRANTS;
      await flow.verifyWorkingCode('042917');
      expect(session.actor()?.kind).toBe('owner');
      expect(navigations.at(-1)).toBe('/overview');
    });

    it.each([
      ['/overview', [SCHOOL], true, '/platforms/school'],
      ['/platforms', [SCHOOL, DRIVE], true, '/login/platform'],
      ['/platforms/drive', [SCHOOL], true, '/platforms/school'],
      ['/platforms/drive', [SCHOOL, DRIVE], false, '/login/platform'],
      ['/platforms/drive', [SCHOOL, DRIVE], true, '/platforms/drive'],
    ])(
      'returns an operator to %s only when assigned and allowed by Core',
      async (returnUrl, assignments, allowed, expected) => {
        const { flow, gateway, navigations } = setUp();
        flow.setReturnUrl(returnUrl);
        await flow.requestWorkingCode('x', EMAIL);
        gateway.identity = operator();
        gateway.grantsAnswer = { companyId: null, platformAssignments: assignments };
        gateway.platformAllowed = allowed;
        await flow.verifyWorkingCode('042917');
        expect(navigations.at(-1)).toBe(expected);
      },
    );

    it('requests another code for the same identifier, with a neutral notice', async () => {
      const { flow, gateway } = await requested();
      gateway.verifyCodeAnswer = fail({ kind: 'unauthenticated', status: 401 });
      await flow.verifyWorkingCode('111111');
      await flow.requestWorkingCodeAgain();
      expect(gateway.codeRequests).toEqual([EMAIL, EMAIL]);
      expect(flow.workingCodeProblem()).toBeNull();
      expect(flow.workingCodeNotice()).toBe('requestedAgain');
    });

    it('shows a rate limit on requesting again, and keeps the page usable', async () => {
      const { flow, gateway } = await requested();
      gateway.requestCodeAnswer = fail({ kind: 'rate_limited', status: 429 });
      await flow.requestWorkingCodeAgain();
      expect(flow.workingCodeProblem()).toBe('rateLimited');
      expect(flow.busy()).toBeNull();
      gateway.identity = operator();
      gateway.grantsAnswer = { companyId: null, platformAssignments: [SCHOOL] };
      await flow.verifyWorkingCode('042917');
      expect(flow.workingCodeProblem()).toBeNull();
    });

    it('goes back to change the identifier, keeping what was typed', async () => {
      const { flow, navigations } = await requested();
      await flow.changeIdentifier();
      expect(flow.workingCodeIdentifier()).toBeNull();
      expect(flow.identifierText()).toBe('typed text');
      expect(navigations.at(-1)).toBe(WORKING_CODE_PATH);
    });

    it('never touches the owner second step', async () => {
      const { flow, gateway } = await requested();
      gateway.identity = operator();
      gateway.grantsAnswer = { companyId: null, platformAssignments: [SCHOOL] };
      await flow.verifyWorkingCode('042917');
      expect(gateway.proofs).toEqual([]);
      expect(flow.methods()).toEqual([]);
    });
  });
});

describe('contact confirmation (new operators)', () => {
  const EMAIL: OperatorIdentifier = { kind: 'email', email: 'operator.new@x.invalid' };

  it('confirms with the code as a string, then stays put: no session, no access check, no navigation', async () => {
    const { flow, gateway, session, navigations } = setUp();
    await flow.confirmContact('typed text', EMAIL, '005318');
    expect(gateway.confirmations).toEqual([{ identifier: EMAIL, code: '005318' }]);
    expect(flow.contactConfirmed()).toBe(true);
    expect(flow.confirmationProblem()).toBeNull();
    expect(flow.identifierText()).toBe('typed text');
    expect(gateway.codeRequests).toEqual([]);
    expect(gateway.accessChecks).toBe(0);
    expect(session.actor()).toBeNull();
    expect(navigations).toEqual([]);
    expect(flow.busy()).toBeNull();
  });

  it('shows one generic state for every refused code', async () => {
    const { flow, gateway, session } = setUp();
    for (const error of [
      { kind: 'unauthenticated', code: 'operator_code_invalid', status: 401 },
      { kind: 'validation', messages: [], status: 400 },
      { kind: 'forbidden', status: 403 },
      { kind: 'not_found', status: 404 },
    ] as AppError[]) {
      gateway.confirmAnswer = fail(error);
      await flow.confirmContact('x', EMAIL, '000000');
      expect(flow.confirmationProblem()).toBe('invalidCode');
      expect(flow.contactConfirmed()).toBe(false);
    }
    expect(session.actor()).toBeNull();
  });

  it('maps a rate limit and an unavailable service; nothing is retried by itself', async () => {
    const { flow, gateway } = setUp();
    gateway.confirmAnswer = fail({ kind: 'rate_limited', status: 429 });
    await flow.confirmContact('x', EMAIL, '005318');
    expect(flow.confirmationProblem()).toBe('rateLimited');
    gateway.confirmAnswer = fail({ kind: 'network', status: 0 });
    await flow.confirmContact('x', EMAIL, '005318');
    expect(flow.confirmationProblem()).toBe('unavailable');
    expect(gateway.confirmations).toHaveLength(2);
    expect(contactConfirmationProblemOf({ kind: 'unexpected', status: 500 })).toBe('unavailable');
  });

  it('never sends a second confirmation while one is pending', async () => {
    const { flow, gateway } = setUp();
    gateway.confirmAnswer = new Observable<void>(() => undefined);
    void flow.confirmContact('x', EMAIL, '005318');
    void flow.confirmContact('x', EMAIL, '005318');
    expect(gateway.confirmations).toHaveLength(1);
    expect(flow.busy()).toBe('confirmContact');
    expect(flow.announcement()).toBe('auth.contactConfirmation.confirming');
  });

  it('forgets a confirmation on a fresh form and on going back to sign-in', async () => {
    const { flow } = setUp();
    await flow.confirmContact('x', EMAIL, '005318');
    flow.startContactConfirmation();
    expect(flow.contactConfirmed()).toBe(false);
    await flow.confirmContact('x', EMAIL, '005318');
    await flow.backToSignIn();
    expect(flow.contactConfirmed()).toBe(false);
  });
});
