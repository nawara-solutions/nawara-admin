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
import { ReleasesFacade } from './application/releases.facade';
import { UnavailableReleaseInformationGateway } from './data-access/release-information.gateway';
import { loadReleasesRoutes } from './releases.routes';

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

async function releasesRoute(): Promise<Route> {
  const [shell] = await loadShellRoutes(PRODUCTION);
  const route = shell?.children?.find((r) => r.path === 'releases');
  if (!route) throw new Error('no releases route');
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
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/releases' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('releases routes (P8-S4)', () => {
  it('guards /releases: the owner only, direct URLs included; an operator assigned everywhere is refused', async () => {
    const route = await releasesRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('binds only the unavailable adapter in a production build: no demo record, no request', async () => {
    const [root] = await loadReleasesRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableReleaseInformationGateway,
      ReleasesFacade,
    ]);
    await expect(
      firstValueFrom(new UnavailableReleaseInformationGateway().information()),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      code: ADAPTER_UNAVAILABLE,
    });
  });
});
