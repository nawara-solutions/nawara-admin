import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { Actor } from '../../../core/auth/actor';
import { ScopeContext } from '../../../core/context/scope-context';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../../../core/context/scope-directory.gateway';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { companyId, platformId } from '../../../core/context/scope.model';
import { LocaleService } from '../../../core/i18n/locale.service';
import { PREFERENCE_KEYS } from '../../../core/preferences/preference-store';
import { ACCENT_PALETTES, ThemeService } from '../../../core/theme/theme.service';
import { PreferenceMenus } from '../../../layout/preference-menus/preference-menus';
import { SETTINGS_ROUTES } from '../settings.routes';

@Component({ template: '' })
class Blank {}

/** The shell's arrangement in miniature: the top bar's language menu beside the routed Settings pages. */
@Component({
  imports: [RouterOutlet, PreferenceMenus],
  template: '<adm-preference-menus /><router-outlet />',
})
class WithTopBar {}

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'owner@x.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'operator@x.invalid',
  platformAssignments: [platformId('school')],
};
// An operator without any assignment still has personal settings: they never depend on a Platform.
const unassigned: Actor = { ...operator, userId: 'q', platformAssignments: [] };

const loadDemo = vi.fn(async () => {
  throw new Error('Settings must not load the demo bindings');
});

