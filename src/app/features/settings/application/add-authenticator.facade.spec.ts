import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { FactorProof, TotpEnrollment } from '../../../core/auth/auth.model';
import { StepUpGateway, StepUpGrant, StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { companyId, platformId } from '../../../core/context/scope.model';
import { AppError, adapterUnavailable } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  AccountSecurity,
  AccountSecurityGateway,
  SecretKeyIssue,
  SecurityFactor,
} from '../data-access/account-security.gateway';
import { AccountSecurityFacade } from './account-security.facade';
import { AddAuthenticatorFacade, GRANT_REUSE_MARGIN_MS } from './add-authenticator.facade';

const NOW = Date.parse('2026-10-25T09:30:00Z');
const FACTOR = '0b6f8f0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const NEW_CODE = '246810';
const PROOF = '123456';
const SETUP: TotpEnrollment = {
  factorId: FACTOR,
  secret: 'ABCDEFGHIJKLMNOP',
  otpauthUri: 'otpauth://totp/Nawara%20Admin:o%40x.invalid?secret=ABCDEFGHIJKLMNOP',
};

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
  platformAssignments: [platformId('school')],
};

const totp = (id: string, confirmed = true): SecurityFactor => ({
  id,
  type: 'totp',
  confirmed,
  createdAt: null,
  lastUsedAt: null,
});
const passkey: SecurityFactor = { ...totp('pk'), type: 'webauthn' };
const EXISTING = totp('existing');

/** Every call is answered by the test, when it chooses (so in-flight, lost and late answers can be staged). */
class FakeSecurity extends AccountSecurityGateway {
  readonly loads: Subject<AccountSecurity>[] = [];
  readonly begins: Subject<TotpEnrollment>[] = [];
  readonly confirms: { factorId: string; code: string; token: string; answer: Subject<void> }[] =
    [];
  load(): Observable<AccountSecurity> {
    const answer = new Subject<AccountSecurity>();
    this.loads.push(answer);
    return answer;
  }
  beginTotp(): Observable<TotpEnrollment> {
    const answer = new Subject<TotpEnrollment>();
    this.begins.push(answer);
    return answer;
  }
  confirmTotp(factorId: string, code: string, token: string): Observable<void> {
    const answer = new Subject<void>();
    this.confirms.push({ factorId, code, token, answer });
    return answer;
  }
  rotateSecretKey(): Observable<SecretKeyIssue> {
    throw new Error('not used by adding an authenticator');
  }
  removeFactor(): Observable<void> {
    throw new Error('not used by adding an authenticator');
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
  const clock = { now: NOW };
  const security = new FakeSecurity();
  const stepUp = new FakeStepUp();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: NW_CLOCK, useValue: () => clock.now },
      { provide: AccountSecurityGateway, useValue: security },
      { provide: StepUpGateway, useValue: stepUp },
      AccountSecurityFacade,
    ],
  });
  const session = TestBed.inject(AuthSession);
  session.establish(actor);
  // Page-scoped, like the page's own provider: destroying the injector is leaving the page.
  const injector = createEnvironmentInjector(
    [AddAuthenticatorFacade],
    TestBed.inject(EnvironmentInjector),
  );
  const flow = injector.get(AddAuthenticatorFacade);
  const notices = TestBed.inject(AccountSecurityFacade);
  const grant = (token = 'grant-1', ttl = 300_000): StepUpGrant => ({
    token,
    expiresAt: new Date(clock.now + ttl).toISOString(),
  });
  /** Starts, answers the factor check with `factors`, and the begin with the setup. */
  const ready = (factors: SecurityFactor[] = [EXISTING, passkey]) => {
    flow.start();
    reply(security.loads.at(-1), { factors });
    reply(security.begins.at(-1), SETUP);
  };
  /** Ready, the new code entered, and the proof verified: the confirmation is now in flight. */
  const confirming = (token = 'grant-1', ttl = 300_000) => {
    ready();
    expect(flow.submitCode(NEW_CODE)).toBe(true);
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls.at(-1)?.answer, grant(token, ttl));
    return security.confirms.at(-1);
  };
  return { flow, security, stepUp, session, clock, injector, notices, ready, confirming, grant };
}

