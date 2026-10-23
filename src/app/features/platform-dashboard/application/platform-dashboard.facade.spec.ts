import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { PlatformCommercialGateway } from '../data-access/platform-commercial.gateway';
import { PlatformDashboardGateway } from '../data-access/platform-dashboard.gateway';
import {
  Blank,
  DEMO,
  DRIVE,
  PLATFORMS,
  SCHOOL,
  ScriptedCommercial,
  ScriptedDashboard,
  ScriptedDirectory,
  commercialOf,
  dashboardOf,
  operator,
  owner,
} from '../testing/platform-dashboard-testing';
import { PlatformDashboardFacade } from './platform-dashboard.facade';

async function setUp(actor: Actor, url = '/platforms/school') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'platforms/:platformId', component: Blank }]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: ScopeDirectoryGateway, useClass: ScriptedDirectory },
      { provide: PlatformDashboardGateway, useClass: ScriptedDashboard },
      { provide: PlatformCommercialGateway, useClass: ScriptedCommercial },
      ScopeContext,
      PlatformDashboardFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const facade = TestBed.inject(PlatformDashboardFacade);
  TestBed.tick();
  return {
    facade,
    router,
    dashboard: TestBed.inject(PlatformDashboardGateway) as ScriptedDashboard,
    commercial: TestBed.inject(PlatformCommercialGateway) as ScriptedCommercial,
    directory: TestBed.inject(ScopeDirectoryGateway) as ScriptedDirectory,
  };
}

const settle = async () => {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
};

describe('PlatformDashboardFacade', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('grants the owner a Platform of their Company and loads both the dashboard and the commercial facts', async () => {
    const { facade, dashboard, commercial } = await setUp(owner);
    expect(facade.access()).toEqual({ status: 'granted', platform: PLATFORMS[0] });
    expect(dashboard.requests.map((r) => r.platform)).toEqual([SCHOOL]);
    expect(commercial.requests.map((r) => r.platform)).toEqual([SCHOOL]);
    expect(facade.state()).toEqual({ status: 'loading' });
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    expect(facade.state().status).toBe('success');
    expect(facade.subscriptions()).toEqual({
      status: 'available',
      data: { active: 1, grace: 1, none: 1, total: 3 },
    });
  });

  it('never asks an operator’s commercial facts, and shows no owner-only section', async () => {
    const { facade, dashboard, commercial } = await setUp(operator);
    expect(facade.access().status).toBe('granted');
    expect(dashboard.requests).toHaveLength(1);
    expect(commercial.requests).toHaveLength(0);
    expect(facade.showsCommercial()).toBe(false);
    expect(facade.showsActivity()).toBe(false);
    expect(facade.showsAccess()).toBe(false);
    expect(facade.canOpenPlatforms()).toBe(false);
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    const attention = facade.attention();
    // Membership requests only: no invitations, grace or payments for an operator.
    expect(attention).toEqual({
      status: 'available',
      data: [{ kind: 'membership_requests', count: 12, organizations: 4, tone: 'info' }],
    });
  });

  it('isolates Platforms: an operator gets nothing for a Platform they are not assigned to', async () => {
    const { facade, dashboard } = await setUp(operator, '/platforms/drive');
    expect(facade.access()).toEqual({ status: 'notAccessible' });
    expect(dashboard.requests).toHaveLength(0);
  });

  it('treats an unknown Platform as not found or not accessible, asking nothing', async () => {
    const { facade, dashboard, commercial } = await setUp(owner, '/platforms/unknown');
    expect(facade.access()).toEqual({ status: 'notAccessible' });
    expect(dashboard.requests).toHaveLength(0);
    expect(commercial.requests).toHaveLength(0);
  });

  it('tells a directory outage apart from an access refusal, and retries the directory', async () => {
    ScriptedDirectory.answer = () => throwError(() => ({ kind: 'unavailable', status: 503 }));
    const { facade, dashboard, directory } = await setUp(owner);
    expect(facade.access()).toEqual({ status: 'directoryUnavailable' });
    expect(dashboard.requests).toHaveLength(0);
    ScriptedDirectory.answer = () => of(PLATFORMS);
    const before = directory.calls;
    facade.reload();
    await settle();
    expect(directory.calls).toBe(before + 1);
    expect(facade.access().status).toBe('granted');
    expect(dashboard.requests).toHaveLength(1);
  });

  it('cancels the previous Platform’s requests on a switch and never shows its late answer', async () => {
    const { facade, router, dashboard, commercial } = await setUp(owner);
    await router.navigateByUrl('/platforms/drive');
    await settle();
    expect(dashboard.requests.map((r) => r.platform)).toEqual([SCHOOL, DRIVE]);
    // School's answer arrives after the switch: it must not appear as Drive's.
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    expect(facade.state()).toEqual({ status: 'loading' });
    expect(facade.commercial()).toEqual({ status: 'loading' });
    dashboard.requests[1]?.answer.next(dashboardOf(DRIVE, 4));
    const state = facade.state();
    expect(state.status === 'success' && state.data.platformId).toBe(DRIVE);
  });

  it('retries both loads for the same Platform', async () => {
    const { facade, dashboard, commercial } = await setUp(owner);
    dashboard.requests[0]?.answer.error({ kind: 'unavailable', status: 503 });
    expect(facade.state().status).toBe('error');
    facade.reload();
    await settle();
    expect(dashboard.requests.map((r) => r.platform)).toEqual([SCHOOL, SCHOOL]);
    expect(commercial.requests.map((r) => r.platform)).toEqual([SCHOOL, SCHOOL]);
  });

  it('composes the owner’s attention: requests, invitations, then grace and payment warnings', async () => {
    const { facade, dashboard, commercial } = await setUp(owner);
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    const attention = facade.attention();
    expect(
      attention.status === 'available' && attention.data.map((i) => [i.kind, i.count, i.tone]),
    ).toEqual([
      ['membership_requests', 12, 'info'],
      ['admin_invitations', 5, 'info'],
      ['subscription_grace', 1, 'warning'],
      ['payment_issues', 1, 'warning'],
    ]);
    const grace = attention.status === 'available' ? attention.data[2] : undefined;
    expect(grace?.organizationName).toBe('B');
    expect(grace?.graceEndsAt).toBe('2026-10-24T06:00:00.000Z');
  });
});
