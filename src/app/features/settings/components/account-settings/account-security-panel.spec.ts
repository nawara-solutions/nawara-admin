import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { companyId } from '../../../../core/context/scope.model';
import { accountSettingsView } from '../../application/account-settings-view';
import { AccountSecurityPanel } from './account-security-panel';

for (const authorized of [true, false]) {
  it(`presents neutral unreported states with authorized navigation=${authorized}`, async () => {
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideRouter([])],
    });
    const view = accountSettingsView(
      { kind: 'owner', userId: 'o', email: null, companyId: companyId('c') },
      { status: 'loading' },
      { status: 'loading' },
    );
    const fixture = TestBed.createComponent(AccountSecurityPanel);
    fixture.componentRef.setInput('rows', view?.security);
    fixture.componentRef.setInput('securityLink', authorized);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('[data-security-status="not-reported"]')).toHaveLength(3);
    expect(element.querySelectorAll('.account-security__explanation')).toHaveLength(1);
    expect(element.textContent).toContain(en.settings.account.securitySessionNote);
    expect(element.textContent).not.toMatch(/Enabled|Configured|Not configured|Not available/);
    expect(element.querySelector('form,input,button')).toBeNull();
    expect(Boolean(element.querySelector('a[href="/settings/security"]'))).toBe(authorized);
    expect(
      element.querySelector('a')?.classList.contains('nw-button--outline') ?? !authorized,
    ).toBe(true);
  });
}
