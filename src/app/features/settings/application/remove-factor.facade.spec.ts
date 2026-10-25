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
import { RemoveFactorFacade } from './remove-factor.facade';

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

const factor = (id: string, type: SecurityFactor['type'], confirmed = true): SecurityFactor => ({
  id,
  type,
  confirmed,
  createdAt: null,
  lastUsedAt: null,
});
const T1 = factor('t1', 'totp');
const T2 = factor('t2', 'totp');
const P1 = factor('p1', 'webauthn');
/** Three confirmed factors: the second authenticator app is removable. */
const THREE = [T1, P1, T2];

/** Every call is answered by the test, when it chooses (so in-flight, lost and late answers can be staged). */
class FakeSecurity extends AccountSecurityGateway {
  readonly loads: Subject<AccountSecurity>[] = [];
  readonly removals: { factorId: string; token: string; answer: Subject<void> }[] = [];
  load(): Observable<AccountSecurity> {
    const answer = new Subject<AccountSecurity>();
    this.loads.push(answer);
    return answer;
  }
  beginTotp(): Observable<TotpEnrollment> {
    throw new Error('not used by removing a factor');
  }
  confirmTotp(): Observable<void> {
    throw new Error('not used by removing a factor');
  }
  rotateSecretKey(): Observable<SecretKeyIssue> {
    throw new Error('not used by removing a factor');
  }
  removeFactor(factorId: string, token: string): Observable<void> {
    const answer = new Subject<void>();
    this.removals.push({ factorId, token, answer });
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
  const notices = TestBed.inject(AccountSecurityFacade);
  // The Security list's own reloads are counted, not answered (they would interleave with the removal's reads).
  const reloads = vi.spyOn(notices, 'reload').mockImplementation(() => undefined);
  // Page-scoped, like the Security page's own provider: destroying the injector is leaving the page.
  const injector = createEnvironmentInjector(
    [RemoveFactorFacade],
    TestBed.inject(EnvironmentInjector),
  );
  const flow = injector.get(RemoveFactorFacade);
  let grants = 0;
  const grant = (): StepUpGrant => ({
    token: `grant-${(grants += 1).toString()}`,
    expiresAt: '2026-10-25T09:35:00Z',
  });
  /** Opened on `target` and answered with `factors`. */
  const opened = (target = T2.id, factors: SecurityFactor[] = THREE) => {
    expect(flow.open(target)).toBe(true);
    reply(security.loads.at(-1), { factors });
  };
  /** Confirmed and verified: the removal is in flight. */
  const removing = () => {
    if (flow.state().phase === 'closed') opened();
    expect(flow.state().phase).toBe('confirming');
    flow.proceed();
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls.at(-1)?.answer, grant());
    expect(flow.state().phase).toBe('removing');
    return security.removals.at(-1);
  };
  return { flow, security, stepUp, session, injector, reloads, opened, removing };
}

