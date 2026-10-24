import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DEMO_COMPANY_ID } from '../../../demo/world/seed';
import { platformId } from '../../../core/context/scope.model';
import { NW_CLOCK } from '../../../shared/format/clock';
import { CompanyOverviewFacade } from '../application/company-overview.facade';
import { CommercialSummaryGateway } from '../data-access/commercial-summary.gateway';
import { CompanyOverviewGateway } from '../data-access/company-overview.gateway';
import {
  COMPANY_OVERVIEW_DEMO_SCENARIO,
  CompanyOverviewDemoScenario,
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
} from '../data-access/company-overview.mock';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { ServiceInventoryGateway } from '../../../core/core-services/service-inventory.gateway';
import {
  MockServiceInventoryGateway,
  SERVICES_DEMO_SCENARIO,
} from '../../../core/core-services/service-inventory.mock';
import { CORE_SERVICES } from '../../../core/core-services/core-service.model';
import { DEMO_OWNER_ID } from '../../../demo/world/seed';
import { createPlatformTestProviders } from '../../platforms/testing/create-platform-testing';
import { CompanyOverviewPage } from './company-overview.page';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school')],
};
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
  },
};

async function render(actor: Actor, scenario: CompanyOverviewDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    imports: [
      CompanyOverviewPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      // A fixed clock: the demo world's dates and the growth days are derived from it.
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: COMPANY_OVERVIEW_DEMO_SCENARIO, useValue: scenario },
      { provide: CompanyOverviewGateway, useClass: MockCompanyOverviewGateway },
      { provide: CommercialSummaryGateway, useClass: MockCommercialSummaryGateway },
      {
        provide: SERVICES_DEMO_SCENARIO,
        useValue: scenario === 'sections-unavailable' ? 'error' : 'normal',
      },
      { provide: ServiceInventoryGateway, useClass: MockServiceInventoryGateway },
      CompanyOverviewFacade,
      ...createPlatformTestProviders(false),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  // The shared service inventory's mock (P8-S2) answers the simulated session: the demo owner, for an owner.
  if (actor.kind === 'owner')
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: DEMO_OWNER_ID, email: null, phone: null, adminTier: 'owner' },
      businessIdentityId: DEMO_OWNER_ID,
    });
  const fixture = TestBed.createComponent(CompanyOverviewPage);
  // First render subscribes the facade; then let the zero-latency mocks (`delay(0)`) answer.
  await fixture.whenStable();
  for (
    let i = 0;
    i < 50 && fixture.nativeElement.querySelector('nw-data-state[state="loading"]');
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fixture.whenStable();
  }
  return { page: fixture.nativeElement as HTMLElement, fixture };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim();

