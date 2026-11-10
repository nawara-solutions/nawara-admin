import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import ar from '../../../../../i18n/ar.json';
import { companyId } from '../../../../core/context/scope.model';
import { AccountSecurityInfo, accountSettingsView } from '../../application/account-settings-view';
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
    expect(element.querySelectorAll('.account-security__card')).toHaveLength(3);
    expect(element.querySelector('.account-security__summary, .account-security__row')).toBeNull();
    expect(
      [...element.querySelectorAll('.account-security__status')].map((status) =>
        status.textContent?.trim(),
      ),
    ).toEqual(Array(3).fill(en.settings.account.notReported));
    expect(Boolean(element.querySelector('.account-security__header a'))).toBe(authorized);
    expect(element.querySelectorAll('.account-security__explanation')).toHaveLength(1);
    expect(element.textContent).toContain(en.settings.account.securitySessionNote);
    expect(element.textContent).not.toMatch(/Enabled|Configured|Not configured|Not available/);
    expect(element.querySelector('form,input,button')).toBeNull();
    expect(Boolean(element.querySelector('a[href="/settings/security"]'))).toBe(authorized);
    expect(
      element.querySelector('a')?.classList.contains('nw-button--primary') ?? !authorized,
    ).toBe(true);
  });
}

// Presentation fixtures only: the real adapter still emits three unreported states.
const base =
  accountSettingsView(
    { kind: 'owner', userId: 'o', email: null, companyId: companyId('c') },
    { status: 'loading' },
    { status: 'loading' },
  )?.security ?? [];
async function render(rows: readonly AccountSecurityInfo[], language: 'en' | 'ar' = 'en') {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, ar },
        translocoConfig: { availableLangs: ['en', 'ar'], defaultLang: language },
        preloadLangs: true,
      }),
    ],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(AccountSecurityPanel);
  fixture.componentRef.setInput('rows', rows);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('Option B status presentation without new security reads', () => {
  const cases: readonly { status: AccountSecurityInfo['status']; label: string }[] = [
    { status: 'unknown', label: en.settings.account.securityStatus.unknown },
    { status: 'reported', label: en.settings.account.securityStatus.reported },
    { status: 'configured', label: en.settings.account.securityStatus.configured },
    { status: 'not-configured', label: en.settings.account.securityStatus.notConfigured },
    { status: 'enabled', label: en.settings.account.securityStatus.enabled },
    { status: 'disabled', label: en.settings.account.securityStatus.disabled },
    { status: 'unsupported', label: en.settings.account.securityStatus.unsupported },
    { status: 'unavailable', label: en.settings.account.unavailable },
  ];
  for (const { status, label } of cases) {
    it(`keeps ${status} distinct from unreported, without a misleading missing-information note`, async () => {
      const { element } = await render(
        base.map((row) => ({
          ...row,
          status,
          value: status === 'reported' && row.id === 'method' ? 'Password' : null,
        })),
      );
      expect(element.querySelectorAll(`[data-security-status="${status}"]`)).toHaveLength(3);
      expect(
        [...element.querySelectorAll('.account-security__status')].map((e) =>
          e.textContent?.trim(),
        ),
      ).toEqual([label, label, label]);
      expect(element.querySelector('.account-security__explanation')).toBeNull();
      if (status === 'reported')
        expect(element.querySelector('[data-fact="method"]')?.textContent).toContain('Password');
      expect(element.querySelector('input,button')).toBeNull();
    });
  }
  it('shows only the partial note for a known method, confirmed factor and unknown passkey', async () => {
    const mixed = base.map((row) =>
      row.id === 'method'
        ? { ...row, status: 'reported' as const, value: 'Password' }
        : row.id === 'second-factor'
          ? { ...row, status: 'configured' as const }
          : row,
    );
    const { fixture, element } = await render(mixed);
    expect(element.querySelectorAll('[data-security-status="not-reported"]')).toHaveLength(1);
    expect(element.textContent).toContain(en.settings.account.securityPartialNote);
    expect(element.textContent).not.toContain(en.settings.account.securitySessionNote);
    fixture.componentRef.setInput(
      'rows',
      mixed.map((row) => ({ ...row, status: 'configured' })),
    );
    fixture.detectChanges();
    expect(element.querySelector('.account-security__explanation')).toBeNull();
    fixture.componentRef.setInput('rows', base);
    fixture.detectChanges();
    expect(element.textContent).toContain(en.settings.account.securitySessionNote);
  });
  it('renders a confirmed passkey without claiming missing data for that card', async () => {
    const { element } = await render(
      base.map((row) => (row.id === 'passkey' ? { ...row, status: 'configured' } : row)),
    );
    expect(
      element.querySelector('[data-fact="passkey"]')?.getAttribute('data-security-status'),
    ).toBe('configured');
    expect(element.textContent).toContain(en.settings.account.securityPartialNote);
    expect(element.querySelector('[data-fact="passkey"]')?.textContent).not.toContain(
      en.settings.account.notReported,
    );
  });
  it('keeps Arabic labels and static cards accessible without tab stops', async () => {
    const { element } = await render(base, 'ar');
    element.dir = 'rtl';
    expect(element.querySelector('h3')?.textContent).toBe(ar.settings.account.securityTab);
    expect(element.querySelectorAll('article')).toHaveLength(3);
    expect(element.querySelectorAll('dl dt')).toHaveLength(3);
    expect(
      element.querySelectorAll(
        '.account-security__card [tabindex], .account-security__card a, .account-security__card button',
      ),
    ).toHaveLength(0);
    expect(element.textContent).toContain(ar.settings.account.notReported);
  });
});
