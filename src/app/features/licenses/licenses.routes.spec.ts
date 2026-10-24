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
import { loadShellRoutes } from '../../layout/shell.routes';
import { LicensesFacade } from './application/licenses.facade';
import { UnavailableLicensesGateway } from './data-access/licenses.gateway';
import { loadLicensesRoutes } from './licenses.routes';

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
/** Assigned to every Platform: still no commercial authority. */
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};

async function licensesRoute(): Promise<Route> {
  const [shell] = await loadShellRoutes(PRODUCTION);
  const route = shell?.children?.find((r) => r.path === 'licenses');
  if (!route) throw new Error('no licenses route');
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
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/licenses' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('licenses routes (P7-S1)', () => {
  it('guards /licenses: the owner only, direct URLs included; an operator assigned everywhere is refused', async () => {
    const route = await licensesRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('binds only the unavailable adapter in a production build: no demo record, no request', async () => {
    const [root] = await loadLicensesRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableLicensesGateway,
      LicensesFacade,
    ]);
    await expect(firstValueFrom(new UnavailableLicensesGateway().overview())).rejects.toMatchObject(
      {
        kind: 'unavailable',
        code: ADAPTER_UNAVAILABLE,
      },
    );
  });
});
