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
import { PlatformDirectoryFacade } from '../application/platform-directory.facade';
import { PlatformDirectoryGateway } from '../data-access/platform-directory.gateway';
import {
  MockPlatformDirectoryGateway,
  PLATFORM_DIRECTORY_DEMO_SCENARIO,
  PlatformDirectoryDemoScenario,
} from '../data-access/platform-directory.mock';
import { PlatformsPage } from './platforms.page';

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
  signIn: { accounts: [], password: 'p', code: 'c' },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
  },
};

async function render(actor: Actor, scenario: PlatformDirectoryDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    imports: [
      PlatformsPage,
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
      { provide: PLATFORM_DIRECTORY_DEMO_SCENARIO, useValue: scenario },
      { provide: PlatformDirectoryGateway, useClass: MockPlatformDirectoryGateway },
      PlatformDirectoryFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const fixture = TestBed.createComponent(PlatformsPage);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fixture.whenStable();
  };
  await settle();
  return { page: fixture.nativeElement as HTMLElement, settle };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim();

async function search(page: HTMLElement, settle: () => Promise<void>, value: string) {
  const input = page.querySelector<HTMLInputElement>('input[type="search"]');
  if (!input) throw new Error('search input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}

describe('PlatformsPage', () => {
  it('lists the platforms with their figures and links into the platform scope', async () => {
    const { page } = await render(owner);
    expect(text(page.querySelector('h1'))).toBe(en.platforms.title);
    expect(text(page.querySelector('[role="status"].platforms__count'))).toBe('2 platforms');
    const cards = page.querySelectorAll('adm-platform-card');
    expect(cards.length).toBe(2);
    expect(text(cards[0]?.querySelector('dl'))).toBe(
      `${en.platforms.organizations} 16 ${en.platforms.memberships} 920 ${en.platforms.assignments} 3`,
    );
    expect(cards[0]?.querySelector('a')?.getAttribute('href')).toBe(
      '/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01',
    );
  });

  it('filters by name or product type, counts in the singular, and clears', async () => {
    const { page, settle } = await render(owner);
    await search(page, settle, 'driving');
    expect(page.querySelectorAll('adm-platform-card').length).toBe(1);
    expect(text(page.querySelector('.platforms__count'))).toBe('1 platform');
    await search(page, settle, 'Academy');
    expect(page.querySelector('adm-platform-card')).toBeNull();
    expect(text(page.querySelector('.platforms__message-title'))).toBe(
      'No platforms match “Academy”',
    );
    page.querySelector<HTMLButtonElement>('.platforms__message-action')?.click();
    await settle();
    expect(page.querySelectorAll('adm-platform-card').length).toBe(2);
  });

  it('shows an unavailable figure as "—", never as zero', async () => {
    const { page } = await render(owner, 'partial');
    const drive = page.querySelectorAll('adm-platform-card')[1];
    expect(drive?.querySelectorAll('.platforms__missing, .platform-card__missing').length).toBe(2);
    expect(text(drive?.querySelector('dl'))).toContain(en.platforms.unavailable);
  });

  it('separates an empty company from a failed load, and offers a retry only for the failure', async () => {
    const empty = await render(owner, 'empty');
    expect(text(empty.page.querySelector('.platforms__message-title'))).toBe(
      en.platforms.emptyTitle,
    );
    expect(empty.page.querySelector('.platforms__message-action')).toBeNull();
    TestBed.resetTestingModule();
    const failed = await render(owner, 'error');
    expect(failed.page.querySelector('[role="alert"]')).not.toBeNull();
    expect(text(failed.page.querySelector('.platforms__message-action'))).toBe(en.platforms.retry);
    expect(failed.page.querySelector('input[type="search"]')).toBeNull();
  });

  it('keeps Create platform focusable but disabled, with its explanation', async () => {
    const { page } = await render(owner);
    const button = page.querySelector<HTMLButtonElement>('.platforms__create-button');
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    const note = page.querySelector(`#${button?.getAttribute('aria-describedby')}`);
    expect(text(note)).toBe(en.companyOverview.createUnavailable);
  });

  it('gives an operator no company-wide directory', async () => {
    const { page } = await render(operator);
    expect(page.querySelector('adm-platform-card')).toBeNull();
    expect(page.textContent).toContain(en.companyOverview.states.forbiddenTitle);
    expect(page.textContent).not.toContain(en.companyOverview.create);
  });
});
