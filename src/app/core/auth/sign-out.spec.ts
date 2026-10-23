import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { companyId } from '../context/scope.model';
import { Actor } from './actor';
import { AuthGateway, UnavailableAuthGateway } from './auth.gateway';
import { AuthSession } from './auth-session';
import { SignOut } from './sign-out';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
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
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    stepUp: [],
  },
};

/** Counts logouts and answers with whatever the test sets. */
class CountingGateway extends UnavailableAuthGateway {
  calls = 0;
  answer: Observable<void> = of(undefined);
  override logout(): Observable<void> {
    this.calls += 1;
    return this.answer;
  }
}

function setUp() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: AuthGateway, useClass: CountingGateway },
      SignOut,
    ],
  });
  const session = TestBed.inject(AuthSession);
  session.establish(owner);
  const events: string[] = [];
  const router = TestBed.inject(Router);
  vi.spyOn(router, 'navigate').mockImplementation(async (commands, extras) => {
    events.push(
      `navigate ${commands.join('/')}?${new URLSearchParams(extras?.queryParams ?? {}).toString()}`,
    );
    return true;
  });
  return {
    signOut: TestBed.inject(SignOut),
    gateway: TestBed.inject(AuthGateway) as CountingGateway,
    session,
    events,
  };
}

describe('SignOut', () => {
  it('tells Core, ends the session, then shows "You have signed out" on the sign-in page', async () => {
    const { signOut, gateway, session, events } = setUp();
    await signOut.run(() =>
      events.push(`reset (actor ${session.actor() === null ? 'gone' : 'kept'})`),
    );
    expect(gateway.calls).toBe(1);
    expect(session.actor()).toBeNull();
    expect(events).toEqual(['reset (actor gone)', 'navigate /login?reason=signed-out']);
    expect(signOut.busy()).toBe(false);
  });

  it('still ends the local session when Core cannot be told', async () => {
    const { signOut, gateway, session, events } = setUp();
    gateway.answer = throwError(() => ({ kind: 'unavailable', status: 503 }));
    await signOut.run();
    expect(session.actor()).toBeNull();
    expect(events).toEqual(['navigate /login?reason=signed-out']);
    expect(signOut.busy()).toBe(false);
  });

  it('runs once however often it is asked while running', async () => {
    const { signOut, gateway, session, events } = setUp();
    const pending = new Subject<void>();
    gateway.answer = pending;
    const first = signOut.run();
    expect(signOut.busy()).toBe(true);
    await signOut.run();
    await signOut.run();
    expect(gateway.calls).toBe(1);
    expect(session.actor()).not.toBeNull();
    pending.next();
    pending.complete();
    await first;
    expect(events).toEqual(['navigate /login?reason=signed-out']);
    expect(signOut.busy()).toBe(false);
  });
});
