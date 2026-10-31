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
import { AssistanceCaseFacade } from '../assistance/application/assistance-case.facade';
import { AssistanceDirectoryFacade } from '../assistance/application/assistance-directory.facade';
import { AssistanceDisputesFacade } from '../assistance/application/assistance-disputes.facade';
import { AssistanceRecoveryFacade } from '../assistance/application/assistance-recovery.facade';
import { AssistanceSettlementsFacade } from '../assistance/application/assistance-settlements.facade';
import { UnavailableAssistanceGateway } from '../assistance/data-access/assistance.gateway';
import { BillingFacade } from './application/billing.facade';
import { UnavailableBillingGateway } from './data-access/billing.gateway';
import { loadBillingRoutes } from './billing.routes';

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

async function billingRoute(): Promise<Route> {
  const [shell] = await loadShellRoutes(PRODUCTION);
  const route = shell?.children?.find((r) => r.path === 'billing');
  if (!route) throw new Error('no billing route');
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
    guards[0]?.({} as ActivatedRouteSnapshot, { url: '/billing' } as RouterStateSnapshot),
  );
  return result instanceof UrlTree ? result.toString() : result;
}

describe('billing routes (P7-S3)', () => {
  it('guards /billing: the owner only, direct URLs included; an operator assigned everywhere is refused', async () => {
    const route = await billingRoute();
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('binds only the unavailable adapter in a production build: no demo record, no request', async () => {
    const [root] = await loadBillingRoutes(PRODUCTION);
    const providers = (root?.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableBillingGateway,
      BillingFacade,
    ]);
    await expect(firstValueFrom(new UnavailableBillingGateway().followUps())).rejects.toMatchObject(
      {
        kind: 'unavailable',
        code: ADAPTER_UNAVAILABLE,
      },
    );
  });

  it('guards /billing/assistance with its own owner-only capability (A4), below Billing in the breadcrumbs', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const assistance = routes.find((r) => r.path === 'assistance');
    if (!assistance) throw new Error('no assistance route');
    expect(assistance.title).toBe('titles.assistance');
    expect(assistance.data).toEqual({
      breadcrumb: 'shell.breadcrumb.assistance',
      breadcrumbParent: { key: 'shell.breadcrumb.billing', link: '/billing' },
    });
    expect(guardResult(assistance, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(assistance, operator)).toBe('/forbidden');
  });

  it('binds only the unavailable Assistance adapter in a production build (no demo case, no request)', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const providers = (routes.find((r) => r.path === 'assistance')?.providers ??
      []) as (Provider & {
      useClass?: unknown;
    })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAssistanceGateway,
      AssistanceDirectoryFacade,
    ]);
  });

  it('guards one case (A5) like the directory, below it in the breadcrumbs, unavailable in production', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const route = routes.find((r) => r.path === 'assistance/:requestId');
    if (!route) throw new Error('no case route');
    expect(route.title).toBe('titles.assistanceCase');
    expect(route.data).toEqual({
      breadcrumb: 'shell.breadcrumb.assistanceCase',
      breadcrumbParent: { key: 'shell.breadcrumb.assistance', link: '/billing/assistance' },
    });
    const providers = (route.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAssistanceGateway,
      AssistanceCaseFacade,
    ]);
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('guards disputes and exceptions (A7) like the directory, before the case route, unavailable in production', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const index = routes.findIndex((r) => r.path === 'assistance/disputes');
    const route = routes[index];
    if (!route) throw new Error('no disputes route');
    // Listed before `assistance/:requestId`, so "disputes" is never read as a case reference.
    expect(index).toBeLessThan(routes.findIndex((r) => r.path === 'assistance/:requestId'));
    expect(route.title).toBe('titles.assistanceDisputes');
    expect(route.data).toEqual({
      breadcrumb: 'shell.breadcrumb.assistanceDisputes',
      breadcrumbParent: { key: 'shell.breadcrumb.assistance', link: '/billing/assistance' },
    });
    const providers = (route.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAssistanceGateway,
      AssistanceDisputesFacade,
    ]);
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('guards late settlements and cash returns (A8) like the directory, before the case route, unavailable in production', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const index = routes.findIndex((r) => r.path === 'assistance/settlements');
    const route = routes[index];
    if (!route) throw new Error('no settlements route');
    expect(index).toBeLessThan(routes.findIndex((r) => r.path === 'assistance/:requestId'));
    expect(route.title).toBe('titles.assistanceSettlements');
    expect(route.data).toEqual({
      breadcrumb: 'shell.breadcrumb.assistanceSettlements',
      breadcrumbParent: { key: 'shell.breadcrumb.assistance', link: '/billing/assistance' },
    });
    const providers = (route.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAssistanceGateway,
      AssistanceSettlementsFacade,
    ]);
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });

  it('guards recovery and surplus (A9) like the directory, before the case route, unavailable in production', async () => {
    const routes = await loadBillingRoutes(PRODUCTION);
    const index = routes.findIndex((r) => r.path === 'assistance/recovery');
    const route = routes[index];
    if (!route) throw new Error('no recovery route');
    expect(index).toBeLessThan(routes.findIndex((r) => r.path === 'assistance/:requestId'));
    expect(route.title).toBe('titles.assistanceRecovery');
    expect(route.data).toEqual({
      breadcrumb: 'shell.breadcrumb.assistanceRecovery',
      breadcrumbParent: { key: 'shell.breadcrumb.assistance', link: '/billing/assistance' },
    });
    const providers = (route.providers ?? []) as (Provider & { useClass?: unknown })[];
    expect(providers.map((p) => (typeof p === 'function' ? p : p.useClass))).toEqual([
      UnavailableAssistanceGateway,
      AssistanceRecoveryFacade,
    ]);
    expect(guardResult(route, owner)).toBe(true);
    TestBed.resetTestingModule();
    expect(guardResult(route, operator)).toBe('/forbidden');
  });
});
