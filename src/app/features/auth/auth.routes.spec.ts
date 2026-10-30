import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { guestGuard } from '../../core/access/access.guards';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { loadAuthRoutes, platformChoiceGuard } from './auth.routes';
import { EnrollPage } from './pages/enroll/enroll.page';

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
    licenses: [],
    billing: [],
    activity: [],
    services: [],
    releases: [],
    companySettings: [],
    accountSecurity: [],
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    memberships: [],
    operators: [],
    stepUp: [],
    assistance: [],
  },
};

function run(actor: Actor | null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
    ],
  });
  if (actor) TestBed.inject(AuthSession).establish(actor);
  const result = TestBed.runInInjectionContext(() =>
    platformChoiceGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

const operator = (ids: string[]): Actor => ({
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: ids.map(platformId),
});

describe('platformChoiceGuard', () => {
  it('opens the choice only to an operator with several assigned Platforms', () => {
    expect(run(operator(['a', 'b']))).toBe(true);
  });

  it('sends anyone else home', () => {
    expect(run(operator(['a']))).toBe('/');
    expect(run(null)).toBe('/');
    expect(
      run({ kind: 'owner', userId: 'o', email: 'o@x.invalid', companyId: companyId('c') }),
    ).toBe('/');
  });
});

describe('auth routes: authenticator setup', () => {
  it('serves /login/enroll to guests only, as the lazily loaded enrollment page', async () => {
    const [frame] = await loadAuthRoutes({ production: false, demo: { load: async () => DEMO } });
    const enroll = frame?.children?.find((route) => route.path === 'enroll');
    expect(enroll?.title).toBe('titles.enroll');
    expect(enroll?.canActivate).toEqual([guestGuard]);
    expect(await enroll?.loadComponent?.()).toBe(EnrollPage);
  });
});
