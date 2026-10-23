import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { organizationId } from '../../../core/context/scope.model';
import { PlatformDashboardFacade } from '../application/platform-dashboard.facade';
import { PlatformCommercialGateway } from '../data-access/platform-commercial.gateway';
import { PlatformDashboardGateway } from '../data-access/platform-dashboard.gateway';
import { PlatformDashboard } from '../domain/platform-dashboard.model';
import {
  Blank,
  DEMO,
  PLATFORMS,
  SCHOOL,
  ScriptedCommercial,
  ScriptedDashboard,
  ScriptedDirectory,
  commercialOf,
  count,
  dashboardOf,
  operator,
  owner,
} from '../testing/platform-dashboard-testing';
import { PlatformDashboardPage } from './platform-dashboard.page';

const withOrganizations = (dashboard: PlatformDashboard): PlatformDashboard => ({
  ...dashboard,
  recentOrganizations: {
    status: 'available',
    data: [
      {
        id: organizationId('a'),
        name: 'École Horizon',
        createdAt: '2026-10-23T10:00:00.000Z',
        memberships: count(64),
        pendingRequests: count(3),
      },
      {
        id: organizationId('b'),
        name: 'Lycée Al Amal',
        createdAt: '2026-10-14T10:00:00.000Z',
        memberships: count(118),
        pendingRequests: count(0),
      },
    ],
  },
});

