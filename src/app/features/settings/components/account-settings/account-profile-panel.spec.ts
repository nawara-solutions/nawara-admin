import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { companyId } from '../../../../core/context/scope.model';
import { accountSettingsView } from '../../application/account-settings-view';
import { AccountProfilePanel } from './account-profile-panel';
import { AccountIdentitySummary } from './account-identity-summary';

function translations() {
  return TranslocoTestingModule.forRoot({
    langs: { en },
    translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
    preloadLangs: true,
  });
}
const view = accountSettingsView(
  {
    kind: 'owner',
    userId: 'u',
    email: 'long.contact.'.repeat(20) + '@example.invalid',
    displayName: 'Actual supplied name',
    companyId: companyId('c'),
  },
  { status: 'loading' },
  { status: 'loading' },
);

describe('Compact Profile presentation', () => {
  it('omits summary facts and missing details, preserving supplied phone and one read-only note', async () => {
    TestBed.configureTestingModule({ imports: [translations()] });
    const fixture = TestBed.createComponent(AccountProfilePanel);
    fixture.componentRef.setInput('rows', view?.profile);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('dl dt')).toHaveLength(0);
    expect(
      element.querySelector('[data-fact="display-name"], [data-fact="email"], [data-fact="phone"]'),
    ).toBeNull();
    expect(element.querySelector('.account-profile__note')?.textContent).toContain(
      en.settings.account.readOnly,
    );
    fixture.componentRef.setInput('rows', [
      ...(view?.profile ?? []),
      { id: 'phone', label: 'settings.account.phone', value: '+99900000001', machine: true },
    ]);
    fixture.detectChanges();
    expect(element.querySelectorAll('dl dt')).toHaveLength(1);
    expect(element.querySelector('[data-fact="phone"] [dir="ltr"]')?.textContent).toBe(
      '+99900000001',
    );
    expect(element.querySelector('input,button,a,[tabindex]')).toBeNull();
  });
  for (const stacked of [false, true]) {
    it(`keeps the badge near Profile identity without changing stacked Access=${stacked}`, async () => {
      TestBed.configureTestingModule({ imports: [translations()] });
      const fixture = TestBed.createComponent(AccountIdentitySummary);
      fixture.componentRef.setInput('identity', view?.identity);
      fixture.componentRef.setInput('stacked', stacked);
      fixture.detectChanges();
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      expect(
        Boolean(element.querySelector('.account-summary__identity .account-summary__inline-role')),
      ).toBe(!stacked);
      expect(Boolean(element.querySelector('.account-summary__role'))).toBe(stacked);
      expect(Boolean(element.querySelector('.account-summary__contacts'))).toBe(stacked);
      expect(element.textContent).toContain(en.shell.role.owner);
      expect(element.querySelector('input,button,a,[tabindex]')).toBeNull();
    });
  }
});
