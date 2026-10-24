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
import { firstValueFrom } from 'rxjs';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, AppEnvironment } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../core/errors/app-error';
import { BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { CompanySettingsFacade } from './application/company-settings.facade';
import { loadCompanySettingsRoutes } from './company-settings.routes';
import { UnavailableCompanySettingsGateway } from './data-access/company-settings.gateway';
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
/** Assigned to every Platform: still no Company configuration authority. */
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};

function companyRoute(): Route {
  const route = SETTINGS_ROUTES.find((r) => r.path === 'company');
  if (!route) throw new Error('no company settings route');
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
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/settings/company' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('company settings routes (P9-S3)', () => {
  it('guards /settings/company: the owner only, direct URLs included; an operator assigned everywhere is refused', () => {
    const route = companyRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('sits below the Settings hub, with its own title and the Settings parent crumb', () => {
    const route = companyRoute();
    expect(route.title).toBe('titles.settingsCompany');
    expect(route.data?.[BREADCRUMB_PARENT_DATA]).toEqual({
      key: 'shell.breadcrumb.settings',
      link: '/settings',
    });
    // no other Settings section is guarded by an owner capability: personal settings stay open to operators
    expect(SETTINGS_ROUTES.filter((r) => r.canActivate !== undefined).map((r) => r.path)).toEqual([
      'company',
    ]);
  });

  it('binds only the unavailable adapter in a production build: no demo Company, no request', async () => {
    const [root] = await loadCompanySettingsRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableCompanySettingsGateway,
      CompanySettingsFacade,
    ]);
    await expect(
      firstValueFrom(new UnavailableCompanySettingsGateway().load()),
    ).rejects.toMatchObject({ kind: 'unavailable', code: ADAPTER_UNAVAILABLE });
  });
});
