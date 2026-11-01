import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../../i18n/ar.json';
import en from '../../../../../i18n/en.json';
import fr from '../../../../../i18n/fr.json';
import { settle } from '../../testing/auth-testing';
import { AuthBrandPanel } from './auth-brand-panel';

/** B1 (2026-11-01): the blue-leaf logos on the sign-in brand panel; the rest of the panel is unchanged. */
describe('AuthBrandPanel logos', () => {
  async function render(lang: 'en' | 'fr' | 'ar') {
    TestBed.configureTestingModule({
      imports: [
        AuthBrandPanel,
        TranslocoTestingModule.forRoot({
          langs: { en, fr, ar },
          translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
          preloadLangs: true,
        }),
      ],
    });
    TestBed.inject(TranslocoService).setActiveLang(lang);
    const fixture = TestBed.createComponent(AuthBrandPanel);
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  for (const [lang, catalog] of [
    ['en', en],
    ['fr', fr],
    ['ar', ar],
  ] as const) {
    it(`${lang}: the Nawara Admin logo at the top, named once`, async () => {
      const panel = await render(lang);
      const logo = panel.querySelector('nw-brand-mark.auth-brand-panel__logo');
      expect(logo?.getAttribute('role')).toBe('img');
      expect(logo?.getAttribute('aria-label')).toBe(catalog.brand.adminLogoLabel);
      expect(logo?.querySelector('.nw-brand-mark__word')?.getAttribute('aria-hidden')).toBe('true');
      expect(logo?.querySelector('.nw-brand-mark__solutions')).toBeNull();
    });

    it(`${lang}: the copyright keeps "© 2026" as text, then the Nawara Solutions mark as one named image`, async () => {
      const panel = await render(lang);
      const copyright = panel.querySelector('.auth-brand-panel__copyright');
      expect(copyright?.textContent?.trim()).toBe('© 2026');
      expect(catalog.auth.brand.copyright).toBe('© 2026');
      const mark = copyright?.querySelector('.auth-brand-panel__copyright-mark');
      expect(mark?.getAttribute('role')).toBe('img');
      expect(mark?.getAttribute('aria-label')).toBe(catalog.brand.logoLabel);
      expect(mark?.textContent).toBe('');
      // Artwork through a theme token (light or dark lettering), never an <img> fetched per language.
      expect(copyright?.querySelector('img')).toBeNull();
    });
  }

  it('names the two identities apart: Nawara Admin (the product) and Nawara Solutions (the company)', () => {
    for (const catalog of [en, fr, ar]) {
      expect(catalog.brand.adminLogoLabel).toBe('Nawara Admin');
      expect(catalog.brand.logoLabel).not.toBe(catalog.brand.adminLogoLabel);
    }
  });
});
