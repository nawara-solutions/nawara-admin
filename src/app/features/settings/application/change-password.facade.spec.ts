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
import { ChangePasswordFacade } from './change-password.facade';

const PASSWORD = 'correct horse battery';
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
  readonly changes: { password: string; token: string; answer: Subject<void> }[] = [];
  load(): Observable<AccountSecurity> {
    const answer = new Subject<AccountSecurity>();
    this.loads.push(answer);
    return answer;
  }
  beginTotp(): Observable<TotpEnrollment> {
    throw new Error('not used by the password');
  }
  confirmTotp(): Observable<void> {
    throw new Error('not used by the password');
  }
  rotateSecretKey(): Observable<SecretKeyIssue> {
    throw new Error('not used by the password');
  }
  removeFactor(): Observable<void> {
    throw new Error('not used by the password');
  }
  changePassword(password: string, token: string): Observable<void> {
    const answer = new Subject<void>();
    this.changes.push({ password, token, answer });
    return answer;
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
const done = (subject: Subject<void> | undefined) => {
  if (!subject) throw new Error('no such call');
  subject.complete();
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
      AccountSecurityFacade,
    ],
  });
  const session = TestBed.inject(AuthSession);
  session.establish(actor);
  const injector = createEnvironmentInjector(
    [ChangePasswordFacade],
    TestBed.inject(EnvironmentInjector),
  );
  const flow = injector.get(ChangePasswordFacade);
  const notices = TestBed.inject(AccountSecurityFacade);
  let grants = 0;
  const grant = (): StepUpGrant => ({
    token: `grant-${(grants += 1).toString()}`,
    expiresAt: '2026-10-25T09:35:00Z',
  });
  const editing = (factors: SecurityFactor[] = [totp, passkey]) => {
    flow.start();
    reply(security.loads.at(-1), { factors });
    expect(flow.state()).toEqual({ phase: 'editing', rejected: false });
  };
  /** The password submitted and verified: the change is in flight. */
  const changing = () => {
    if (flow.state().phase === 'idle') editing();
    if (flow.state().phase === 'editing') expect(flow.submit(PASSWORD, PASSWORD)).toBe(true);
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls.at(-1)?.answer, grant());
    expect(flow.state()).toEqual({ phase: 'changing' });
    return security.changes.at(-1);
  };
  return { flow, security, stepUp, session, injector, notices, editing, changing };
}

