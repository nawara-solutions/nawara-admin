import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { vi } from 'vitest';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { FactorProof, TotpEnrollment } from '../../../core/auth/auth.model';
import { StepUpGateway, StepUpGrant, StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { companyId, platformId } from '../../../core/context/scope.model';
import { AppError, adapterUnavailable } from '../../../core/errors/app-error';
import {
  AccountSecurity,
  AccountSecurityGateway,
  SecretKeyIssue,
  SecurityFactor,
} from '../data-access/account-security.gateway';
import { AccountSecurityFacade } from './account-security.facade';
import { SECRET_KEY_CHECK_GROUP, SecretKeyFacade } from './secret-key.facade';

const KEY = 'ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789-ABCD-EFGH-JKLM-NPQR-STUV';
const GROUPS = KEY.split('-');
/** The group the injected picker chooses (0-based): "2345", group 7. */
const CHECK = 6;
const ISSUED = '2026-10-25T09:30:00.000Z';
const PROOF = '123456';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
const otherOwner: Actor = { ...owner, userId: 'o2', email: 'o2@x.invalid' };
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};

const totp: SecurityFactor = {
  id: 't',
  type: 'totp',
  confirmed: true,
  createdAt: null,
  lastUsedAt: null,
};
const passkey: SecurityFactor = { ...totp, id: 'p', type: 'webauthn' };

/** Every call is answered by the test, when it chooses (so in-flight, lost and late answers can be staged). */
class FakeSecurity extends AccountSecurityGateway {
  readonly loads: Subject<AccountSecurity>[] = [];
  readonly rotations: { token: string; answer: Subject<SecretKeyIssue> }[] = [];
  load(): Observable<AccountSecurity> {
    const answer = new Subject<AccountSecurity>();
    this.loads.push(answer);
    return answer;
  }
  beginTotp(): Observable<TotpEnrollment> {
    throw new Error('not used by the secret key');
  }
  confirmTotp(): Observable<void> {
    throw new Error('not used by the secret key');
  }
  rotateSecretKey(token: string): Observable<SecretKeyIssue> {
    const answer = new Subject<SecretKeyIssue>();
    this.rotations.push({ token, answer });
    return answer;
  }
  removeFactor(): Observable<void> {
    throw new Error('not used by the secret key');
  }
  changePassword(): Observable<void> {
    throw new Error('not used by the secret key');
  }
}

class FakeStepUp extends StepUpGateway {
  readonly calls: { purpose: StepUpPurpose; proof: FactorProof; answer: Subject<StepUpGrant> }[] =
    [];
  obtain(purpose: StepUpPurpose, proof: FactorProof): Observable<StepUpGrant> {
    const answer = new Subject<StepUpGrant>();
    this.calls.push({ purpose, proof, answer });
    return answer;
  }
}

const reply = <T>(subject: Subject<T> | undefined, value: T) => {
  if (!subject) throw new Error('no such call');
  subject.next(value);
  subject.complete();
};
const refuse = <T>(subject: Subject<T> | undefined, error: AppError) => {
  if (!subject) throw new Error('no such call');
  subject.error(error);
};

function setUp(actor: Actor = owner) {
  const security = new FakeSecurity();
  const stepUp = new FakeStepUp();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: AccountSecurityGateway, useValue: security },
      { provide: StepUpGateway, useValue: stepUp },
      { provide: SECRET_KEY_CHECK_GROUP, useValue: () => CHECK },
      AccountSecurityFacade,
    ],
  });
  const session = TestBed.inject(AuthSession);
  session.establish(actor);
  // Page-scoped, like the page's own provider: destroying the injector is leaving the page.
  const injector = createEnvironmentInjector(
    [SecretKeyFacade],
    TestBed.inject(EnvironmentInjector),
  );
  const flow = injector.get(SecretKeyFacade);
  const notices = TestBed.inject(AccountSecurityFacade);
  let grants = 0;
  const grant = (): StepUpGrant => ({
    token: `grant-${(grants += 1).toString()}`,
    expiresAt: '2026-10-25T09:35:00Z',
  });
  /** Started, the factors answered: on the warning. */
  const atIntro = (factors: SecurityFactor[] = [totp, passkey]) => {
    flow.start();
    reply(security.loads.at(-1), { factors });
    expect(flow.state().phase).toBe('intro');
  };
  /** Acknowledged, verified: the rotation is in flight. */
  const creating = () => {
    if (flow.state().phase !== 'intro') atIntro();
    expect(flow.proceed(true)).toBe(true);
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls.at(-1)?.answer, grant());
    expect(flow.state().phase).toBe('creating');
    return security.rotations.at(-1);
  };
  /** The key is shown (masked). */
  const shown = (issue: SecretKeyIssue = { secretKey: KEY, issuedAt: ISSUED }) => {
    reply(creating()?.answer, issue);
    expect(flow.state().phase).toBe('shown');
  };
  return { flow, security, stepUp, session, injector, notices, atIntro, creating, shown };
}

