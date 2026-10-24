import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { companyId, platformId } from '../context/scope.model';
import { AppError } from '../errors/app-error';
import { Actor } from './actor';
import { AuthGateway, UnavailableAuthGateway } from './auth.gateway';
import { Grants } from './auth.model';
import { AuthSession } from './auth-session';
import { OperatorGrantsRefresh } from './operator-grants-refresh';

const S = platformId('school');
const D = platformId('drive');

/** A gateway whose `/auth/grants` answers only when the spec says so: one pending answer per request. */
class ControlledGateway extends UnavailableAuthGateway {
  readonly requests: Subject<Grants>[] = [];
  override grants(): Observable<Grants> {
    const answer = new Subject<Grants>();
    this.requests.push(answer);
    return answer;
  }
  answer(i: number, platformAssignments: readonly ReturnType<typeof platformId>[]): void {
    this.requests[i]!.next({ companyId: null, platformAssignments });
    this.requests[i]!.complete();
  }
  fail(i: number, error: AppError): void {
    this.requests[i]!.error(error);
  }
}

const operator = (userId = 'p', platformAssignments = [S, D]): Actor => ({
  kind: 'operator',
  userId,
  email: `${userId}@x.invalid`,
  platformAssignments,
});

const STUB = { providers: {} } as unknown as DemoBindings;

function setUp(actor: Actor | null = operator()) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => STUB } },
      },
      { provide: AuthGateway, useClass: ControlledGateway },
      OperatorGrantsRefresh,
    ],
  });
  const session = TestBed.inject(AuthSession);
  if (actor) session.establish(actor);
  const gateway = TestBed.inject(AuthGateway) as ControlledGateway;
  const refresh = TestBed.inject(OperatorGrantsRefresh);
  const platforms = () => {
    const a = session.actor();
    return a?.kind === 'operator' ? a.platformAssignments : null;
  };
  return { session, gateway, refresh, platforms, router: TestBed.inject(Router) };
}

describe('OperatorGrantsRefresh (P6-S2b)', () => {
  it('replaces the operator’s list with Core’s current grants: a removal and an addition', () => {
    const { gateway, refresh, platforms } = setUp();
    refresh.refresh('visibility');
    gateway.answer(0, [S]);
    expect(platforms()).toEqual([S]);
    refresh.refresh('switch');
    gateway.answer(1, [S, D]);
    expect(platforms()).toEqual([S, D]);
  });

  it('keeps the same actor object when the grants are identical (no reload anywhere)', () => {
    const { gateway, refresh, session } = setUp();
    const before = session.actor();
    refresh.refresh('visibility');
    gateway.answer(0, [D, S]);
    expect(session.actor()).toBe(before);
  });

  it('never asks for an owner, or without a session', () => {
    const owner: Actor = {
      kind: 'owner',
      userId: 'o',
      email: 'o@x.invalid',
      companyId: companyId('c'),
    };
    const s = setUp(owner);
    for (const trigger of ['refusal', 'visibility', 'switch', 'retry'] as const)
      s.refresh.refresh(trigger, S);
    expect(s.gateway.requests).toHaveLength(0);
    s.session.signOut();
    s.refresh.refresh('retry');
    expect(s.gateway.requests).toHaveLength(0);
  });

  it('absorbs overlapping triggers: one request, and exactly one follow-up for a refusal during it', () => {
    const { gateway, refresh, platforms } = setUp();
    refresh.refresh('switch');
    refresh.refresh('visibility');
    refresh.refresh('switch');
    expect(gateway.requests).toHaveLength(1);
    refresh.refresh('refusal', D);
    refresh.refresh('refusal', D);
    refresh.refresh('retry', D);
    expect(gateway.requests).toHaveLength(1);
    // The answer in flight predates the removal (still [S, D]); the follow-up brings the current grants.
    gateway.answer(0, [S, D]);
    expect(gateway.requests).toHaveLength(2);
    gateway.answer(1, [S]);
    expect(platforms()).toEqual([S]);
    expect(gateway.requests).toHaveLength(2);
    expect(refresh.notice()).toEqual({ kind: 'refreshed', platformId: D });
  });

  it('drops an answer for a session that ended or was replaced meanwhile', () => {
    const { gateway, refresh, session, platforms } = setUp();
    refresh.refresh('visibility');
    session.signOut();
    session.establish(operator('p', [S, D]));
    gateway.answer(0, []);
    expect(platforms()).toEqual([S, D]);
    refresh.refresh('visibility');
    session.establish(operator('q', [S]));
    gateway.answer(1, []);
    expect(session.actor()?.userId).toBe('q');
    expect(platforms()).toEqual([S]);
  });

  it('ends the session on a genuine 401 and opens sign-in with the neutral reason', async () => {
    const { gateway, refresh, session, router } = setUp();
    refresh.refresh('refusal', D);
    refresh.refresh('refusal', D);
    gateway.fail(0, { kind: 'unauthenticated', status: 401 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.actor()).toBeNull();
    expect(router.url).toBe('/login?reason=session-expired');
    // The queued follow-up was dropped with the session.
    expect(gateway.requests).toHaveLength(1);
    expect(refresh.notice()).toBeNull();
  });

  it('keeps the session and the last known list on a transient failure; a refusal is told, then retried', () => {
    const { gateway, refresh, session, platforms } = setUp();
    const failures: AppError[] = [
      { kind: 'network', status: 0 },
      { kind: 'rate_limited', status: 429 },
      { kind: 'unavailable', status: 503 },
    ];
    failures.forEach((error, i) => {
      refresh.refresh('refusal', D);
      gateway.fail(i, error);
      expect(session.actor()).not.toBeNull();
      expect(platforms()).toEqual([S, D]);
      expect(refresh.notice()).toEqual({ kind: 'unavailable', platformId: D });
    });
    refresh.refresh('retry', D);
    expect(refresh.notice()).toBeNull();
    gateway.answer(3, [S]);
    expect(platforms()).toEqual([S]);
    expect(refresh.notice()).toEqual({ kind: 'refreshed', platformId: D });
  });

  it('tells nothing for a silent trigger (tab return, switch), whatever the answer', () => {
    const { gateway, refresh } = setUp();
    refresh.refresh('visibility');
    gateway.fail(0, { kind: 'unavailable', status: 503 });
    refresh.refresh('switch');
    gateway.answer(1, [S]);
    expect(refresh.notice()).toBeNull();
  });

  it('refreshes when the tab becomes visible again, and never by itself (no polling)', async () => {
    const { gateway } = setUp();
    const document = TestBed.inject(DOCUMENT);
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(gateway.requests).toHaveLength(0);
    visibility.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(gateway.requests).toHaveLength(1);
    gateway.answer(0, [S, D]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gateway.requests).toHaveLength(1);
    visibility.mockRestore();
  });
});
