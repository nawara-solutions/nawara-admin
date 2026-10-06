import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT, AppEnvironment, DemoBindings } from '../config/app-environment';
import { companyId } from '../context/scope.model';
import { Actor } from './actor';
import { AuthSession } from './auth-session';

const DEMO_BINDINGS_STUB: DemoBindings = {
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

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};

function session(environment: AppEnvironment): AuthSession {
  TestBed.configureTestingModule({
    providers: [{ provide: APP_ENVIRONMENT, useValue: environment }],
  });
  return TestBed.inject(AuthSession);
}

describe('AuthSession', () => {
  it('starts signed out', () => {
    const s = session({ production: true, demo: null });
    expect(s.state()).toEqual({ status: 'signed-out' });
    expect(s.actor()).toBeNull();
    expect(s.isDemo()).toBe(false);
  });

  it('refuses a session in a build without sign-in', () => {
    const s = session({ production: true, demo: null });
    expect(() => s.establish(owner)).toThrow(/not available in this build/);
    expect(s.actor()).toBeNull();
  });

  it('establishes the resolved actor in a demo build, marked as demo, and signs out', () => {
    const s = session({ production: false, demo: { load: async () => DEMO_BINDINGS_STUB } });
    s.establish(owner);
    expect(s.actor()).toEqual(owner);
    expect(s.isDemo()).toBe(true);
    s.signOut();
    expect(s.actor()).toBeNull();
    expect(s.isDemo()).toBe(false);
  });
});
