import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import ar from '../../../i18n/ar.json';
import { AuthSession } from '../../core/auth/auth-session';
import { ScopeContext } from '../../core/context/scope-context';
import { AdminScope, companyId, platformId } from '../../core/context/scope.model';
import { ContextSwitcher } from './context-switcher';

const platforms = [
  { id: platformId('school'), name: 'Nawara School', key: null, product: 'school' },
  { id: platformId('drive'), name: 'Nawara Drive', key: null, product: 'drive' },
] as const;

describe('ContextSwitcher', () => {
  for (const lang of ['en', 'fr', 'ar']) {
    it(`${lang}: shows official scope identities, selected state and preserves navigation`, async () => {
      const scope = signal<AdminScope>({ kind: 'company' });
      const navigateByUrl = vi.fn();
      TestBed.configureTestingModule({
        imports: [
          ContextSwitcher,
          TranslocoTestingModule.forRoot({
            langs: { en, fr, ar },
            translocoConfig: { defaultLang: lang, availableLangs: ['en', 'fr', 'ar'] },
            preloadLangs: true,
          }),
        ],
        providers: [
          { provide: Router, useValue: { navigateByUrl } },
          {
            provide: AuthSession,
            useValue: {
              actor: signal({ kind: 'owner', userId: 'owner', companyId: companyId('company') }),
            },
          },
          {
            provide: ScopeContext,
            useValue: {
              scope,
              platforms: signal({ status: 'success', data: platforms }),
              directory: signal({
                status: 'success',
                data: { company: { name: 'Nawara Solutions' } },
              }),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(ContextSwitcher);
      await fixture.whenStable();
      const trigger = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(trigger.textContent).toContain('Nawara Solutions');
      expect(trigger.querySelector('.context-switcher__chevron')?.getAttribute('aria-hidden')).toBe(
        'true',
      );
      expect(trigger.querySelector('button')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).not.toBe('true');
      trigger.click();
      await fixture.whenStable();
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      const rows = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.context-switcher__item'),
      );
      expect(rows).toHaveLength(3);
      const catalog = { en, fr, ar }[lang as 'en' | 'fr' | 'ar'];
      expect(rows[1]?.querySelector('.context-switcher__description')?.textContent?.trim()).toBe(
        catalog.shell.context.productDescription.school,
      );
      expect(rows[2]?.querySelector('.context-switcher__description')?.textContent?.trim()).toBe(
        catalog.shell.context.productDescription.drive,
      );
      expect(document.querySelector('.context-switcher__group')).toBeNull();
      expect(rows[0]?.getAttribute('aria-current')).toBe('true');
      expect(rows[1]?.querySelector('nw-product-symbol')?.getAttribute('style')).toContain(
        'school-mask',
      );
      expect(rows[2]?.querySelector('nw-product-symbol')?.getAttribute('style')).toContain(
        'drive-mask',
      );
      rows[1]?.click();
      await fixture.whenStable();
      expect(navigateByUrl).toHaveBeenCalledWith('/platforms/school');
      expect(trigger.getAttribute('aria-expanded')).not.toBe('true');
      scope.set({ kind: 'platform', platformId: platformId('drive') });
      await fixture.whenStable();
      expect(trigger.textContent).toContain('Nawara Drive');
      expect(trigger.querySelector('nw-product-symbol')?.getAttribute('style')).toContain(
        'drive-mask',
      );
      fixture.destroy();
    });
  }
});
