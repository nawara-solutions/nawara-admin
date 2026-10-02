import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DEMO_COMPANY_ID } from '../../../core/context/scope-directory.fixtures';
import { platformId } from '../../../core/context/scope.model';
import { CompanyOverviewFacade } from '../application/company-overview.facade';
import { CommercialSummaryGateway } from '../data-access/commercial-summary.gateway';
import { CompanyOverviewGateway } from '../data-access/company-overview.gateway';
import {
  COMPANY_OVERVIEW_DEMO_SCENARIO,
  CompanyOverviewDemoScenario,
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
  MockServiceHealthGateway,
} from '../data-access/company-overview.mock';
import { ServiceHealthGateway } from '../data-access/service-health.gateway';
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
  owner,
  providers: {
    scopeDirectory: [],
    notificationSummary: [],
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
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
      { provide: COMPANY_OVERVIEW_DEMO_SCENARIO, useValue: scenario },
      { provide: CompanyOverviewGateway, useClass: MockCompanyOverviewGateway },
      { provide: CommercialSummaryGateway, useClass: MockCommercialSummaryGateway },
      { provide: ServiceHealthGateway, useClass: MockServiceHealthGateway },
      CompanyOverviewFacade,
    ],
  });
  TestBed.inject(AuthSession).startDemo(actor);
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
      `${en.companyOverview.summary.uniqueIdentities} 1,284 ${en.companyOverview.summary.distinctAccounts}`,
    );
    expect(text(cards[3])).toContain(en.companyOverview.summary.awaitingAcceptance);
    for (const card of [cards[2], cards[3]]) {
      expect(card?.querySelector('.summary-card__trend, .summary-card__sparkline')).toBeNull();
    }
  });

  it('derives the organizations trend from the growth history (24 − 16)', async () => {
    const { page } = await render(owner);
    const organizations = page.querySelectorAll('adm-summary-card')[1];
    expect(text(organizations?.querySelector('.summary-card__trend'))).toBe('8+8');
    expect(text(organizations?.querySelector('.summary-card__caption'))).toBe(
      `${en.companyOverview.summary.acrossPlatforms} · +8 this period`,
    );
  });

  it('filters the growth chart by platform without a new request', async () => {
    const { page, fixture } = await render(owner);
    const value = () => text(page.querySelector('.growth-panel__value'));
    expect(value()).toBe('24');
    expect(text(page.querySelector('.growth-panel__change'))).toBe('+50% vs. Sep 1');
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
    const links = Array.from(page.querySelectorAll<HTMLButtonElement>('.card-link__button'));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((b) => b.disabled && b.title === en.shell.notAvailableYet)).toBe(true);
    expect(page.querySelector('.attention-list__item a, .attention-list__item button')).toBeNull();
  });

  it('shows Create platform to the owner, disabled with its explanation', async () => {
    const { page } = await render(owner);
    const button = Array.from(page.querySelectorAll('button')).find(
      (b) => text(b) === en.companyOverview.create,
    );
    expect(button?.disabled).toBe(true);
    const note = page.querySelector(`#${button?.getAttribute('aria-describedby')}`);
    expect(text(note)).toBe(en.companyOverview.createUnavailable);
  });

  it('separates operator assignments from unique operators', async () => {
    const { page } = await render(owner);
    const figures = text(page.querySelector('.access-summary__figures'));
    expect(figures).toBe(
      `${en.companyOverview.access.operators.assignments} 5 ${en.companyOverview.access.operators.uniqueOperators} 4 ${en.companyOverview.access.operators.platforms} 2`,
    );
  });

  it('says the service statuses are illustrative, counts them, and lists Auth', async () => {
    const { page } = await render(owner);
    expect(page.textContent).toContain(en.companyOverview.health.subtitle);
    expect(text(page.querySelector('.company-overview__pill--warning'))).toBe('7 of 8 operational');
    const services = Array.from(page.querySelectorAll('.service-health-strip__name')).map(text);
    expect(services[0]).toBe(en.companyOverview.health.services.auth);
    expect(services.length).toBe(8);
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
