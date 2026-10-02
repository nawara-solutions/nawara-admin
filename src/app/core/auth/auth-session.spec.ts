import { TestBed } from '@angular/core/testing';
import { APP_ENVIRONMENT, AppEnvironment, DemoBindings } from '../config/app-environment';
import { companyId } from '../context/scope.model';
import { Actor } from './actor';
import { AuthSession } from './auth-session';

const DEMO_BINDINGS_STUB: DemoBindings = {
  owner: { kind: 'owner', userId: 'o', email: 'o@x.invalid', companyId: companyId('c') },
  providers: {
    scopeDirectory: [],
    notificationSummary: [],
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

  it('refuses the demo session in a build without demo data', () => {
    const s = session({ production: true, demo: null });
    expect(() => s.startDemo(owner)).toThrow(/not available in this build/);
    expect(s.actor()).toBeNull();
  });

  it('signs in the demo owner in a demo build and marks the session as demo', () => {
    const s = session({ production: false, demo: { load: async () => DEMO_BINDINGS_STUB } });
    s.startDemo(owner);
    expect(s.actor()).toEqual(owner);
    expect(s.isDemo()).toBe(true);
  });
});