async function render(actor: Actor, url = '/platforms/school') {
  TestBed.configureTestingModule({
    imports: [
      PlatformDashboardPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
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
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(PlatformDashboardPage);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  await settle();
  const page = fixture.nativeElement as HTMLElement;
  const dashboard = TestBed.inject(PlatformDashboardGateway) as ScriptedDashboard;
  const commercial = TestBed.inject(PlatformCommercialGateway) as ScriptedCommercial;
  const headings = () => [...page.querySelectorAll('h2')].map((h) => text(h));
  return { fixture, page, dashboard, commercial, settle, headings };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('PlatformDashboardPage', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('shows the owner the Platform’s identity, figures, organizations, attention, commercial facts and activity', async () => {
    const { page, dashboard, commercial, settle, headings } = await render(owner);
    dashboard.requests[0]?.answer.next(withOrganizations(dashboardOf(SCHOOL)));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    await settle();
    expect(text(page.querySelector('h1'))).toBe('Nawara School');
    expect(text(page.querySelector('.platform-dashboard__meta'))).toContain(
      en.platforms.product.school,
    );
    const key = page.querySelector('.platform-dashboard__key');
    expect(text(key)).toBe('nawara-school');
    expect(key?.getAttribute('dir')).toBe('ltr');
    expect(text(page.querySelector('.platform-dashboard__access'))).toBe(
      en.platformDashboard.header.accessOwner,
    );
    expect(text(page.querySelector('.platform-dashboard__demo'))).toContain(en.shell.demo.badge);
    expect(page.querySelector('.platform-dashboard__header a')?.getAttribute('href')).toBe(
      '/platforms',
    );
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(4);
    expect(headings()).toEqual([
      en.platformDashboard.organizations.title,
      en.platformDashboard.attention.title,
      en.platformDashboard.commercial.title,
      en.platformDashboard.policies.title,
      en.platformDashboard.activity.title,
    ]);
    // The owner's organization table has the subscription column.
    expect(
      [...page.querySelectorAll('.recent-organizations__table thead th')].map((th) => text(th)),
    ).toContain(en.platformDashboard.organizations.subscriptionColumn);
    expect(page.querySelectorAll('.platform-attention__item')).toHaveLength(4);
  });

  it('keeps Organization subscriptions, Personal Premium and payment issues apart', async () => {
    const { page, dashboard, commercial, settle } = await render(owner);
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    await settle();
    const summary = page.querySelector('adm-subscription-summary');
    expect(summary?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Organization subscriptions: 1 active, 1 in grace, 1 none, of 3 organizations',
    );
    const facts = [...(summary?.querySelectorAll('.subscription-summary__fact') ?? [])].map((f) =>
      text(f),
    );
    expect(facts[0]).toContain(en.platformDashboard.commercial.personalPremium);
    expect(facts[0]).toContain('21');
    expect(facts[1]).toContain(en.platformDashboard.commercial.paymentIssues);
    expect(facts[1]).toContain('1');
  });

  it('shows the assisted-payments policy read only: "Change policy" does nothing and says why', async () => {
    const { page, dashboard, commercial, settle } = await render(owner);
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    await settle();
    const policy = page.querySelector('adm-assisted-payments-policy');
    expect(text(policy)).toContain(en.platformDashboard.policies.enabled);
    expect(text(policy)).toContain('1 of 3 have it disabled');
    const change = policy?.querySelector<HTMLButtonElement>('button');
    expect(change?.getAttribute('aria-disabled')).toBe('true');
    const note = page.querySelector(`#${change?.getAttribute('aria-describedby') ?? 'none'}`);
    expect(text(note)).toBe(en.shell.notAvailableYet);
    const requests = [dashboard.requests.length, commercial.requests.length];
    change?.click();
    await settle();
    expect([dashboard.requests.length, commercial.requests.length]).toEqual(requests);
  });

  it('shows an operator the hierarchy only: no assignments, subscriptions, policies or activity', async () => {
    const { page, dashboard, commercial, settle, headings } = await render(operator);
    dashboard.requests[0]?.answer.next(withOrganizations(dashboardOf(SCHOOL)));
    await settle();
    expect(commercial.requests).toHaveLength(0);
    expect(text(page.querySelector('.platform-dashboard__access'))).toBe(
      en.platformDashboard.header.accessOperator,
    );
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(3);
    expect(headings()).toEqual([
      en.platformDashboard.organizations.title,
      en.platformDashboard.attention.title,
    ]);
    expect(page.textContent).not.toContain(en.platformDashboard.organizations.subscriptionColumn);
    expect(page.textContent).not.toContain(en.platformDashboard.header.backToPlatforms);
    expect(page.querySelectorAll('.platform-attention__item')).toHaveLength(1);
  });

  it('shows loading while the dashboard is asked for', async () => {
    const { page } = await render(owner);
    expect(
      page.querySelector('nw-data-state[state="loading"], .nw-data-state--loading'),
    ).not.toBeNull();
  });

  it('keeps the other sections when one is unavailable, never showing it as zero', async () => {
    const { page, dashboard, commercial, settle } = await render(owner);
    dashboard.requests[0]?.answer.next({
      ...dashboardOf(SCHOOL),
      recentOrganizations: { status: 'unavailable' },
    });
    commercial.requests[0]?.answer.next({
      ...commercialOf(SCHOOL),
      personalPremium: { status: 'unavailable' },
    });
    await settle();
    const organizations = page
      .querySelector('#platform-organizations')
      ?.closest('adm-overview-card');
    expect(text(organizations)).toContain(en.platformDashboard.states.sectionUnavailable);
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(4);
    const premium = page.querySelector('.subscription-summary__fact');
    expect(text(premium)).toContain('—');
    expect(text(premium)).toContain(en.common.notAvailable);
  });

  it('offers "Try again" after an error, which asks again', async () => {
    const { page, dashboard, settle } = await render(owner);
    dashboard.requests[0]?.answer.error({ kind: 'unavailable', status: 503 });
    await settle();
    expect(page.textContent).toContain(en.platformDashboard.states.errorTitle);
    const retry = [...page.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => text(b) === en.platformDashboard.states.retry,
    );
    retry?.click();
    await settle();
    expect(dashboard.requests.map((r) => r.platform)).toEqual([SCHOOL, SCHOOL]);
  });

  it('says a Platform without Organizations has none yet, with "Create organization" unavailable', async () => {
    const { page, dashboard, settle } = await render(owner);
    const empty = dashboardOf(SCHOOL);
    dashboard.requests[0]?.answer.next({
      ...empty,
      figures:
        empty.figures.status === 'available'
          ? { status: 'available', data: { ...empty.figures.data, organizations: count(0) } }
          : empty.figures,
    });
    await settle();
    expect(page.textContent).toContain(en.platformDashboard.organizations.emptyTitle);
    const create = [...page.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => text(b) === en.platformDashboard.organizations.create,
    );
    expect(create?.getAttribute('aria-disabled')).toBe('true');
  });

  it('says "not found or not accessible" for a Platform outside the scope, with the way back', async () => {
    const { page: forOwner } = await render(owner, '/platforms/unknown');
    expect(text(forOwner.querySelector('h1'))).toBe(en.platformDashboard.states.notAccessibleTitle);
    expect(forOwner.querySelector('a')?.getAttribute('href')).toBe('/platforms');
    TestBed.resetTestingModule();
    const { page: forOperator } = await render(operator, '/platforms/drive');
    expect(text(forOperator.querySelector('h1'))).toBe(
      en.platformDashboard.states.notAccessibleTitle,
    );
    // An operator's way back is their own Platforms (here: their one Platform).
    expect(forOperator.querySelector('a')?.getAttribute('href')).toBe('/platforms/school');
  });

  it('does not mistake a directory outage for an access refusal', async () => {
    ScriptedDirectory.answer = () => throwError(() => ({ kind: 'unavailable', status: 503 }));
    const { page } = await render(owner);
    expect(text(page.querySelector('h1'))).toBe(en.platformDashboard.states.directoryTitle);
    expect(page.textContent).not.toContain(en.platformDashboard.states.notAccessibleTitle);
    expect(
      [...page.querySelectorAll('button')].some(
        (b) => text(b) === en.platformDashboard.states.retry,
      ),
    ).toBe(true);
  });

  it('turns Core’s late refusal into "not found or not accessible", without the Platform’s header', async () => {
    const { page, dashboard, settle } = await render(owner);
    dashboard.requests[0]?.answer.error({ kind: 'not_found', status: 404 });
    await settle();
    expect(page.querySelectorAll('h1')).toHaveLength(1);
    expect(text(page.querySelector('h1'))).toBe(en.platformDashboard.states.notAccessibleTitle);
    expect(page.querySelector('.platform-dashboard__header')).toBeNull();
  });
});
