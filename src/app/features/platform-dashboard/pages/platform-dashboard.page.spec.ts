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
import {
  OrganizationGateway,
  UnavailableOrganizationGateway,
} from '../../organizations/data-access/organization.gateway';
import {
  OrganizationCommercialGateway,
  UnavailableOrganizationCommercialGateway,
} from '../../organizations/data-access/organization-commercial.gateway';
import { OrganizationDirectoryFacade } from '../../organizations/application/organization-directory.facade';
import { organizationActionTestProviders } from '../../organizations/testing/organization-actions-testing';

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
      // The page embeds the Organization directory and "Create organization" (PR #89): the route's
      // Organization providers, with the gateways unavailable as in a build without them.
      { provide: OrganizationGateway, useClass: UnavailableOrganizationGateway },
      {
        provide: OrganizationCommercialGateway,
        useClass: UnavailableOrganizationCommercialGateway,
      },
      OrganizationDirectoryFacade,
      ...organizationActionTestProviders(false),
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

/** The facts of the subscription summary, by their label (PR #89: Organizations, Personal Premium, Payment issues). */
const fact = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll('adm-subscription-summary .subscription-summary__fact')].find(
    (f) => text(f.querySelector('dt')) === label,
  ) ?? null;
/** PR #89: what needs attention is in the panel "Updates" opens. */
async function openUpdates(page: HTMLElement, settle: () => Promise<void>) {
  [...page.querySelectorAll<HTMLButtonElement>('.platform-dashboard__header button')]
    .find((b) => text(b).startsWith(en.platformDashboard.updates))
    ?.click();
  await settle();
  return [...page.querySelectorAll('.platform-attention__item')];
}

describe('PlatformDashboardPage', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('shows the owner the Platform’s figures, commercial facts, assisted payments, Organizations and attention', async () => {
    // PR #89's dashboard: the title, the figures, the subscription summary, the read-only assisted payments
    // (WP-5.3b), the Platform's Organization directory and the "Updates" panel; no identity, access or back line.
    const { page, dashboard, commercial, settle } = await render(owner);
    dashboard.requests[0]?.answer.next(withOrganizations(dashboardOf(SCHOOL)));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    await settle();
    expect(text(page.querySelector('h1'))).toBe('Nawara School');
    expect(page.querySelector('.platform-dashboard__demo')).toBeNull();
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(4);
    expect(page.querySelector('adm-subscription-summary')).not.toBeNull();
    expect(text(page.querySelector('[data-policies]'))).toContain(
      en.platformDashboard.policies.notVerified,
    );
    expect(page.querySelector('adm-organization-directory-page')).not.toBeNull();
    expect(await openUpdates(page, settle)).toHaveLength(4);
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
    expect(text(fact(page, en.platformDashboard.figures.organizations)?.querySelector('dd'))).toBe(
      '3',
    );
    expect(
      text(fact(page, en.platformDashboard.commercial.personalPremium)?.querySelector('dd')),
    ).toContain('21');
    expect(
      text(fact(page, en.platformDashboard.commercial.paymentIssues)?.querySelector('dd')),
    ).toContain('1');
  });

  // WP-2.2's read model, restored on the dashboard (owner decision, WP-5.3b): eligibility not verified, no switch.
  it('shows assisted payments read only: eligibility not verified, with no policy switch', async () => {
    const { page, dashboard, commercial, settle } = await render(owner);
    dashboard.requests[0]?.answer.next(dashboardOf(SCHOOL));
    commercial.requests[0]?.answer.next(commercialOf(SCHOOL));
    await settle();
    const policy = page.querySelector('adm-assisted-payments-policy');
    expect(text(policy)).toContain(en.platformDashboard.policies.notVerified);
    expect(policy?.querySelectorAll('button, [role="switch"], input')).toHaveLength(0);
  });

  it('shows an operator the hierarchy only: no assignments, subscriptions, policies or activity', async () => {
    const { page, dashboard, commercial, settle } = await render(operator);
    dashboard.requests[0]?.answer.next(withOrganizations(dashboardOf(SCHOOL)));
    await settle();
    expect(commercial.requests).toHaveLength(0);
    // Organizations, memberships and requests; never the operator assignments.
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(3);
    expect(page.querySelector('adm-subscription-summary')).toBeNull();
    expect(page.querySelector('[data-policies]')).toBeNull();
    expect(page.textContent).not.toContain(en.platformDashboard.policies.assistedPayments);
    expect(page.textContent).not.toContain(en.platformDashboard.header.backToPlatforms);
    expect(await openUpdates(page, settle)).toHaveLength(1);
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
    expect(page.querySelectorAll('adm-summary-card')).toHaveLength(4);
    const premium = fact(page, en.platformDashboard.commercial.personalPremium);
    expect(text(premium)).toContain('—');
    expect(text(premium)).toContain(en.common.notAvailable);
    // The other commercial facts and the assisted payments stay.
    expect(text(fact(page, en.platformDashboard.commercial.paymentIssues))).toContain('1');
    expect(text(page.querySelector('[data-policies]'))).toContain(
      en.platformDashboard.policies.notVerified,
    );
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
    // PR #89: the figure says none (the former "No organizations yet" card is gone; the directory has its own state).
    const organizations = [...page.querySelectorAll('adm-summary-card')].find((c) =>
      text(c).startsWith(en.platformDashboard.figures.organizations),
    );
    expect(text(organizations?.querySelector('.summary-card__value'))).toBe('0');
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

  it('embeds the Platform’s own Organization directory', async () => {
    // PR #89: the dashboard embeds the directory (its links are the directory's, tested there).
    const { page, dashboard, settle } = await render(operator);
    dashboard.requests[0]?.answer.next(withOrganizations(dashboardOf(SCHOOL)));
    await settle();
    expect(page.querySelector('adm-organization-directory-page')).not.toBeNull();
    // Scoped to this Platform (here a build without the Organization gateway, so it says so for this Platform).
    const view = TestBed.inject(OrganizationDirectoryFacade).view();
    expect(view.status).toBe('notInBuild');
    expect('platform' in view && view.platform.id).toBe(SCHOOL);
  });
});
