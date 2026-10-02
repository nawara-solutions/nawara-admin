import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { companyId, platformId } from '../context/scope.model';
import { capabilityGuard, sessionGuard } from './access.guards';

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
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school')],
};

function setUp(actor: Actor | null) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO_BINDINGS_STUB } },
      },
    ],
  });
  if (actor) TestBed.inject(AuthSession).startDemo(actor);
}

const run = (guard: typeof sessionGuard) =>
  TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
const path = (result: unknown) => (result instanceof UrlTree ? result.toString() : result);

describe('access guards (navigation controls, not security)', () => {
  it('sends a visitor without a session to the sign-in-unavailable page', () => {
    setUp(null);
    expect(path(run(sessionGuard))).toBe('/session-unavailable');
  });

  it('lets a signed-in actor into the shell', () => {
    setUp(operator);
    expect(run(sessionGuard)).toBe(true);
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