describe('CompanyOverviewPage', () => {
  it('renders the sections in the order of the owner design', async () => {
    const { page } = await render(owner);
    expect(text(page.querySelector('h1'))).toBe(en.companyOverview.title);
    expect(page.querySelectorAll('adm-summary-card').length).toBe(4);
    expect(Array.from(page.querySelectorAll('h2')).map(text)).toEqual([
      en.companyOverview.platforms.title,
      en.companyOverview.attention.title,
      en.companyOverview.growth.title,
      en.companyOverview.activity.title,
      en.companyOverview.access.title,
      en.companyOverview.commercial.title,
      en.companyOverview.health.title,
    ]);
  });

  it('shows one Demo data indicator whose explanation is an accessible disclosure', async () => {
    const { page, fixture } = await render(owner);
    const toggles = Array.from(page.querySelectorAll('button')).filter((b) =>
      text(b)?.startsWith(en.shell.demo.badge),
    );
    expect(toggles.length).toBe(1);
    const toggle = toggles[0];
    const panel = page.querySelector<HTMLElement>(`#${toggle?.getAttribute('aria-controls')}`);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);
    toggle?.click();
    await fixture.whenStable();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(text(panel)).toContain(en.shell.demo.explanation);
  });

  it('labels the unique identities and pending invitations without trends or sparklines', async () => {
    const { page } = await render(owner);
    const cards = page.querySelectorAll('adm-summary-card');
    expect(text(cards[2])).toBe(
      // No person records before P5, and memberships are not identities: the figure stays unavailable.
      `${en.companyOverview.summary.uniqueIdentities}—${en.companyOverview.unavailable}${en.companyOverview.summary.distinctAccounts}`,
    );
    expect(text(cards[3])).toContain(en.companyOverview.summary.awaitingAcceptance);
    for (const card of [cards[2], cards[3]]) {
      expect(card?.querySelector('.summary-card__trend, .summary-card__sparkline')).toBeNull();
    }
  });

  it('derives the organizations trend from the growth history (24 − 21)', async () => {
    const { page } = await render(owner);
    const organizations = page.querySelectorAll('adm-summary-card')[1];
    expect(text(organizations?.querySelector('.summary-card__trend'))).toBe('3+3');
    expect(text(organizations?.querySelector('.summary-card__caption'))).toBe(
      `${en.companyOverview.summary.acrossPlatforms} · +3 this period`,
    );
  });

  it('filters the growth chart by platform without a new request', async () => {
    const { page, fixture } = await render(owner);
    const value = () => text(page.querySelector('.growth-panel__value'));
    expect(value()).toBe('24');
    expect(text(page.querySelector('.growth-panel__change'))).toBe('+14% vs. Sep 23');
    const drive = Array.from(page.querySelectorAll('.growth-panel__filter')).find(
      (b) => text(b) === 'Nawara Drive',
    ) as HTMLButtonElement | undefined;
    drive?.click();
    await fixture.whenStable();
    expect(drive?.getAttribute('aria-pressed')).toBe('true');
    expect(value()).toBe('8');
  });

  it('shows actions without a destination disabled, saying so', async () => {
    const { page } = await render(owner);
    const links = Array.from(page.querySelectorAll<HTMLButtonElement>('button.card-link__button'));
    expect(links.length).toBeGreaterThan(0);
    expect(page.querySelector('a.card-link__button')?.getAttribute('href')).toBe('/platforms');
    expect(links.every((b) => b.disabled && b.title === en.shell.notAvailableYet)).toBe(true);
    expect(page.querySelector('.attention-list__item a, .attention-list__item button')).toBeNull();
  });

  it('shows Create platform to the owner, disabled with its reason where this build cannot send it', async () => {
    const { page } = await render(owner);
    const button = Array.from(page.querySelectorAll('button')).find(
      (b) => text(b) === en.companyOverview.create,
    );
    expect(button?.disabled).toBe(true);
    const note = page.querySelector(`#${button?.getAttribute('aria-describedby')}`);
    expect(text(note)).toBe(en.platforms.create.unavailable);
  });

  it('separates operator assignments from unique operators', async () => {
    const { page } = await render(owner);
    const figures = text(page.querySelector('.access-summary__figures'));
    expect(figures).toBe(
      `${en.companyOverview.access.operators.assignments} 5 ${en.companyOverview.access.operators.uniqueOperators} 4 ${en.companyOverview.access.operators.platforms} 2`,
    );
  });

  it('lists the documented services and says live health is unavailable, with no status of any kind (P8-S2)', async () => {
    const { page } = await render(owner);
    expect(page.textContent).toContain(en.companyOverview.health.subtitle);
    const card = page.querySelector('#overview-health')?.closest('adm-overview-card');
    const services = Array.from(card?.querySelectorAll('.service-health-strip__item') ?? []).map(
      text,
    );
    expect(services).toEqual(CORE_SERVICES.map((s) => en.coreServices.services[s].name));
    expect(text(card?.querySelector('[data-live-health]'))).toBe(
      en.coreServices.liveHealth.unavailable,
    );
    // No illustrative status, count or colour: nothing is observed.
    expect(text(card)).not.toMatch(
      /operational|delayed|degraded|outage|down|uptime|latency|\d+ of \d+/i,
    );
    expect(card?.querySelector('[class*="dot"], [class*="pill"]')).toBeNull();
    expect(card?.querySelector('a[href="/services"]')).not.toBeNull();
  });

  it('opens platforms into the platform scope', async () => {
    const { page } = await render(owner);
    const links = Array.from(page.querySelectorAll<HTMLAnchorElement>('.platform-list__open'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01',
      '/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b02',
    ]);
  });

  it('never shows an unavailable value as zero, and marks unavailable sections', async () => {
    const { page } = await render(owner, 'sections-unavailable');
    const identities = page.querySelectorAll('adm-summary-card')[2];
    expect(text(identities?.querySelector('.summary-card__value'))).toBe(
      `—${en.companyOverview.unavailable}`,
    );
    // attention, activity, growth, commercial and health
    expect(page.querySelectorAll('.company-overview__unavailable').length).toBe(5);
  });

  it('offers a retry when Core is unavailable', async () => {
    const { page } = await render(owner, 'error');
    expect(page.querySelector('nw-data-state')?.textContent).toContain(
      en.companyOverview.states.errorTitle,
    );
    expect(text(page.querySelector('[nwDataStateActions] button'))).toBe(
      en.companyOverview.states.retry,
    );
  });

  it('shows an operator no company-wide data and no Create platform', async () => {
    const { page } = await render(operator);
    expect(page.textContent).toContain(en.companyOverview.states.forbiddenTitle);
    expect(page.querySelector('adm-summary-card')).toBeNull();
    expect(page.textContent).not.toContain(en.companyOverview.create);
  });
});
