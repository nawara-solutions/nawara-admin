import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { CompanySettingsFacade } from '../application/company-settings.facade';
import {
  CompanySettingsGateway,
  UnavailableCompanySettingsGateway,
} from '../data-access/company-settings.gateway';
import {
  COMPANY_SETTINGS_DEMO_SCENARIO,
  CompanySettingsDemoScenario,
  MockCompanySettingsGateway,
} from '../data-access/company-settings.mock';
import { CompanySettingsPage } from './company-settings.page';

const t = en.settings.company;

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

async function render(
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
    langs = { en },
  }: {
    gateway?: 'mock' | 'unavailable';
    scenario?: CompanySettingsDemoScenario;
    langs?: Record<string, Translation>;
  } = {},
) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      CompanySettingsPage,
      TranslocoTestingModule.forRoot({
        langs,
        translocoConfig: {
          availableLangs: Object.keys(langs),
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: COMPANY_SETTINGS_DEMO_SCENARIO, useValue: scenario },
      {
        provide: CompanySettingsGateway,
        useClass:
          gateway === 'mock' ? MockCompanySettingsGateway : UnavailableCompanySettingsGateway,
      },
      CompanySettingsFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const spy = vi.spyOn(TestBed.inject(CompanySettingsGateway), 'load');
  const fixture = TestBed.createComponent(CompanySettingsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  await settle();
  return { element, spy, settle };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Settings → Company (P9-S3)', { timeout: 15_000 }, () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.unstubAllGlobals();
  });

  it('shows the owner their Company: its name and Platform count, for their own Company only', async () => {
    const { element, spy } = await render();
    expect(spy).toHaveBeenCalledWith(DEMO_COMPANY_ID);
    expect(text(element.querySelector('h1'))).toBe(t.title);
    expect(text(element.querySelector('[data-name]'))).toBe('Nawara Solutions');
    expect(text(element.querySelector('[data-platform-count]'))).toBe('2');
  });

  it('links to the existing administration, never rebuilt here', async () => {
    const { element } = await render();
    expect(
      [...element.querySelectorAll<HTMLAnchorElement>('[data-management] a')].map((a) => [
        a.dataset['link'],
        a.getAttribute('href'),
      ]),
    ).toEqual([
      ['overview', '/overview'],
      ['platforms', '/platforms'],
      ['operators', '/operators'],
      ['licenses', '/licenses'],
      ['billing', '/billing'],
      ['audit', '/audit'],
    ]);
  });

  it('offers no edit, save or upload control, and no field Core does not define', async () => {
    const { element } = await render();
    expect(
      element.querySelectorAll('button, input, textarea, select, form, [contenteditable]'),
    ).toHaveLength(0);
    expect(text(element.querySelector('[data-unavailable]'))).toContain(t.unavailable.body);
    // only the name and the Platform count are facts here
    expect([...element.querySelectorAll('[data-profile] dt')].map(text)).toEqual([
      t.name,
      t.platforms,
    ]);
    expect(text(element)).not.toMatch(/@|\+\d|IBAN|VAT|address/i);
  });

  it('an operator is refused without asking the gateway, even with every Platform assigned', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element)).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('[data-profile], [data-management]')).toBeNull();
    expect(text(element)).not.toContain('Nawara Solutions');
  });

  it('a production build says Company settings are not available, never a demo Company', async () => {
    const { element } = await render(owner, { gateway: 'unavailable' });
    expect(text(element)).toContain(t.states.notInBuildTitle);
    expect(text(element)).not.toContain('Nawara Solutions');
    expect(element.querySelector('[data-management]')).toBeNull();
  });

  it('an unavailable read offers Try again', async () => {
    const { element, spy, settle } = await render(owner, { scenario: 'error' });
    expect(text(element)).toContain(t.states.errorTitle);
    element.querySelector<HTMLButtonElement>('button')?.click();
    await settle();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('in Arabic: translated and right to left, the Company name kept in its own direction', async () => {
    const { element, settle } = await render(owner, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(element.querySelector('h1'))).toBe(ar.settings.company.title);
    expect(element.querySelector('[data-name] bdi')?.textContent).toBe('Nawara Solutions');
  });
});