async function setup(actor: Actor = owner) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: {
          availableLangs: ['en', 'fr', 'ar'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      ScopeContext,
      { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
      provideRouter([
        { path: 'settings', children: SETTINGS_ROUTES },
        {
          path: 'with-top-bar',
          component: WithTopBar,
          children: [{ path: 'settings', children: SETTINGS_ROUTES }],
        },
        { path: '**', component: Blank },
      ]),
      // A demo build (a session can be established) whose bindings are never loaded: Settings reads no demo world,
      // no simulated Auth state and no gateway.
      { provide: APP_ENVIRONMENT, useValue: { production: false, demo: { load: loadDemo } } },
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const harness = await RouterTestingHarness.create();
  // As the application's bootstrap does: the router starts following the browser history (back, forward).
  TestBed.inject(Router).initialNavigation();
  const root = () => harness.routeNativeElement as HTMLElement;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  /** Waits for an outcome that follows an asynchronous step (a catalog load, a history traversal), then renders. */
  const until = async (done: () => boolean) => {
    await vi.waitFor(() => {
      if (!done()) throw new Error('not yet');
    });
    await settle();
  };
  return {
    harness,
    root,
    settle,
    until,
    router: TestBed.inject(Router),
    location: TestBed.inject(Location),
    locale: TestBed.inject(LocaleService),
    theme: TestBed.inject(ThemeService),
    session: TestBed.inject(AuthSession),
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const links = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLAnchorElement>('a.settings-workspace__link'));
const languageRadios = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLInputElement>('input[type=radio][name="language-settings"]'),
  );

describe('Settings pages (P9-S1)', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    delete document.documentElement.dataset['accent'];
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  for (const [name, actor] of [
    ['owner', owner],
    ['assigned operator', operator],
    ['operator without an assignment', unassigned],
  ] as const) {
    it(`the workspace selects Appearance for the ${name}, with authorized section links`, async () => {
      const { harness, root } = await setup(actor);
      await harness.navigateByUrl('/settings');
      expect(TestBed.inject(Router).url).toBe('/settings');
      expect(text(root().querySelector('h1'))).toBe(en.settings.title);
      expect(links(root()).map((a) => [a.dataset['section'], a.getAttribute('href')])).toEqual([
        ['appearance', '/settings/appearance'],
        ['language', '/settings/language'],
        ['account', '/settings/account'],
        // P9-S3: Company settings are the owner's; an operator never sees the entry, whatever their assignments
        // P9-S4a: the owner's Security sits in the Account section; operators have no factors and no entry
        ...(actor.kind === 'owner'
          ? [
              ['security', '/settings/security'],
              ['company', '/settings/company'],
            ]
          : []),
      ]);
      expect(root().querySelectorAll('[aria-current="page"]')).toHaveLength(1);
      expect(
        root().querySelector('[data-section="appearance"]')?.getAttribute('aria-current'),
      ).toBe('page');
      expect(root().querySelector('.appearance-panel__reset')).not.toBeNull();
      expect(root().querySelectorAll('h1')).toHaveLength(1);
    });
  }

  it('reuses the one theme state in the default Appearance section', async () => {
    const { harness, root, theme } = await setup();
    await harness.navigateByUrl('/settings');
    theme.setPreference('dark');
    harness.fixture.detectChanges();
    expect(root().querySelector<HTMLInputElement>('input[type=radio][value="dark"]')?.checked).toBe(
      true,
    );
    expect(root().querySelectorAll('adm-appearance-panel')).toHaveLength(1);
  });

  it('navigates to Language and Appearance, and back and forward through the browser history', async () => {
    const { harness, root, router, location, settle, until } = await setup();
    await harness.navigateByUrl('/settings');
    links(root())[1]?.click();
    await settle();
    expect(router.url).toBe('/settings/language');
    expect(text(root().querySelector('.language-settings__title'))).toBe(
      en.settings.language.title,
    );

    location.back();
    await until(() => router.url === '/settings');
    expect(links(root())).toHaveLength(5);

    location.forward();
    await until(() => router.url === '/settings/language');
    expect(text(root().querySelector('.language-settings__title'))).toBe(
      en.settings.language.title,
    );

    location.back();
    await until(() => router.url === '/settings');
    links(root())[0]?.click();
    await settle();
    expect(router.url).toBe('/settings/appearance');
    // The Appearance panel: three modes, the compact accent selector (its list holds the palettes), the reset.
    expect(root().querySelectorAll('input[type=radio][name$="-mode"]')).toHaveLength(3);
    expect(root().querySelectorAll('.accent-grid__tile')).toHaveLength(ACCENT_PALETTES.length);
    expect(root().querySelector('.appearance-panel__reset')).not.toBeNull();
  });

  it('keeps one route-selected section on every owner deep link', async () => {
    const { harness, root, router } = await setup();
    // Present unavailable production adapters instead of loading demo security/company bindings.
    Object.assign(TestBed.inject(APP_ENVIRONMENT), { production: true, demo: null });
    for (const section of ['appearance', 'language', 'account', 'security', 'company']) {
      await harness.navigateByUrl('/settings/' + section);
      expect(router.url).toBe('/settings/' + section);
      const selected = root().querySelectorAll('.settings-workspace__link[aria-current="page"]');
      expect(selected).toHaveLength(1);
      expect(selected[0]?.getAttribute('data-section')).toBe(section);
      expect(root().querySelectorAll('h1')).toHaveLength(1);
      expect(root().querySelectorAll('.settings-hub__link')).toHaveLength(0);
    }
  });

  it('Language offers English, French and Arabic, each named in itself, as one native radio group', async () => {
    const { harness, root } = await setup();
    await harness.navigateByUrl('/settings/language');
    expect(text(root().querySelector('legend'))).toBe(en.preferences.language.label);
    const radios = languageRadios(root());
    expect(radios.map((r) => r.value)).toEqual(['en', 'fr', 'ar']);
    expect(radios.find((r) => r.checked)?.value).toBe('en');
    expect(
      radios.map((r) => {
        const name = r.closest('label')?.querySelector('.language-settings__name');
        return [text(name), name?.getAttribute('lang')];
      }),
    ).toEqual([
      ['English', 'en'],
      ['Français', 'fr'],
      ['العربية', 'ar'],
    ]);
  });

  it('switches the application at once: Arabic is right to left, French and English left to right', async () => {
    const { harness, root, locale, until } = await setup();
    await harness.navigateByUrl('/settings/language');
    const choose = async (value: string) => {
      languageRadios(root())
        .find((r) => r.value === value)
        ?.click();
      await until(() => locale.locale() === value);
    };
    await choose('ar');
    expect(locale.locale()).toBe('ar');
    expect(TestBed.inject(Router).url).toBe('/settings/language');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
    expect(text(root().querySelector('.language-settings__title'))).toBe(
      ar.settings.language.title,
    );
    expect(languageRadios(root()).find((r) => r.checked)?.value).toBe('ar');

    await choose('fr');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['fr', 'ltr']);
    expect(text(root().querySelector('.language-settings__title'))).toBe(
      fr.settings.language.title,
    );

    await choose('en');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['en', 'ltr']);
  });

  it('stays in step with the top-bar language menu, both ways', async () => {
    const { harness, root, locale, until } = await setup();
    await harness.navigateByUrl('/with-top-bar/settings/language');
    const shell = harness.fixture.nativeElement as HTMLElement;
    const trigger = shell.querySelector<HTMLButtonElement>('.preference-menus__trigger');

    // Settings → top bar
    languageRadios(root())
      .find((r) => r.value === 'fr')
      ?.click();
    await until(() => locale.locale() === 'fr');
    expect(trigger?.getAttribute('aria-label')).toBe(`${fr.preferences.language.label}: Français`);

    // Top bar → Settings
    trigger?.click();
    await harness.fixture.whenStable();
    const arabic = document.querySelector<HTMLElement>(
      '.cdk-overlay-container [role="menuitem"][lang="ar"]',
    );
    expect(arabic).not.toBeNull();
    arabic?.click();
    await until(() => locale.locale() === 'ar');
    expect(languageRadios(root()).find((r) => r.checked)?.value).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  it('persists through the existing preference key only, and changes no session, business or security state', async () => {
    const { harness, root, session, locale, until } = await setup(operator);
    const actorBefore = session.actor();
    const writes: string[] = [];
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      writes.push(`${this === sessionStorage ? 'session' : 'local'}:${key}=${value}`);
    });
    await harness.navigateByUrl('/settings/language');
    for (const value of ['ar', 'fr']) {
      languageRadios(root())
        .find((r) => r.value === value)
        ?.click();
      await until(() => locale.locale() === value);
    }
    await harness.navigateByUrl('/settings');
    // One key, the one the top bar and the no-flash script of index.html use; nothing in session storage.
    expect(writes).toEqual([
      `local:${PREFERENCE_KEYS.locale}=ar`,
      `local:${PREFERENCE_KEYS.locale}=fr`,
    ]);
    expect(session.actor()).toBe(actorBefore);
    expect(loadDemo).not.toHaveBeenCalled();
  });
});
