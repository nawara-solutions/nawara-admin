import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT, AppEnvironment, DemoBindings } from '../config/app-environment';
import { companyId, platformId } from '../context/scope.model';
import { capabilityGuard, guestGuard, sessionGuard } from './access.guards';

const DEMO_BINDINGS_STUB: DemoBindings = {
  signIn: { accounts: [], password: 'p', code: 'c' },
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
const DEMO_BUILD: AppEnvironment = {
  production: false,
  demo: { load: async () => DEMO_BINDINGS_STUB },
};
const PRODUCTION_BUILD: AppEnvironment = { production: true, demo: null };

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school')],
};

function setUp(actor: Actor | null, environment: AppEnvironment = DEMO_BUILD) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: APP_ENVIRONMENT, useValue: environment }],
  });
  if (actor) TestBed.inject(AuthSession).establish(actor);
}

const run = (guard: typeof sessionGuard, url = '/') =>
  TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );
const path = (result: unknown) => (result instanceof UrlTree ? result.toString() : result);

describe('access guards (navigation controls, not security)', () => {
  it('sends a visitor without a session to sign in, keeping the requested page', () => {
    setUp(null);
    expect(path(run(sessionGuard, '/platforms'))).toBe('/login?returnUrl=%2Fplatforms');
  });

  it('keeps no return URL for the root or an unsafe address', () => {
    setUp(null);
    expect(path(run(sessionGuard, '/'))).toBe('/login');
    expect(path(run(sessionGuard, '/overview?next=//evil.example'))).toBe('/login');
  });

  it('sends a visitor of a build without sign-in to the sign-in-unavailable page', () => {
    setUp(null, PRODUCTION_BUILD);
    expect(path(run(sessionGuard))).toBe('/session-unavailable');
    expect(path(run(guestGuard))).toBe('/session-unavailable');
  });

  it('lets a signed-in actor into the shell, and out of the sign-in pages', () => {
    setUp(operator);
    expect(run(sessionGuard)).toBe(true);
    expect(path(run(guestGuard))).toBe('/');
  });

  it('opens the sign-in pages to a visitor', () => {
    setUp(null);
    expect(run(guestGuard)).toBe(true);
  });

  it('opens the Company overview to the owner', () => {
    setUp(owner);
    expect(run(capabilityGuard('company.overview.view'))).toBe(true);
  });

  it('keeps an operator out of the Company overview', () => {
    setUp(operator);
    expect(path(run(capabilityGuard('company.overview.view')))).toBe('/forbidden');
  });
});
