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
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, AppEnvironment } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { loadShellRoutes } from '../../layout/shell.routes';
import { UnavailableOperatorAssignmentGateway } from './data-access/operator-assignment.gateway';
import { UnavailableOperatorDirectoryGateway } from './data-access/operator-directory.gateway';
import { loadOperatorsRoutes } from './operators.routes';

const PRODUCTION: AppEnvironment = { production: true, demo: null };
/** A session exists only in a demo build (no sign-in elsewhere yet); the guard itself is the same in every build. */
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
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};

async function operatorsRoute(): Promise<Route> {
  const [shell] = await loadShellRoutes(PRODUCTION);
  const route = shell?.children?.find((r) => r.path === 'operators');
  if (!route) throw new Error('no operators route');
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
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/operators/x' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('operators routes (P6-S1)', () => {
  it('guards /operators and every page below it: the owner only, direct URLs included', async () => {
    const route = await operatorsRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('binds only the unavailable adapters in a production build (no demo record, no invented route)', async () => {
    const [root] = await loadOperatorsRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => p.useClass)).toEqual([
      UnavailableOperatorDirectoryGateway,
      UnavailableOperatorAssignmentGateway,
    ]);
    expect(root?.children?.map((r) => r.path)).toEqual(['', ':operatorId']);
  });
});