describe('RemoveFactorFacade (P9-S4d)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opening reads the list again and offers the confirmation; nothing is verified or removed', () => {
    const { flow, security, stepUp, opened } = setUp();
    opened();
    expect(security.loads).toHaveLength(1);
    expect(flow.state()).toEqual({
      phase: 'confirming',
      target: { factor: T2, number: 2, remaining: 2 },
    });
    expect(flow.open(T1.id)).toBe(false);
    expect(stepUp.calls).toHaveLength(0);
    expect(security.removals).toHaveLength(0);
  });

  it('a removal that leaves one confirmed factor says so (remaining 1)', () => {
    const { flow, opened } = setUp();
    opened(T2.id, [T1, T2]);
    expect(flow.state()).toMatchObject({ phase: 'confirming', target: { remaining: 1 } });
  });

  it('offers nothing it may not remove: the last factor, a passkey-only owner, the last authenticator app, an unfinished setup', () => {
    const cases: [string, SecurityFactor[], string][] = [
      [T1.id, [T1], 'lastFactor'],
      [P1.id, [P1, factor('p2', 'webauthn')], 'noAuthenticator'],
      [T1.id, [T1, P1], 'lastAuthenticator'],
      ['u', [T1, T2, factor('u', 'totp', false)], 'unfinished'],
    ];
    for (const [target, factors, reason] of cases) {
      TestBed.resetTestingModule();
      const { flow, stepUp, opened } = setUp();
      opened(target, factors);
      expect(flow.state()).toEqual({ phase: 'blocked', reason });
      flow.proceed();
      expect(flow.verify(PROOF)).toBe(false);
      expect(stepUp.calls).toHaveLength(0);
    }
  });

  it('a factor already gone when the dialog opens: absent, the list reloaded, never attributed to a removal', () => {
    const { flow, reloads, security, opened } = setUp();
    opened(T2.id, [T1, P1]);
    expect(flow.state()).toEqual({ phase: 'closed' });
    expect(flow.outcome()).toBe('absent');
    expect(reloads).toHaveBeenCalledTimes(1);
    expect(security.removals).toHaveLength(0);
  });

  it('an unreadable list when opening: nothing was sent; only a manual Try again', () => {
    const { flow, security } = setUp();
    flow.open(T2.id);
    refuse(security.loads[0], { kind: 'network', status: 0 });
    expect(flow.state()).toEqual({ phase: 'refreshFailed' });
    flow.retry();
    expect(security.loads).toHaveLength(2);
    reply(security.loads[1], { factors: THREE });
    expect(flow.state().phase).toBe('confirming');
  });

  it('verifies for owner.factor.remove with an authenticator code, then sends ONE removal with that grant', () => {
    const { flow, stepUp, security, opened } = setUp();
    opened();
    flow.proceed();
    expect(flow.verify('12 34')).toBe(false);
    expect(flow.verify(' 123 456 ')).toBe(true);
    expect(stepUp.calls.map((c) => [c.purpose, c.proof])).toEqual([
      ['owner.factor.remove', { method: 'totp', code: '123456' }],
    ]);
    reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
    expect(security.removals.map((r) => [r.factorId, r.token])).toEqual([[T2.id, 'g']]);
  });

  it('ignores duplicate submissions and cannot be dismissed once the removal is sent', () => {
    const { flow, stepUp, security, opened } = setUp();
    opened();
    flow.proceed();
    expect(flow.verify(PROOF)).toBe(true);
    expect(flow.verify(PROOF)).toBe(false);
    reply(stepUp.calls[0]?.answer, { token: 'g', expiresAt: '2026-10-25T09:35:00Z' });
    expect(flow.locked()).toBe(true);
    expect(flow.close()).toBe(false);
    expect(flow.verify(PROOF)).toBe(false);
    flow.back();
    expect(flow.state().phase).toBe('removing');
    expect(stepUp.calls).toHaveLength(1);
    expect(security.removals).toHaveLength(1);
  });

  it('204: removed; the dialog closes, the list reloads, the page says so', () => {
    const { flow, reloads, removing } = setUp();
    done(removing()?.answer);
    expect(flow.state()).toEqual({ phase: 'closed' });
    expect(flow.outcome()).toBe('removed');
    expect(reloads).toHaveBeenCalledTimes(1);
  });

  it('404: absent (not attributed to this request)', () => {
    const { flow, removing } = setUp();
    refuse(removing()?.answer, { kind: 'not_found', code: 'not_found', status: 404 });
    expect(flow.state()).toEqual({ phase: 'closed' });
    expect(flow.outcome()).toBe('absent');
  });

  it('409 factor_required: the last factor, nothing changed, the list reloaded', () => {
    const { flow, reloads, removing } = setUp();
    refuse(removing()?.answer, { kind: 'conflict', code: 'factor_required', status: 409 });
    expect(flow.state()).toMatchObject({ phase: 'lastFactor' });
    expect(reloads).toHaveBeenCalledTimes(1);
    expect(flow.outcome()).toBeNull();
  });

  it('403 step_up_required: verify again; the next removal carries a NEW grant (never reused)', () => {
    const { flow, stepUp, security, removing } = setUp();
    refuse(removing()?.answer, { kind: 'forbidden', code: 'step_up_required', status: 403 });
    expect(flow.state()).toMatchObject({ phase: 'verifying', busy: false, problem: 'expired' });
    expect(flow.verify(PROOF)).toBe(true);
    reply(stepUp.calls[1]?.answer, { token: 'fresh', expiresAt: '2026-10-25T09:40:00Z' });
    expect(security.removals.map((r) => r.token)).toEqual(['grant-1', 'fresh']);
  });

  it('a refused proof stays on the verification; 429 from the verification or the removal stops until the owner resumes', () => {
    const { flow, stepUp, security, opened, removing } = setUp();
    opened();
    flow.proceed();
    flow.verify(PROOF);
    refuse(stepUp.calls[0]?.answer, { kind: 'unauthenticated', status: 401 });
    expect(flow.state()).toMatchObject({ phase: 'verifying', problem: 'proofRefused' });
    flow.verify(PROOF);
    refuse(stepUp.calls[1]?.answer, { kind: 'rate_limited', status: 429 });
    expect(flow.state()).toMatchObject({ phase: 'rateLimited' });
    flow.resume();
    expect(flow.state()).toMatchObject({ phase: 'verifying', problem: null });
    flow.back();
    refuse(removing()?.answer, { kind: 'rate_limited', status: 429 });
    expect(flow.state()).toMatchObject({ phase: 'rateLimited' });
    expect(security.removals).toHaveLength(1);
  });

  it('401 or another 403 on the removal ends it: refused', () => {
    for (const error of [
      { kind: 'forbidden', code: 'forbidden', status: 403 },
      { kind: 'unauthenticated', status: 401 },
    ] as const) {
      TestBed.resetTestingModule();
      const { flow, removing } = setUp();
      refuse(removing()?.answer, error);
      expect(flow.state()).toEqual({ phase: 'refused' });
    }
  });

  describe('unclear answers: the list decides, nothing is resent', () => {
    const unclear: [string, AppError][] = [
      ['a lost answer', { kind: 'network', status: 0 }],
      ['500', { kind: 'unexpected', status: 500 }],
      ['502', { kind: 'unexpected', status: 502 }],
      ['503', { kind: 'unavailable', status: 503 }],
      ['504', { kind: 'unavailable', status: 504 }],
      ['an unexpected 400', { kind: 'validation', messages: [], status: 400 }],
      ['another 409', { kind: 'conflict', status: 409 }],
    ];
    for (const [name, error] of unclear)
      it(`${name}: gone on read-back → absent (not "removed"), never resent`, () => {
        const { flow, security, stepUp, removing } = setUp();
        refuse(removing()?.answer, error);
        expect(flow.state().phase).toBe('reconciling');
        expect(flow.locked()).toBe(true);
        reply(security.loads.at(-1), { factors: [T1, P1] });
        expect(flow.state()).toEqual({ phase: 'closed' });
        expect(flow.outcome()).toBe('absent');
        expect(security.removals).toHaveLength(1);
        expect(stepUp.calls).toHaveLength(1);
      });

    it('still there on read-back: nothing changed; a new attempt starts again from a fresh read and a new grant', () => {
      const { flow, security, stepUp, removing } = setUp();
      refuse(removing()?.answer, { kind: 'network', status: 0 });
      reply(security.loads.at(-1), { factors: THREE });
      expect(flow.state()).toMatchObject({ phase: 'stillPresent' });
      flow.retry();
      reply(security.loads.at(-1), { factors: THREE });
      expect(flow.state().phase).toBe('confirming');
      removing();
      expect(stepUp.calls).toHaveLength(2);
      expect(security.removals.map((r) => r.token)).toEqual(['grant-1', 'grant-2']);
    });

    it('unreadable on read-back: unknown; Check again only reads the list', () => {
      const { flow, security, removing } = setUp();
      refuse(removing()?.answer, { kind: 'unexpected', status: 500 });
      refuse(security.loads.at(-1), { kind: 'network', status: 0 });
      expect(flow.state()).toMatchObject({ phase: 'unknown' });
      expect(flow.locked()).toBe(false);
      flow.checkAgain();
      expect(flow.state().phase).toBe('reconciling');
      reply(security.loads.at(-1), { factors: [T1, P1] });
      expect(flow.outcome()).toBe('absent');
      expect(security.removals).toHaveLength(1);
    });
  });

  describe('closing, session changes and late answers', () => {
    it('Cancel before anything is sent drops it; a grant arriving afterwards is never used', () => {
      const { flow, stepUp, security, opened } = setUp();
      opened();
      flow.proceed();
      flow.verify(PROOF);
      expect(flow.close()).toBe(true);
      expect(flow.state()).toEqual({ phase: 'closed' });
      reply(stepUp.calls[0]?.answer, { token: 'late', expiresAt: '2026-10-25T09:35:00Z' });
      expect(security.removals).toHaveLength(0);
      expect(flow.outcome()).toBeNull();
    });

    it('a sign-out, another owner or a new session of the same owner drops the removal; its late answer is ignored', () => {
      for (const change of [
        (session: AuthSession) => session.signOut(),
        (session: AuthSession) => session.establish(otherOwner),
        (session: AuthSession) => session.establish(owner),
      ]) {
        TestBed.resetTestingModule();
        const { flow, session, reloads, removing } = setUp();
        const removal = removing();
        change(session);
        TestBed.tick();
        expect(flow.state()).toEqual({ phase: 'refused' });
        done(removal?.answer);
        expect(flow.state()).toEqual({ phase: 'refused' });
        expect(flow.outcome()).toBeNull();
        expect(reloads).not.toHaveBeenCalled();
      }
    });

    it('leaving the page drops everything; a late answer changes nothing', () => {
      const { flow, injector, reloads, removing } = setUp();
      const removal = removing();
      injector.destroy();
      expect(flow.state()).toEqual({ phase: 'closed' });
      done(removal?.answer);
      expect(flow.outcome()).toBeNull();
      expect(reloads).not.toHaveBeenCalled();
    });
  });

  it('refuses an operator assigned everywhere without any request', () => {
    const { flow, security } = setUp(operator);
    expect(flow.open(T1.id)).toBe(true);
    expect(flow.state()).toEqual({ phase: 'refused' });
    expect(security.loads).toHaveLength(0);
  });

  it('a production build (no adapter) is not available: nothing is read or sent', () => {
    const { flow, security } = setUp();
    flow.open(T2.id);
    refuse(security.loads[0], adapterUnavailable());
    expect(flow.state()).toEqual({ phase: 'notInBuild' });
    expect(security.removals).toHaveLength(0);
  });
});