const phase = (flow: AddAuthenticatorFacade) => flow.state().phase;

describe('AddAuthenticatorFacade (P9-S4b state machine)', () => {
  describe('starting', () => {
    it('checks the factors, then begins one setup and holds its key in memory', () => {
      const { flow, security } = setUp();
      expect(phase(flow)).toBe('idle');
      flow.start();
      expect(phase(flow)).toBe('checking');
      expect(security.begins).toHaveLength(0);
      reply(security.loads[0], { factors: [EXISTING] });
      expect(phase(flow)).toBe('beginning');
      flow.start();
      expect(security.begins).toHaveLength(1);
      reply(security.begins[0], SETUP);
      expect(flow.state()).toEqual({ phase: 'setup', notice: null });
      expect(flow.setup()).toEqual({ secret: SETUP.secret, otpauthUri: SETUP.otpauthUri });
    });

    it('a passkey-only owner (no confirmed authenticator) is told why, and nothing is begun', () => {
      const { flow, security } = setUp();
      flow.start();
      reply(security.loads[0], { factors: [passkey, totp('unfinished', false)] });
      expect(phase(flow)).toBe('noAuthenticator');
      expect(security.begins).toHaveLength(0);
      expect(flow.setup()).toBeNull();
    });

    it('anyone but the owner is refused without a request', () => {
      for (const actor of [operator]) {
        const { flow, security } = setUp(actor);
        flow.start();
        expect(phase(flow)).toBe('refused');
        expect(security.loads).toHaveLength(0);
        TestBed.resetTestingModule();
      }
    });

    it('a production build (no adapter) is not available, and begins nothing', () => {
      const { flow, security } = setUp();
      flow.start();
      refuse(security.loads[0], adapterUnavailable());
      expect(phase(flow)).toBe('notInBuild');
      expect(security.begins).toHaveLength(0);
    });

    it('a rate-limited or failed begin waits for a manual "Try again", never retrying by itself', async () => {
      const { flow, security } = setUp();
      flow.start();
      reply(security.loads[0], { factors: [EXISTING] });
      refuse(security.begins[0], { kind: 'rate_limited', status: 429 });
      expect(flow.state()).toEqual({ phase: 'beginFailed', reason: 'rateLimited' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(security.loads).toHaveLength(1);
      expect(security.begins).toHaveLength(1);
      flow.retryBegin();
      reply(security.loads[1], { factors: [EXISTING] });
      refuse(security.begins[1], { kind: 'network', status: 0 });
      expect(flow.state()).toEqual({ phase: 'beginFailed', reason: 'unavailable' });
      flow.retryBegin();
      reply(security.loads[2], { factors: [EXISTING] });
      reply(security.begins[2], SETUP);
      expect(phase(flow)).toBe('setup');
    });
  });

  describe('confirming', () => {
    it('new code first, then the existing factor (owner.factor.enroll, TOTP), then one confirmation: success', () => {
      const { flow, security, stepUp, notices, ready, grant } = setUp();
      ready();
      expect(flow.submitCode('246 810')).toBe(true);
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: null });
      expect(security.confirms).toHaveLength(0);
      expect(flow.verify(PROOF)).toBe(true);
      expect(stepUp.calls.map((c) => [c.purpose, c.proof])).toEqual([
        ['owner.factor.enroll', { method: 'totp', code: PROOF }],
      ]);
      reply(stepUp.calls[0]?.answer, grant());
      expect(phase(flow)).toBe('confirming');
      expect(security.confirms.map(({ factorId, code, token }) => [factorId, code, token])).toEqual(
        [[FACTOR, NEW_CODE, 'grant-1']],
      );
      reply(security.confirms[0]?.answer, undefined);
      expect(phase(flow)).toBe('succeeded');
      expect(flow.setup()).toBeNull();
      expect(notices.takeNotice()).toBe('added');
    });

    it('validates the codes’ shape locally: nothing is sent for anything but six digits', () => {
      const { flow, stepUp, security, ready } = setUp();
      ready();
      for (const bad of ['', '12345', '1234567', 'abcdef'])
        expect(flow.submitCode(bad)).toBe(false);
      expect(phase(flow)).toBe('setup');
      flow.submitCode(NEW_CODE);
      expect(flow.verify('12')).toBe(false);
      expect(stepUp.calls).toHaveLength(0);
      expect(security.confirms).toHaveLength(0);
    });

    it('an incorrect new code (400 verification_failed), then the right one: the unspent grant is reused, no second proof', () => {
      const { flow, security, stepUp, confirming } = setUp();
      refuse(confirming()?.answer, {
        kind: 'validation',
        code: 'verification_failed',
        messages: [],
        status: 400,
      });
      // one list read explains the definite refusal: still this owner's unconfirmed setup → a wrong code
      expect(phase(flow)).toBe('confirming');
      reply(security.loads.at(-1), { factors: [EXISTING, totp(FACTOR, false)] });
      expect(flow.state()).toEqual({ phase: 'codeRefused', grantKept: true });
      expect(flow.setup()).not.toBeNull();
      expect(flow.submitCode(NEW_CODE)).toBe(true);
      expect(phase(flow)).toBe('confirming');
      expect(stepUp.calls).toHaveLength(1);
      expect(security.confirms.map((c) => c.token)).toEqual(['grant-1', 'grant-1']);
      reply(security.confirms[1]?.answer, undefined);
      expect(phase(flow)).toBe('succeeded');
    });

    it('a malformed request (400 validation_error) is a definite refusal too, with no list read', () => {
      const { flow, security, confirming } = setUp();
      const pending = confirming();
      const loads = security.loads.length;
      refuse(pending?.answer, {
        kind: 'validation',
        code: 'validation_error',
        messages: [],
        status: 400,
      });
      expect(flow.state()).toEqual({ phase: 'codeRefused', grantKept: true });
      expect(security.loads).toHaveLength(loads);
    });

    it('a kept grant about to expire is not reused: the owner confirms it’s them again', () => {
      const { flow, security, stepUp, clock, confirming, grant } = setUp();
      refuse(confirming('grant-1', 60_000)?.answer, {
        kind: 'validation',
        code: 'verification_failed',
        messages: [],
        status: 400,
      });
      reply(security.loads.at(-1), { factors: [totp(FACTOR, false)] });
      expect(flow.state()).toEqual({ phase: 'codeRefused', grantKept: true });
      clock.now = NOW + 60_000 - GRANT_REUSE_MARGIN_MS;
      flow.submitCode(NEW_CODE);
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: null });
      flow.verify(PROOF);
      expect(stepUp.calls).toHaveLength(2);
      reply(stepUp.calls[1]?.answer, grant('grant-2'));
      expect(security.confirms.at(-1)?.token).toBe('grant-2');
    });

    it('a refused grant (403 step_up_required: expired or spent) asks to confirm again, keeping the new code', () => {
      const { flow, security, stepUp, confirming, grant } = setUp();
      refuse(confirming()?.answer, { kind: 'forbidden', code: 'step_up_required', status: 403 });
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: 'expired' });
      flow.verify(PROOF);
      reply(stepUp.calls[1]?.answer, grant('grant-2'));
      expect(security.confirms.at(-1)).toMatchObject({ code: NEW_CODE, token: 'grant-2' });
    });

    it('a refused proof (401) stays on "Confirm it’s you"; nothing is confirmed', () => {
      const { flow, stepUp, security, ready } = setUp();
      ready();
      flow.submitCode(NEW_CODE);
      flow.verify('000000');
      refuse(stepUp.calls[0]?.answer, { kind: 'unauthenticated', status: 401 });
      expect(flow.state()).toEqual({ phase: 'verifying', busy: false, problem: 'proofRefused' });
      expect(security.confirms).toHaveLength(0);
      expect(flow.setup()).not.toBeNull();
    });

    it('the grant is bound to the owner who started: another owner’s session never sends it', () => {
      const { flow, security, session, confirming } = setUp();
      refuse(confirming()?.answer, {
        kind: 'validation',
        code: 'validation_error',
        messages: [],
        status: 400,
      });
      session.establish(otherOwner);
      TestBed.tick();
      expect(phase(flow)).toBe('refused');
      expect(flow.submitCode(NEW_CODE)).toBe(false);
      expect(security.confirms).toHaveLength(1);
    });
  });

  describe('lost answers and reconciliation', () => {
    it('a lost answer is never resent: the list shows it confirmed → success', () => {
      const { flow, security, notices, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'network', status: 0 });
      expect(phase(flow)).toBe('reconciling');
      reply(security.loads.at(-1), { factors: [EXISTING, totp(FACTOR, true)] });
      expect(phase(flow)).toBe('succeeded');
      expect(security.confirms).toHaveLength(1);
      expect(notices.takeNotice()).toBe('added');
    });

    it('still pending after a lost answer → "not added yet", without claiming it failed; the grant is dropped', () => {
      const { flow, security, stepUp, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'unexpected', status: 500 });
      reply(security.loads.at(-1), { factors: [EXISTING, totp(FACTOR, false)] });
      expect(flow.state()).toEqual({ phase: 'notConfirmed' });
      expect(security.confirms).toHaveLength(1);
      flow.submitCode(NEW_CODE);
      expect(phase(flow)).toBe('verifying');
      expect(stepUp.calls).toHaveLength(1);
    });

    it('missing after a lost answer → replaced: the setup is dropped, and only a new setup continues', () => {
      const { flow, security, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'network', status: 0 });
      reply(security.loads.at(-1), { factors: [EXISTING, totp('newer', false)] });
      expect(phase(flow)).toBe('replaced');
      expect(flow.setup()).toBeNull();
      expect(flow.submitCode(NEW_CODE)).toBe(false);
      flow.restart();
      expect(phase(flow)).toBe('beginning');
      expect(security.begins).toHaveLength(2);
    });

    it('an unreadable list keeps the uncertainty: "unknown", and "Check again" only reads again', () => {
      const { flow, security, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'network', status: 0 });
      refuse(security.loads.at(-1), { kind: 'unavailable', status: 503 });
      expect(phase(flow)).toBe('unknown');
      const loads = security.loads.length;
      flow.checkAgain();
      expect(phase(flow)).toBe('reconciling');
      expect(security.loads).toHaveLength(loads + 1);
      expect(security.confirms).toHaveLength(1);
      reply(security.loads.at(-1), { factors: [EXISTING, totp(FACTOR, true)] });
      expect(phase(flow)).toBe('succeeded');
    });

    it('another tab’s newer setup: this confirmation is refused (400) and the list shows it gone → replaced', () => {
      const { flow, security, confirming } = setUp();
      refuse(confirming()?.answer, {
        kind: 'validation',
        code: 'verification_failed',
        messages: [],
        status: 400,
      });
      reply(security.loads.at(-1), { factors: [EXISTING, totp('other-tab', false)] });
      expect(phase(flow)).toBe('replaced');
    });

    it('a duplicate confirmation of a factor already confirmed (400) is reported as added', () => {
      const { flow, security, confirming } = setUp();
      refuse(confirming()?.answer, {
        kind: 'validation',
        code: 'verification_failed',
        messages: [],
        status: 400,
      });
      reply(security.loads.at(-1), { factors: [EXISTING, totp(FACTOR, true)] });
      expect(phase(flow)).toBe('succeeded');
    });

    it('a 503 confirmation applied nothing: back to the code, the grant dropped', () => {
      const { flow, stepUp, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'unavailable', status: 503 });
      expect(flow.state()).toEqual({ phase: 'setup', notice: 'unavailable' });
      flow.submitCode(NEW_CODE);
      expect(phase(flow)).toBe('verifying');
      expect(stepUp.calls).toHaveLength(1);
    });
  });

  describe('duplicates, rate limits, cancel, session and destruction', () => {
    it('ignores a second submit, proof or start while a request is in flight', () => {
      const { flow, security, stepUp, ready } = setUp();
      ready();
      flow.submitCode(NEW_CODE);
      flow.verify(PROOF);
      expect(flow.verify(PROOF)).toBe(false);
      expect(stepUp.calls).toHaveLength(1);
      reply(stepUp.calls[0]?.answer, {
        token: 'g',
        expiresAt: new Date(NOW + 300_000).toISOString(),
      });
      expect(flow.submitCode(NEW_CODE)).toBe(false);
      expect(flow.verify(PROOF)).toBe(false);
      expect(flow.cancel()).toBe(false);
      flow.start();
      expect(security.confirms).toHaveLength(1);
      expect(security.begins).toHaveLength(1);
    });

    it('429 on the confirmation or the proof stops: no automatic retry, the grant dropped, resume by hand', async () => {
      const { flow, security, stepUp, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'rate_limited', status: 429 });
      expect(phase(flow)).toBe('rateLimited');
      expect(flow.submitCode(NEW_CODE)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(security.confirms).toHaveLength(1);
      flow.resume();
      expect(phase(flow)).toBe('setup');
      flow.submitCode(NEW_CODE);
      expect(phase(flow)).toBe('verifying');
      flow.verify(PROOF);
      refuse(stepUp.calls[1]?.answer, { kind: 'rate_limited', status: 429 });
      expect(phase(flow)).toBe('rateLimited');
      expect(stepUp.calls).toHaveLength(2);
    });

    it('cancel drops the setup and leaves a notice; Core’s unfinished factor is not deleted (no call)', () => {
      const { flow, security, notices, ready } = setUp();
      ready();
      flow.submitCode(NEW_CODE);
      expect(flow.cancel()).toBe(true);
      expect(phase(flow)).toBe('cancelled');
      expect(flow.setup()).toBeNull();
      expect(notices.takeNotice()).toBe('cancelled');
      expect(security.confirms).toHaveLength(0);
    });

    it('a sign-out drops everything at once, and a late answer of the old session is ignored', () => {
      const { flow, security, session, confirming } = setUp();
      const pending = confirming();
      session.signOut();
      TestBed.tick();
      expect(phase(flow)).toBe('refused');
      expect(flow.setup()).toBeNull();
      reply(pending?.answer, undefined);
      expect(phase(flow)).toBe('refused');
      expect(security.loads).toHaveLength(1);
    });

    it('the same owner signing in again is a new session: the old flow is dropped too', () => {
      const { flow, session, ready } = setUp();
      ready();
      session.signOut();
      session.establish(owner);
      TestBed.tick();
      expect(phase(flow)).toBe('refused');
      expect(flow.setup()).toBeNull();
    });

    it('a 403 other than a step-up (no longer the owner) ends the flow', () => {
      const { flow, confirming } = setUp();
      refuse(confirming()?.answer, { kind: 'forbidden', code: 'forbidden', status: 403 });
      expect(phase(flow)).toBe('refused');
      expect(flow.setup()).toBeNull();
    });

    it('leaving the page (destroying it) disposes the key and ignores every later answer', () => {
      const { flow, security, injector, notices, confirming } = setUp();
      const pending = confirming();
      injector.destroy();
      expect(flow.state()).toEqual({ phase: 'idle' });
      expect(flow.setup()).toBeNull();
      reply(pending?.answer, undefined);
      expect(phase(flow)).toBe('idle');
      expect(notices.takeNotice()).toBeNull();
      flow.start();
      expect(phase(flow)).toBe('idle');
      expect(security.loads).toHaveLength(1);
    });
  });
});