describe('ChangePasswordFacade (P9-S4e)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('entering checks the factors and stops at the form: nothing is verified or sent', () => {
    const { security, stepUp, editing } = setUp();
    editing();
    expect(stepUp.calls).toHaveLength(0);
    expect(security.changes).toHaveLength(0);
  });

  it('continues only with a password within Core’s limits, typed twice identically (exactly, never trimmed)', () => {
    const { flow, editing } = setUp();
    editing();
    expect(flow.submit('short', 'short')).toBe(false);
    expect(flow.submit(PASSWORD, `${PASSWORD} `)).toBe(false);
    expect(flow.submit(` ${PASSWORD}`, PASSWORD)).toBe(false);
    expect(flow.submit(`abcdefghij\u0000`, `abcdefghij\u0000`)).toBe(false);
    expect(flow.state().phase).toBe('editing');
    expect(flow.submit(` ${PASSWORD} `, ` ${PASSWORD} `)).toBe(true);
    expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: null });
  });

  it('verifies for owner.password.change with an authenticator code, then sends ONE change of exactly what was typed', () => {
    const { flow, stepUp, security, editing } = setUp();
    editing();
    flow.submit(` ${PASSWORD} `, ` ${PASSWORD} `);
    expect(flow.verify('12 34')).toBe(false);
    expect(flow.verify(' 123 456 ')).toBe(true);
    expect(flow.verify(PROOF)).toBe(false);
    expect(stepUp.calls.map((c) => [c.purpose, c.proof])).toEqual([
      ['owner.password.change', { method: 'totp', code: '123456' }],
    ]);
    reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
    expect(security.changes.map((c) => [c.password, c.token])).toEqual([[` ${PASSWORD} `, 'g']]);
    expect(flow.busy()).toBe(true);
    expect(flow.cancel()).toBe(false);
    flow.back();
    expect(flow.state()).toEqual({ phase: 'changing' });
  });

  it('204: done; Security says so; the password is dropped and the fields are cleared', () => {
    const { flow, notices, changing } = setUp();
    const before = flow.clearings();
    done(changing()?.answer);
    expect(flow.state()).toEqual({ phase: 'done' });
    expect(notices.takeNotice()).toBe('passwordChanged');
    expect(flow.clearings()).toBeGreaterThan(before);
    expect(flow.verify(PROOF)).toBe(false);
  });

  it('400 validation_error: Core refused the password; nothing changed; back to the form, cleared', () => {
    const { flow, changing } = setUp();
    const before = flow.clearings();
    refuse(changing()?.answer, {
      kind: 'validation',
      code: 'validation_error',
      messages: [],
      status: 400,
    });
    expect(flow.state()).toEqual({ phase: 'editing', rejected: true });
    expect(flow.clearings()).toBeGreaterThan(before);
  });

  it('403 step_up_required: verify again with a NEW grant; the typed password is kept for this owner and session', () => {
    const { flow, stepUp, security, changing } = setUp();
    refuse(changing()?.answer, { kind: 'forbidden', code: 'step_up_required', status: 403 });
    expect(flow.state()).toMatchObject({ phase: 'verifying', problem: 'expired' });
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls[1]?.answer, { token: 'fresh', expiresAt: '2026-10-25T09:40:00Z' });
    expect(security.changes.map((c) => [c.password, c.token])).toEqual([
      [PASSWORD, 'grant-1'],
      [PASSWORD, 'fresh'],
    ]);
  });

  it('a refused proof stays on the verification; 429 stops until the owner resumes; cancel drops everything', () => {
    const { flow, stepUp, security, notices, editing, changing } = setUp();
    editing();
    flow.submit(PASSWORD, PASSWORD);
    flow.verify(PROOF);
    refuse(stepUp.calls[0]?.answer, { kind: 'unauthenticated', status: 401 });
    expect(flow.state()).toMatchObject({ phase: 'verifying', problem: 'proofRefused' });
    refuse(changing()?.answer, { kind: 'rate_limited', status: 429 });
    expect(flow.state()).toEqual({ phase: 'rateLimited' });
    flow.resume();
    expect(flow.state()).toMatchObject({ phase: 'verifying', problem: null });
    expect(security.changes).toHaveLength(1);
    expect(flow.cancel()).toBe(true);
    expect(notices.takeNotice()).toBe('passwordCancelled');
    expect(flow.verify(PROOF)).toBe(false);
  });

  it('401 or another 403 on the change ends it: refused', () => {
    for (const error of [
      { kind: 'forbidden', code: 'forbidden', status: 403 },
      { kind: 'unauthenticated', status: 401 },
    ] as const) {
      TestBed.resetTestingModule();
      const { flow, changing } = setUp();
      refuse(changing()?.answer, error);
      expect(flow.state()).toEqual({ phase: 'refused' });
    }
  });

  describe('unknown outcomes: never resent; the session still being signed in proves nothing', () => {
    const unclear: [string, AppError][] = [
      ['a lost answer', { kind: 'network', status: 0 }],
      ['500', { kind: 'unexpected', status: 500 }],
      ['502', { kind: 'unexpected', status: 502 }],
      ['503', { kind: 'unavailable', status: 503 }],
      ['504', { kind: 'unavailable', status: 504 }],
      ['a 400 without Core’s code', { kind: 'validation', messages: [], status: 400 }],
      ['a 400 with another code', { kind: 'validation', code: 'other', messages: [], status: 400 }],
      ['an unexpected 409', { kind: 'conflict', status: 409 }],
    ];
    for (const [name, error] of unclear)
      it(`${name} is unknown: the password dropped, nothing resent`, () => {
        vi.useFakeTimers();
        try {
          const { flow, security, stepUp, changing } = setUp();
          const before = flow.clearings();
          refuse(changing()?.answer, error);
          expect(flow.state()).toEqual({ phase: 'unknown' });
          expect(flow.clearings()).toBeGreaterThan(before);
          vi.advanceTimersByTime(10 * 60_000);
          expect(security.changes).toHaveLength(1);
          expect(stepUp.calls).toHaveLength(1);
        } finally {
          vi.useRealTimers();
        }
      });

    it('"Set your password again" starts a completely new attempt: empty fields, a new password, a new grant', () => {
      const { flow, security, stepUp, changing } = setUp();
      refuse(changing()?.answer, { kind: 'network', status: 0 });
      expect(flow.verify(PROOF)).toBe(false);
      flow.startOver();
      expect(flow.state()).toEqual({ phase: 'editing', rejected: false });
      expect(flow.submit('another passphrase', 'another passphrase')).toBe(true);
      flow.verify(PROOF);
      reply(stepUp.calls[1]?.answer, { token: 'second', expiresAt: '2026-10-25T09:40:00Z' });
      expect(security.changes.map((c) => [c.password, c.token])).toEqual([
        [PASSWORD, 'grant-1'],
        ['another passphrase', 'second'],
      ]);
    });
  });

  describe('session changes and late answers', () => {
    it('a sign-out, another owner or a new session of the same owner drops it; a late answer is ignored', () => {
      for (const change of [
        (session: AuthSession) => session.signOut(),
        (session: AuthSession) => session.establish(otherOwner),
        (session: AuthSession) => session.establish(owner),
      ]) {
        TestBed.resetTestingModule();
        const { flow, session, notices, changing } = setUp();
        const answer = changing();
        change(session);
        TestBed.tick();
        expect(flow.state()).toEqual({ phase: 'refused' });
        done(answer?.answer);
        expect(flow.state()).toEqual({ phase: 'refused' });
        expect(notices.takeNotice()).toBeNull();
      }
    });

    it('a grant that arrives after the session changed is never used', () => {
      const { flow, session, stepUp, security, editing } = setUp();
      editing();
      flow.submit(PASSWORD, PASSWORD);
      flow.verify(PROOF);
      session.establish(owner);
      reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
      expect(security.changes).toHaveLength(0);
      expect(flow.state()).toEqual({ phase: 'refused' });
    });

    it('leaving the page drops the password; a late answer changes nothing', () => {
      const { flow, injector, notices, changing } = setUp();
      const answer = changing();
      injector.destroy();
      expect(flow.state()).toEqual({ phase: 'idle' });
      done(answer?.answer);
      expect(notices.takeNotice()).toBeNull();
    });
  });

  describe('eligibility', () => {
    it('a passkey-only owner is told why; nothing is offered', () => {
      const { flow, security } = setUp();
      flow.start();
      reply(security.loads[0], { factors: [passkey] });
      expect(flow.state()).toEqual({ phase: 'noAuthenticator' });
      expect(flow.submit(PASSWORD, PASSWORD)).toBe(false);
    });

    it('refuses an operator assigned everywhere without any request', () => {
      const { flow, security } = setUp(operator);
      flow.start();
      expect(flow.state()).toEqual({ phase: 'refused' });
      expect(security.loads).toHaveLength(0);
    });

    it('a production build is not available; an unreadable list offers a manual Try again', () => {
      const { flow, security } = setUp();
      flow.start();
      refuse(security.loads[0], adapterUnavailable());
      expect(flow.state()).toEqual({ phase: 'notInBuild' });
      TestBed.resetTestingModule();
      const second = setUp();
      second.flow.start();
      refuse(second.security.loads[0], { kind: 'network', status: 0 });
      expect(second.flow.state()).toEqual({ phase: 'loadFailed' });
      second.flow.retryCheck();
      expect(second.security.loads).toHaveLength(2);
    });
  });
});
