import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../../i18n/ar.json';
import en from '../../../../../i18n/en.json';
import fr from '../../../../../i18n/fr.json';
import { settle } from '../../testing/auth-testing';
import { AuthBrandPanel } from './auth-brand-panel';

/** The sign-in brand panel: the Owner-approved Nawara | Admin pilot, headline and copyright. */
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
      const logo = panel.querySelector('nw-admin-brand-lockup.auth-brand-panel__logo');
      expect(logo?.getAttribute('role')).toBe('img');
      expect(logo?.getAttribute('aria-label')).toBe(catalog.brand.adminLogoLabel);
      expect(logo?.querySelector('.nw-brand-mark__type')).not.toBeNull();
      expect(logo?.querySelector('.nw-brand-mark__word-symbol')).not.toBeNull();
      expect(logo?.querySelector('.nw-brand-mark__solutions')).toBeNull();
    });

    it(`${lang}: the copyright reads "© 2026 Nawara Solutions" as compact, direction-isolated text`, async () => {
      const panel = await render(lang);
      const copyright = panel.querySelector('.auth-brand-panel__copyright');
      expect(copyright?.textContent?.trim()).toBe('© 2026 Nawara Solutions');
      expect(catalog.auth.brand.copyrightCompany).toBe('© 2026 Nawara Solutions');
      // <bdi>: the Latin line keeps its order on an Arabic (RTL) page.
      expect(copyright?.querySelector('bdi')?.textContent?.trim()).toBe('© 2026 Nawara Solutions');
      expect(copyright?.querySelector('img, [role=img]')).toBeNull();
    });

    it(`${lang}: the headline keeps its wording, its last words in the accent colour`, async () => {
      const panel = await render(lang);
      const tagline = panel.querySelector('.auth-brand-panel__tagline');
      const emphasis = tagline?.querySelector('.auth-brand-panel__tagline-emphasis');
      expect(emphasis?.textContent?.trim()).toBe(catalog.auth.brand.taglineEmphasis);
      // Lead + emphasis is exactly the full tagline (same wording and line breaks as the phone footer).
      expect(catalog.auth.brand.taglineLead + catalog.auth.brand.taglineEmphasis).toBe(
        catalog.auth.brand.tagline,
      );
      expect(tagline?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        catalog.auth.brand.tagline.replace(/\s+/g, ' '),
      );
      const line = panel.querySelector('.auth-brand-panel__line');
      const lineEmphasis = line?.querySelector('.auth-brand-panel__line-emphasis');
      expect(line?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        `${catalog.auth.brand.lineLead}${catalog.auth.brand.lineEmphasis}`
          .replace(/\s+/g, ' ')
          .trim(),
      );
      expect(lineEmphasis?.textContent?.trim()).toBe(catalog.auth.brand.lineEmphasis);
      expect(lineEmphasis?.getAttribute('dir')).toBe('ltr');
    });
  }

  it('names the two identities apart: Nawara Admin (the product) and Nawara Solutions (the company)', () => {
    for (const catalog of [en, fr, ar]) {
      expect(catalog.brand.adminLogoLabel).toBe('Nawara Admin');
      expect(catalog.brand.logoLabel).not.toBe(catalog.brand.adminLogoLabel);
    }
  });
});
