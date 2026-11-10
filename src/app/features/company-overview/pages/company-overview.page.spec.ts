import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { MockScopeDirectoryGateway } from '../../../core/context/scope-directory.mock';
import { ServiceHealthStrip } from '../components/service-health-strip/service-health-strip';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
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
  DOCUMENTED_SERVICE_INVENTORY,
  MockServiceInventoryGateway,
  SERVICES_DEMO_SCENARIO,
} from '../../../core/core-services/service-inventory.mock';
import { CORE_SERVICES } from '../../../core/core-services/core-service.model';
import { DEMO_OWNER_ID } from '../../../demo/world/seed';
import { ServicesFacade } from '../../services/application/services.facade';
import { ServicesPage } from '../../services/pages/services.page';
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
    platformSettings: [],
    companySettings: [],
    accountSecurity: [],
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
    assistance: [],
    financialAuthorization: [],
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
      ScopeContext,
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      CompanyOverviewFacade,
      // Only for comparing the Overview with the Services page (WP-1.3).
      ServicesFacade,
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
      `${en.companyOverview.summary.uniqueIdentities}—${en.companyOverview.unavailable}`,
    );
    expect(text(cards[3])).toContain(en.companyOverview.summary.pendingInvitations);
    for (const card of [cards[2], cards[3]]) {
      expect(card?.querySelector('.summary-card__trend, .summary-card__sparkline')).toBeNull();
    }
  });

  it('derives the organizations trend from the growth history (24 − 21)', async () => {
    const { page } = await render(owner);
    const organizations = page.querySelectorAll('adm-summary-card')[1];
    expect(text(organizations?.querySelector('.summary-card__trend'))).toBe('+3 this period');
    expect(organizations?.querySelector('.summary-card__footer')).toBeNull();
  });

  it('changes the reporting period and reloads the chart while retaining current totals', async () => {
    const { page, fixture } = await render(owner);
    const trigger = page.querySelector<HTMLButtonElement>('.overview-header__chip--period');
    expect(trigger?.disabled).toBe(false);
    expect(text(trigger)).toBe('Last 30 days');
    for (const days of [1, 7, 90, 30]) {
      trigger?.click();
      await fixture.whenStable();
      const options = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.overview-header__period-option'),
      );
      expect(options.map((option) => option.dataset['period'])).toEqual(['1', '7', '30', '90']);
      const option = options.find((item) => item.dataset['period'] === String(days));
      if (!option) throw new Error('expected period option');
      option.click();
      await fixture.whenStable();
      for (
        let index = 0;
        index < 50 && TestBed.inject(CompanyOverviewFacade).state().status !== 'success';
        index++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await fixture.whenStable();
      }
      const state = TestBed.inject(CompanyOverviewFacade).state();
      expect(state.status).toBe('success');
      if (state.status !== 'success' || state.data.growth.status !== 'available')
        throw new Error('expected growth');
      expect(state.data.periodDays).toBe(days);
      expect(state.data.growth.data.points[0]?.day).toBe(
        new Date(Date.parse('2026-10-23T12:00:00Z') - days * 86400000).toISOString().slice(0, 10),
      );
      expect(text(page.querySelector('.growth-panel__value'))).toBe('24');
      expect(text(trigger)).toBe(days === 1 ? 'Today' : `Last ${days} days`);
      expect(document.querySelector('.overview-header__period-menu')).toBeNull();
    }
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

  it('omits Create platform from the owner overview', async () => {
    const { page } = await render(owner);
    expect(page.textContent).not.toContain(en.companyOverview.create);
  });

  it('separates operator assignments from unique operators', async () => {
    const { page } = await render(owner);
    const figures = text(page.querySelector('.access-summary__figures'));
    expect(figures).toBe(
      `${en.companyOverview.access.operators.assignments} 5 ${en.companyOverview.access.operators.uniqueOperators} 4 ${en.companyOverview.access.operators.platforms} 2`,
    );
  });

  it('shows the service inventory with live health unavailable, never a simulated status (WP-1.3)', async () => {
    const { page } = await render(owner);
    expect(page.querySelector('.overview-card__subtitle')).toBeNull();
    const card = page.querySelector('#overview-health')?.closest('adm-overview-card');
    const services = Array.from(card?.querySelectorAll('.service-health-strip__name') ?? []).map(
      text,
    );
    // The inventory stays; health is what is unavailable, in a demo build too.
    expect(services).toEqual(CORE_SERVICES.map((s) => en.coreServices.services[s].name));
    expect(text(card?.querySelector('[data-live-health]'))).toBe(
      en.coreServices.liveHealth.unavailable,
    );
    expect(
      card?.querySelectorAll('.service-health-strip__status, [class*="indicator"]'),
    ).toHaveLength(0);
    expect(text(card)).not.toMatch(/operational|degraded|healthy|outage|uptime|latency|incident/i);
    expect(card?.querySelector('a[href="/services"]')).not.toBeNull();
    // Read only: nothing to restart, deploy or recover.
    expect(card?.querySelectorAll('button:not(.card-link__button), form, input')).toHaveLength(0);
  });

  it('says the same about live health as the Services page, from one inventory read', async () => {
    const { page } = await render(owner);
    const overview = text(
      page
        .querySelector('#overview-health')
        ?.closest('adm-overview-card')
        ?.querySelector('[data-live-health]'),
    );
    const inventory = vi.spyOn(TestBed.inject(ServiceInventoryGateway), 'inventory');
    const services = TestBed.createComponent(ServicesPage);
    await services.whenStable();
    for (let i = 0; i < 50 && !services.nativeElement.querySelector('[data-live-health] h2'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      await services.whenStable();
    }
    const servicesPage = text(
      (services.nativeElement as HTMLElement).querySelector('[data-live-health] h2'),
    );
    expect(overview).toBe(en.coreServices.liveHealth.unavailable);
    expect(servicesPage).toBe(overview);
    // Only the documented inventory is read: no health polling or monitoring request.
    expect(inventory).toHaveBeenCalledTimes(1);
  });

  it('renders live health unavailable, with no simulated status, in English, French and Arabic', () => {
    const SIMULATED: Record<'en' | 'fr' | 'ar', readonly string[]> = {
      en: ['Operational', 'Degraded'],
      fr: ['Opérationnel', 'Dégradé'],
      ar: ['تعمل بشكل طبيعي', 'أداء متراجع'],
    };
    for (const [lang, copy] of [
      ['en', en],
      ['fr', fr],
      ['ar', ar],
    ] as const) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [
          ServiceHealthStrip,
          TranslocoTestingModule.forRoot({
            langs: { [lang]: copy },
            translocoConfig: { availableLangs: [lang], defaultLang: lang },
            preloadLangs: true,
          }),
        ],
      });
      const fixture = TestBed.createComponent(ServiceHealthStrip);
      fixture.componentRef.setInput('inventory', DOCUMENTED_SERVICE_INVENTORY);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(text(element.querySelector('[data-live-health]')), lang).toBe(
        copy.coreServices.liveHealth.unavailable,
      );
      expect(
        Array.from(element.querySelectorAll('.service-health-strip__name')).map(text),
        lang,
      ).toEqual(CORE_SERVICES.map((s) => copy.coreServices.services[s].name));
      expect(element.querySelector('.service-health-strip__status'), lang).toBeNull();
      for (const status of SIMULATED[lang]) expect(text(element), lang).not.toContain(status);
    }
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
