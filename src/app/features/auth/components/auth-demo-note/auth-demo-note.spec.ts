import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { DemoSignInHint } from '../../../../core/config/app-environment';
import { settle, text } from '../../testing/auth-testing';
import { AuthDemoNote } from './auth-demo-note';

const HINT: DemoSignInHint = {
  accounts: [{ email: 'enrollment@demo.nawara.invalid', roleKey: 'auth.demo.enrollment' }],
  password: 'p',
  code: '123456',
  operators: [],
  workingCode: 'w',
  newOperators: [],
  confirmationCode: 'k',
  enrollmentNote: { en: 'Fictional key; use 123456.', fr: 'fr', ar: 'ar' },
};

describe('AuthDemoNote', () => {
  it('says the setup QR holds a fictional key, that app codes will not work, and which code to use', async () => {
    TestBed.configureTestingModule({
      imports: [
        AuthDemoNote,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
    const fixture = TestBed.createComponent(AuthDemoNote);
    fixture.componentRef.setInput('hint', HINT);
    await settle(fixture);
    const note = text(fixture.nativeElement as HTMLElement);
    expect(note).toContain(en.auth.demo.enrollmentQr);
    expect(note).toContain('Fictional key; use 123456.');
  });

  it('shows no setup explanation when the demo bindings carry none', async () => {
    TestBed.configureTestingModule({
      imports: [
        AuthDemoNote,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
    const fixture = TestBed.createComponent(AuthDemoNote);
    fixture.componentRef.setInput('hint', { ...HINT, enrollmentNote: undefined });
    await settle(fixture);
    expect(text(fixture.nativeElement as HTMLElement)).not.toContain(en.auth.demo.enrollmentQr);
  });
});
