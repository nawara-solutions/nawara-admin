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

it('displays each trusted access record once without an overview or editing controls', async () => {
  const { element } = await render({
    status: 'success',
    data: [{ id: 'a', name: 'Actual authorized context' }],
  });
  expect(element.querySelectorAll('[data-platform]')).toHaveLength(1);
  expect(element.textContent?.split('Actual authorized context')).toHaveLength(2);
  expect(element.querySelector('.account-panel__overview')).toBeNull();
  expect(element.querySelector('.account-panel__role')).toBeNull();
  expect(element.querySelector('input,form,button,a,[tabindex]')).toBeNull();
  expect(element.querySelector('dl > div > dt')).not.toBeNull();
  expect(element.querySelector('dl > div > dd')).not.toBeNull();
});

it('preserves multiple authorized platforms without inventing memberships or tenant branding', async () => {
  const { element } = await render({
    status: 'success',
    data: [
      { id: 'a', name: 'First platform' },
      { id: 'b', name: 'Second platform' },
    ],
  });
  expect(element.querySelectorAll('[data-platform]')).toHaveLength(2);
  expect(element.querySelectorAll('.account-panel__symbol nw-icon')).toHaveLength(2);
  expect(element.textContent).not.toContain('Membership');
});

it('uses the Solutions logo only for an explicitly identified company', async () => {
  const { element } = await render({
    status: 'success',
    data: [{ id: 'company', name: 'Nawara Solutions', brand: 'solutions' }],
  });
  expect(element.querySelectorAll('.account-panel__symbol nw-product-symbol')).toHaveLength(1);
  expect(element.textContent?.split('Nawara Solutions')).toHaveLength(2);
});
