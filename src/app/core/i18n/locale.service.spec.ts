import { Directionality } from '@angular/cdk/bidi';
import { TestBed } from '@angular/core/testing';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en: { hello: 'Hello' }, fr: { hello: 'Bonjour' }, ar: { hello: 'مرحبا' } },
          translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: 'en' },
        }),
      ],
    });
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
  });

  it('switches to Arabic: right-to-left, lang, active catalog and stored preference', async () => {
    const service = TestBed.inject(LocaleService);
    await service.use('ar');
    TestBed.tick();
    expect(service.direction()).toBe('rtl');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(TestBed.inject(TranslocoService).translate('hello')).toBe('مرحبا');
    expect(localStorage.getItem('nw.locale')).toBe('ar');
    expect(TestBed.inject(Directionality).value).toBe('rtl');
  });

  it('starts from the stored locale', async () => {
    localStorage.setItem('nw.locale', 'fr');
    const service = TestBed.inject(LocaleService);
    await service.initialize();
    TestBed.tick();
    expect(service.locale()).toBe('fr');
    expect(document.documentElement.dir).toBe('ltr');
  });
});
