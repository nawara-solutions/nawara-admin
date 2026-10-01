import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { LocaleService } from '../../../core/i18n/locale.service';
import { FoundationPreviewPage } from './foundation-preview.page';

describe('FoundationPreviewPage', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        FoundationPreviewPage,
        TranslocoTestingModule.forRoot({
          langs: { en, ar },
          translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
  });

  it('renders a single localized h1 inside main, with the banner outside it', async () => {
    const fixture = TestBed.createComponent(FoundationPreviewPage);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('h1').length).toBe(1);
    expect(host.querySelector('main h1')?.textContent).toContain(en.foundation.title);
    expect(host.querySelector('[role="banner"]')?.closest('main')).toBeNull();
  });

  it('switches copy and direction to Arabic', async () => {
    const fixture = TestBed.createComponent(FoundationPreviewPage);
    await TestBed.inject(LocaleService).use('ar');
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain(
      ar.foundation.title,
    );
    expect(document.documentElement.dir).toBe('rtl');
  });
});
