import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { AccountSettingsView } from '../../application/account-settings-view';
import { AccountAccessPanel } from './account-access-panel';

async function render(entries: AccountSettingsView['access']['entries']) {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(AccountAccessPanel);
  fixture.componentRef.setInput('access', {
    rows: [],
    entries,
    entryLabel: 'settings.account.platforms',
    emptyDescription: 'settings.account.noPlatforms',
    unavailableDescription: 'shell.nav.platformsUnavailable',
    note: null,
  });
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('account access presentation states', () => {
  it('announces loading without exposing a stale grant or retry action', async () => {
    const { element } = await render({ status: 'loading' });
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      en.shell.context.loading,
    );
    expect(element.querySelector('[data-platform],button')).toBeNull();
  });
  it('renders an honest empty assignment state', async () => {
    const { element } = await render({ status: 'empty' });
    expect(element.textContent).toContain(en.settings.account.noPlatforms);
    expect(element.querySelector('[data-platform]')).toBeNull();
  });
  for (const status of ['error', 'forbidden'] as const) {
    it(`offers only a read retry for ${status}`, async () => {
      const { element, fixture } = await render(
        status === 'error' ? { status, error: { kind: 'network', status: 0 } } : { status },
      );
      const retry = vi.fn();
      fixture.componentInstance.retry.subscribe(retry);
      element.querySelector('button')?.click();
      expect(retry).toHaveBeenCalledOnce();
      expect(element.querySelector('[data-platform],form,input')).toBeNull();
    });
  }
});

it('shows overview cards only for actual authorized access records', async () => {
  const { element } = await render({
    status: 'success',
    data: [{ id: 'a', name: 'Actual authorized context' }],
  });
  expect(element.querySelectorAll('[data-platform]')).toHaveLength(1);
  expect(element.querySelectorAll('.account-panel__cards article')).toHaveLength(1);
  expect(element.querySelector('.account-panel__cards')?.textContent).toContain(
    'Actual authorized context',
  );
  expect(element.querySelector('.account-panel__cards')?.textContent).not.toMatch(
    /Owner|Membership/,
  );
});
