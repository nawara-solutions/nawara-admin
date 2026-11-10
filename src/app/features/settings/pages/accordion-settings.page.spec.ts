import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { AccordionPreferences } from '../../../core/preferences/accordion-preferences';
import { PREFERENCE_KEYS } from '../../../core/preferences/preference-store';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import {
  PlatformSettingsGateway,
  UnavailablePlatformSettingsGateway,
} from '../data-access/platform-settings.gateway';
import { MockPlatformSettingsGateway } from '../data-access/platform-settings.mock';
import { AccordionSettingsPage } from './accordion-settings.page';

const A = en.settings.accordions;
const P = en.platformDashboard.policies;

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

// Only the keys this page and the session touch are removed, never other storage.
const STORED_KEYS = [
  PREFERENCE_KEYS.operatorTotalsMode,
  PREFERENCE_KEYS.platformFiguresVisible,
  PREFERENCE_KEYS.platformSubscriptionsVisible,
];
const DEMO_SESSION_KEYS = ['nw.demo.actor', 'nw.demo.mockSession'];
const clearStorage = () => {
  STORED_KEYS.forEach((key) => localStorage.removeItem(key));
  DEMO_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
};
beforeEach(clearStorage);
afterEach(clearStorage);

async function render(actor: Actor, gateway: 'mock' | 'unavailable' = 'mock') {
  TestBed.configureTestingModule({
    imports: [
      AccordionSettingsPage,
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
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      ScopeContext,
      {
        provide: PlatformSettingsGateway,
        useClass:
          gateway === 'mock' ? MockPlatformSettingsGateway : UnavailablePlatformSettingsGateway,
      },
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const world = TestBed.inject(DemoWorld);
  const fixture = TestBed.createComponent(AccordionSettingsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  await settle();
  const pageOption = (label: string) =>
    [...element.querySelectorAll<HTMLLabelElement>('.accordion-settings__page-options label')]
      .find((option) => text(option) === label)
      ?.querySelector<HTMLInputElement>('input') ?? null;
  const choose = async (label: string) => {
    pageOption(label)!.click();
    await settle();
  };
  const pagePanel = () => element.querySelector<HTMLElement>('.accordion-settings__page');
  const preview = () =>
    element.querySelector<HTMLElement>('[aria-labelledby="page-settings-preview-title"]');
  return { element, world, settle, pageOption, choose, pagePanel, preview };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Page sections settings: assisted payments are read only (A31-04 / X34, WP-1.1)', () => {
  it('shows the owner no control that changes assisted payments', async () => {
    const s = await render(owner);
    await s.choose(A.platformSettings);
    const panel = s.pagePanel()!;
    expect(text(panel.querySelector('h3'))).toBe(A.platformSettings);
    // Only the Platform picker for the read-only preview: no checkbox, switch or button.
    expect(panel.querySelector('select#policy-platform')).not.toBeNull();
    expect(panel.querySelectorAll('input, button, [role="switch"]')).toHaveLength(0);
    expect(text(panel)).not.toContain(P.assistedPayments);
    expect(text(panel)).not.toContain(A.demoPolicy);
  });

  it("keeps the read-only preview of each Platform's policy, as the demo world holds it", async () => {
    const s = await render(owner);
    await s.choose(A.platformSettings);
    const status = () =>
      text(s.preview()!.querySelector('.accordion-settings__preview-setting strong'));
    expect(text(s.preview())).toContain(P.assistedPayments);
    expect(text(s.preview()!.querySelector('h3'))).toBe('Nawara School');
    expect(status()).toBe(P.enabled);
    const select = s.pagePanel()!.querySelector<HTMLSelectElement>('select#policy-platform')!;
    select.value = DEMO_DRIVE_PLATFORM_ID;
    select.dispatchEvent(new Event('change'));
    await s.settle();
    expect(text(s.preview()!.querySelector('h3'))).toBe('Nawara Drive');
    expect(status()).toBe(P.disabled);
  });

  it('changes no Platform or Organization assisted-payments state, whatever the owner does on the page', async () => {
    const s = await render(owner);
    const before = s.world.snapshot();
    for (const label of [A.platformSettings, en.operators.header.title, A.platformDashboard]) {
      await s.choose(label);
      for (const input of s.element.querySelectorAll<HTMLInputElement>(
        '.accordion-settings__page input',
      )) {
        input.click();
        await s.settle();
      }
    }
    await s.choose(A.platformSettings);
    const select = s.pagePanel()!.querySelector<HTMLSelectElement>('select#policy-platform')!;
    select.value = DEMO_DRIVE_PLATFORM_ID;
    select.dispatchEvent(new Event('change'));
    await s.settle();
    for (const button of s.element.querySelectorAll<HTMLButtonElement>(
      '.accordion-settings__footer button',
    ))
      if (!button.disabled) {
        button.click();
        await s.settle();
      }
    const after = s.world.snapshot();
    expect(after).toBe(before);
    expect(after.platformCommercial).toBe(before.platformCommercial);
    expect(after.organizations).toBe(before.organizations);
  });

  it('says the policy cannot be shown in a build without the demo adapter', async () => {
    const s = await render(owner, 'unavailable');
    await s.choose(A.platformSettings);
    expect(text(s.pagePanel())).toContain(A.platformUnavailable);
    expect(s.pagePanel()!.querySelector('select, input')).toBeNull();
    expect(s.preview()).toBeNull();
  });

  it('never offers the Platform section to an operator', async () => {
    const s = await render(operator);
    expect(s.pageOption(A.platformSettings)).toBeNull();
    expect(s.pageOption(en.operators.header.title)).not.toBeNull();
    expect(s.pageOption(A.platformDashboard)).not.toBeNull();
    expect(s.preview()).toBeNull();
  });

  it('still applies the unrelated page-section preferences', async () => {
    const s = await render(owner);
    const preferences = TestBed.inject(AccordionPreferences);
    const apply = () =>
      [...s.element.querySelectorAll<HTMLButtonElement>('.accordion-settings__footer button')].find(
        (button) => text(button) === en.preferences.appearance.apply,
      )!;
    expect(apply().disabled).toBe(true);
    s.pagePanel()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await s.settle();
    expect(apply().disabled).toBe(false);
    apply().click();
    await s.settle();
    expect(preferences.operatorTotalsMode()).toBe('hidden');
    expect(localStorage.getItem(PREFERENCE_KEYS.operatorTotalsMode)).toBe('hidden');
    await s.choose(A.platformDashboard);
    const [figures, subscriptions] = s.pagePanel()!.querySelectorAll<HTMLInputElement>('input');
    figures!.click();
    subscriptions!.click();
    await s.settle();
    apply().click();
    await s.settle();
    expect(preferences.platformFiguresVisible()).toBe(false);
    expect(preferences.platformSubscriptionsVisible()).toBe(false);
  });
});
