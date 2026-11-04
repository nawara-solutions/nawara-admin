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

describe('Profile Option 1 presentation', () => {
  it('renders exactly the supplied fields as semantic static tiles, with a separate read-only note', async () => {
    TestBed.configureTestingModule({ imports: [translations()] });
    const fixture = TestBed.createComponent(AccountProfilePanel);
    fixture.componentRef.setInput('rows', view?.profile);
    fixture.detectChanges();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('dl dt')).toHaveLength(3);
    expect(element.querySelectorAll('.account-info-row--tile')).toHaveLength(3);
    expect(element.querySelector('[data-fact="display-name"]')?.textContent).toContain(
      'Actual supplied name',
    );
    expect(element.querySelector('[data-fact="email"] bdi')?.textContent).toBe(
      view?.identity.email,
    );
    expect(element.querySelector('[data-fact="phone"]')?.textContent).toContain(
      en.settings.account.unavailable,
    );
    expect(element.querySelector('.account-profile__note')?.textContent).toContain(
      en.settings.account.source,
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
