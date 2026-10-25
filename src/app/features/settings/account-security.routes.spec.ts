import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Route,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { Actor } from '../../core/auth/actor';
import { UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, AppEnvironment } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../core/errors/app-error';
import { BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { loadAccountSecurityRoutes } from './account-security.routes';
import { AccountSecurityFacade } from './application/account-security.facade';
import { UnavailableAccountSecurityGateway } from './data-access/account-security.gateway';
import { SETTINGS_ROUTES } from './settings.routes';

const PRODUCTION: AppEnvironment = { production: true, demo: null };
const DEMO_BUILD: AppEnvironment = {
  production: false,
  demo: { load: () => Promise.reject(new Error('not loaded by the guard')) },
};

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
/** Assigned to every Platform: still no owner security. */
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};

function securityRoute(): Route {
  const route = SETTINGS_ROUTES.find((r) => r.path === 'security');
  if (!route) throw new Error('no security route');
  return route;
}

function guardResult(route: Route, actor: Actor) {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: APP_ENVIRONMENT, useValue: DEMO_BUILD }],
  });
  TestBed.inject(AuthSession).establish(actor);
  const guards = (route.canActivate ?? []) as CanActivateFn[];
  expect(guards).toHaveLength(1);
  const result = TestBed.runInInjectionContext(() =>
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/settings/security' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('account security routes (P9-S4a)', () => {
  it('guards /settings/security: the owner only, direct URLs included; an operator assigned everywhere gets /forbidden', () => {
    const route = securityRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('sits below the Settings hub, with no identity parameter', () => {
    const route = securityRoute();
    expect(route.title).toBe('titles.settingsSecurity');
    expect(route.path).not.toContain(':');
    expect(route.data?.[BREADCRUMB_PARENT_DATA]).toEqual({
      key: 'shell.breadcrumb.settings',
      link: '/settings',
    });
  });

  it('binds only the unavailable adapter in a production build: no simulated factor, no request', async () => {
    const [root] = await loadAccountSecurityRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAccountSecurityGateway,
      UnavailableStepUpGateway,
      AccountSecurityFacade,
    ]);
    const unavailable = new UnavailableAccountSecurityGateway();
    const answers: Observable<unknown>[] = [
      unavailable.load(),
      unavailable.beginTotp(),
      unavailable.confirmTotp(),
    ];
    for (const answer of answers)
      await expect(firstValueFrom(answer)).rejects.toMatchObject({
        kind: 'unavailable',
        code: ADAPTER_UNAVAILABLE,
      });
  });
});

describe('add an authenticator route (P9-S4b)', () => {
  async function addRoute(): Promise<Route> {
    const [root] = await loadAccountSecurityRoutes(PRODUCTION);
    const route = root?.children?.find((r) => r.path === 'add-authenticator');
    if (!route) throw new Error('no add-authenticator route');
    return route;
  }

  it('is a dedicated page below Security, with no identity or secret in its path', async () => {
    const route = await addRoute();
    expect(route.title).toBe('titles.settingsAddAuthenticator');
    expect(route.path).not.toMatch(/[:?#]/);
    expect(route.data?.[BREADCRUMB_PARENT_DATA]).toEqual({
      key: 'shell.breadcrumb.security',
      link: '/settings/security',
    });
  });

  it('has its own owner-only guard (account.factor.add): an operator assigned everywhere gets /forbidden', async () => {
    const route = await addRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });
});