describe('SecretKeyFacade (P9-S4c)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('entering checks the factors and stops at the warning: nothing is verified or created', () => {
    const { security, stepUp, atIntro } = setUp();
    atIntro();
    expect(security.loads).toHaveLength(1);
    expect(stepUp.calls).toHaveLength(0);
    expect(security.rotations).toHaveLength(0);
  });

  it('continues only once the warning is acknowledged', () => {
    const { flow, stepUp, atIntro } = setUp();
    atIntro();
    expect(flow.proceed(false)).toBe(false);
    expect(flow.state().phase).toBe('intro');
    expect(flow.verify(PROOF)).toBe(false);
    expect(stepUp.calls).toHaveLength(0);
    expect(flow.proceed(true)).toBe(true);
    expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: null });
  });

  it('verifies for owner.secret_key.rotate with an authenticator code, then sends ONE rotation with that grant', () => {
    const { flow, stepUp, security, atIntro } = setUp();
    atIntro();
    flow.proceed(true);
    expect(flow.verify('12 34 5')).toBe(false);
    expect(flow.verify(' 123 456 ')).toBe(true);
    expect(stepUp.calls.map((c) => [c.purpose, c.proof])).toEqual([
      ['owner.secret_key.rotate', { method: 'totp', code: '123456' }],
    ]);
    expect(security.rotations).toHaveLength(0);
    reply(stepUp.calls[0]?.answer, { token: 'grant-a', expiresAt: '2026-10-25T09:35:00Z' });
    expect(security.rotations.map((r) => r.token)).toEqual(['grant-a']);
  });

  it('shows the key masked first; Reveal and Hide toggle it; it is 13 groups in order', () => {
    const { flow, shown } = setUp();
    shown();
    expect(flow.state()).toEqual({
      phase: 'shown',
      issuedAt: ISSUED,
      revealed: false,
      checkGroup: CHECK,
      checkFailed: false,
    });
    expect(flow.revealedGroups()).toBeNull();
    flow.reveal();
    expect(flow.revealedGroups()).toEqual(GROUPS);
    flow.hide();
    expect(flow.revealedGroups()).toBeNull();
  });

  it('accepts Core’s key whatever its separators or case; an unparseable issue time is not shown', () => {
    const { flow, shown } = setUp();
    shown({ secretKey: KEY.replace(/-/g, ' ').toLowerCase(), issuedAt: 'soon' });
    flow.reveal();
    expect(flow.revealedGroups()).toEqual(GROUPS);
    expect(flow.state()).toMatchObject({ issuedAt: null });
  });

  it('ignores duplicate submissions: one verification, one rotation', () => {
    const { flow, stepUp, security, atIntro } = setUp();
    atIntro();
    flow.proceed(true);
    expect(flow.verify(PROOF)).toBe(true);
    expect(flow.verify(PROOF)).toBe(false);
    expect(flow.proceed(true)).toBe(false);
    expect(stepUp.calls).toHaveLength(1);
    reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
    expect(flow.busy()).toBe(true);
    expect(flow.verify(PROOF)).toBe(false);
    expect(flow.cancel()).toBe(false);
    flow.back();
    expect(security.rotations).toHaveLength(1);
    expect(stepUp.calls).toHaveLength(1);
  });

  describe('definite refusals: nothing changed', () => {
    it('a refused proof (401) stays on verifying; nothing is sent', () => {
      const { flow, stepUp, security, atIntro } = setUp();
      atIntro();
      flow.proceed(true);
      flow.verify(PROOF);
      refuse(stepUp.calls[0]?.answer, { kind: 'unauthenticated', status: 401 });
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: 'proofRefused' });
      expect(security.rotations).toHaveLength(0);
    });

    it('403 step_up_required returns to verifying (expired); a new attempt needs a new grant', () => {
      const { flow, stepUp, security, creating } = setUp();
      refuse(creating()?.answer, { kind: 'forbidden', code: 'step_up_required', status: 403 });
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: 'expired' });
      expect(flow.verify(PROOF)).toBe(true);
      reply(stepUp.calls[1]?.answer, { token: 'fresh', expiresAt: '2026-10-25T09:35:00Z' });
      expect(security.rotations.map((r) => r.token)).toEqual(['grant-1', 'fresh']);
    });

    it('429 from the verification or the rotation stops; only the owner resumes, and nothing is retried', () => {
      const { flow, stepUp, security, atIntro, creating } = setUp();
      atIntro();
      flow.proceed(true);
      flow.verify(PROOF);
      refuse(stepUp.calls[0]?.answer, { kind: 'rate_limited', status: 429 });
      expect(flow.state()).toEqual({ phase: 'rateLimited' });
      flow.resume();
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: null });
      flow.back();
      refuse(creating()?.answer, { kind: 'rate_limited', status: 429 });
      expect(flow.state()).toEqual({ phase: 'rateLimited' });
      expect(security.rotations).toHaveLength(1);
      expect(stepUp.calls).toHaveLength(2);
    });

    it('403 forbidden or 401 on the rotation ends the flow: refused, nothing held', () => {
      for (const error of [
        { kind: 'forbidden', code: 'forbidden', status: 403 },
        { kind: 'unauthenticated', status: 401 },
      ] as const) {
        TestBed.resetTestingModule();
        const { flow, creating } = setUp();
        refuse(creating()?.answer, error);
        expect(flow.state()).toEqual({ phase: 'refused' });
        expect(flow.revealedGroups()).toBeNull();
      }
    });
  });

  describe('uncertain outcomes: never resent, never assumed unchanged', () => {
    const uncertain: [string, AppError][] = [
      ['a lost answer', { kind: 'network', status: 0 }],
      ['500', { kind: 'unexpected', status: 500 }],
      ['502', { kind: 'unexpected', status: 502 }],
      ['503', { kind: 'unavailable', status: 503 }],
      ['504', { kind: 'unavailable', status: 504 }],
      ['an unexpected 404', { kind: 'not_found', status: 404 }],
      ['an unexpected 400', { kind: 'validation', messages: [], status: 400 }],
      ['an unexpected 409', { kind: 'conflict', status: 409 }],
    ];
    for (const [name, error] of uncertain)
      it(`${name} is unknown: no resend, no automatic retry`, () => {
        vi.useFakeTimers();
        try {
          const { flow, security, stepUp, creating } = setUp();
          refuse(creating()?.answer, error);
          expect(flow.state()).toEqual({ phase: 'unknown', reason: 'noAnswer' });
          vi.advanceTimersByTime(10 * 60_000);
          expect(security.rotations).toHaveLength(1);
          expect(stepUp.calls).toHaveLength(1);
          expect(flow.busy()).toBe(false);
        } finally {
          vi.useRealTimers();
        }
      });

    it('a success without a usable key is incomplete (it committed): malformed, empty, or no value at all', () => {
      for (const issue of [
        { secretKey: '', issuedAt: ISSUED },
        { secretKey: GROUPS.slice(0, 12).join('-'), issuedAt: ISSUED },
        { secretKey: `${KEY}-EXTRA`, issuedAt: ISSUED },
        null as unknown as SecretKeyIssue,
      ]) {
        TestBed.resetTestingModule();
        const { flow, creating } = setUp();
        reply(creating()?.answer, issue);
        expect(flow.state()).toEqual({ phase: 'unknown', reason: 'incomplete' });
        expect(flow.revealedGroups()).toBeNull();
      }
      TestBed.resetTestingModule();
      const { flow, creating } = setUp();
      creating()?.answer.complete();
      expect(flow.state()).toEqual({ phase: 'unknown', reason: 'incomplete' });
    });

    it('"Create another key" starts a completely new flow: the warning again, a new acknowledgement and a NEW grant', () => {
      const { flow, security, stepUp, creating, shown } = setUp();
      refuse(creating()?.answer, { kind: 'network', status: 0 });
      flow.startOver();
      expect(flow.state()).toEqual({ phase: 'intro' });
      expect(flow.verify(PROOF)).toBe(false);
      expect(flow.proceed(false)).toBe(false);
      shown();
      expect(stepUp.calls).toHaveLength(2);
      expect(security.rotations.map((r) => r.token)).toEqual(['grant-1', 'grant-2']);
    });
  });

  describe('the local check and Done', () => {
    it('the group is checked only while the key is hidden; a mismatch says so; case and spaces do not matter', () => {
      const { flow, security, shown } = setUp();
      shown();
      flow.reveal();
      expect(flow.checkGroup(GROUPS[CHECK] ?? '')).toBe(false);
      expect(flow.state().phase).toBe('shown');
      flow.hide();
      expect(flow.checkGroup('ZZZZ')).toBe(true);
      expect(flow.state()).toMatchObject({ phase: 'shown', checkFailed: true });
      expect(flow.checkGroup(GROUPS[CHECK - 1] ?? '')).toBe(true);
      expect(flow.state().phase).toBe('shown');
      expect(flow.checkGroup(' 23 45 ')).toBe(true);
      expect(flow.state()).toEqual({
        phase: 'checked',
        issuedAt: ISSUED,
        revealed: false,
        checkGroup: CHECK,
      });
      expect(security.rotations).toHaveLength(1);
    });

    it('Done needs BOTH the matched group and "I’ve saved it"; then the key is dropped and Security says so', () => {
      const { flow, notices, shown } = setUp();
      shown();
      expect(flow.finish(true)).toBe(false);
      flow.checkGroup('2345');
      expect(flow.finish(false)).toBe(false);
      flow.reveal();
      expect(flow.finish(true)).toBe(true);
      expect(flow.state()).toEqual({ phase: 'done' });
      expect(flow.revealedGroups()).toBeNull();
      expect(notices.takeNotice()).toBe('keySaved');
      expect(JSON.stringify(flow.state())).not.toContain('ABCD');
    });

    it('copies the key as Core returned it, on request only', async () => {
      const writes: string[] = [];
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: (value: string) => Promise.resolve(void writes.push(value)) },
        configurable: true,
      });
      try {
        const { flow, shown } = setUp();
        expect(await flow.copy()).toBe(false);
        shown();
        expect(writes).toEqual([]);
        expect(await flow.copy()).toBe(true);
        expect(writes).toEqual([KEY]);
        Object.defineProperty(navigator, 'clipboard', {
          value: { writeText: () => Promise.reject(new Error('denied')) },
          configurable: true,
        });
        expect(await flow.copy()).toBe(false);
      } finally {
        Reflect.deleteProperty(navigator, 'clipboard');
      }
    });
  });

  describe('leaving, cancelling and session changes', () => {
    it('leaving asks only while the key is held or being created; abandoning drops it and says what may have happened', () => {
      const { flow, notices, atIntro, creating } = setUp();
      atIntro();
      expect(flow.leaveLosesKey()).toBe(false);
      creating();
      expect(flow.leaveLosesKey()).toBe(true);
      flow.abandon();
      expect(flow.state()).toEqual({ phase: 'abandoned' });
      expect(notices.takeNotice()).toBe('keyUnknown');
      TestBed.resetTestingModule();
      const second = setUp();
      second.shown();
      expect(second.flow.leaveLosesKey()).toBe(true);
      second.flow.abandon();
      expect(second.flow.revealedGroups()).toBeNull();
      expect(second.notices.takeNotice()).toBe('keyNotSaved');
    });

    it('abandoning while creating ignores the late answer: nothing is shown or kept', () => {
      const { flow, creating } = setUp();
      const rotation = creating();
      flow.abandon();
      reply(rotation?.answer, { secretKey: KEY, issuedAt: ISSUED });
      expect(flow.state()).toEqual({ phase: 'abandoned' });
      expect(flow.revealedGroups()).toBeNull();
    });

    it('a late rotation answer after leaving is ignored: nothing is shown or kept', () => {
      const { flow, injector, creating } = setUp();
      const rotation = creating();
      injector.destroy();
      expect(flow.state()).toEqual({ phase: 'idle' });
      reply(rotation?.answer, { secretKey: KEY, issuedAt: ISSUED });
      expect(flow.state()).toEqual({ phase: 'idle' });
      expect(flow.revealedGroups()).toBeNull();
    });

    it('destroying the page drops a shown key', () => {
      const { flow, injector, shown } = setUp();
      shown();
      flow.reveal();
      injector.destroy();
      expect(flow.revealedGroups()).toBeNull();
      expect(flow.state()).toEqual({ phase: 'idle' });
    });

    it('cancel works only before anything is sent, and says nothing changed', () => {
      const { flow, notices, security, atIntro } = setUp();
      atIntro();
      expect(flow.cancel()).toBe(true);
      expect(flow.state()).toEqual({ phase: 'cancelled' });
      expect(notices.takeNotice()).toBe('keyCancelled');
      expect(security.rotations).toHaveLength(0);
    });

    it('a sign-out, another owner or a new session of the same owner drops the key at once', () => {
      for (const change of [
        (session: AuthSession) => session.signOut(),
        (session: AuthSession) => session.establish(otherOwner),
        (session: AuthSession) => session.establish(owner),
      ]) {
        TestBed.resetTestingModule();
        const { flow, session, shown } = setUp();
        shown();
        flow.reveal();
        change(session);
        expect(flow.leaveLosesKey()).toBe(false);
        expect(flow.state()).toEqual({ phase: 'refused' });
        expect(flow.revealedGroups()).toBeNull();
      }
    });

    it('a grant that arrives after the session changed is never used', () => {
      const { flow, session, stepUp, security, atIntro } = setUp();
      atIntro();
      flow.proceed(true);
      flow.verify(PROOF);
      session.establish(owner);
      reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
      expect(security.rotations).toHaveLength(0);
      expect(flow.state()).toEqual({ phase: 'refused' });
    });
  });

  describe('eligibility', () => {
    it('a passkey-only owner is told why; nothing is verified or created', () => {
      const { flow, security, stepUp } = setUp();
      flow.start();
      reply(security.loads[0], { factors: [passkey, { ...totp, confirmed: false }] });
      expect(flow.state()).toEqual({ phase: 'noAuthenticator' });
      expect(flow.proceed(true)).toBe(false);
      expect(stepUp.calls).toHaveLength(0);
    });

    it('refuses an operator assigned everywhere without any request', () => {
      const { flow, security } = setUp(operator);
      flow.start();
      expect(flow.state()).toEqual({ phase: 'refused' });
      expect(security.loads).toHaveLength(0);
    });

    it('a production build (no adapter) is not available; an unreadable list offers a manual Try again', () => {
      const { flow, security } = setUp();
      flow.start();
      refuse(security.loads[0], adapterUnavailable());
      expect(flow.state()).toEqual({ phase: 'notInBuild' });
      TestBed.resetTestingModule();
      const second = setUp();
      second.flow.start();
      refuse(second.security.loads[0], { kind: 'network', status: 0 });
      expect(second.flow.state()).toEqual({ phase: 'loadFailed' });
      expect(second.security.loads).toHaveLength(1);
      second.flow.retryCheck();
      expect(second.security.loads).toHaveLength(2);
    });
  });
});
