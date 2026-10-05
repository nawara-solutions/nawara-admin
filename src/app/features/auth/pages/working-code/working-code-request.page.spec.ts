import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import en from '../../../../../i18n/en.json';
import { configureAuthPage, fail, settle, text, type } from '../../testing/auth-testing';
import { WorkingCodeRequestPage } from './working-code-request.page';

async function render(query: Record<string, string> = {}) {
  const setup = configureAuthPage(WorkingCodeRequestPage, query);
  const fixture = TestBed.createComponent(WorkingCodeRequestPage);
  await settle(fixture);
  const page = fixture.nativeElement as HTMLElement;
  const field = () => page.querySelector<HTMLInputElement>('input[name="username"]');
  const submit = async () => {
    await settle(fixture);
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  return { ...setup, fixture, page, field, submit };
}

describe('WorkingCodeRequestPage', () => {
  it('has one heading, a labelled left-to-right field, and no field focused on arrival', async () => {
    const { page, field } = await render();
    expect(page.querySelectorAll('h1').length).toBe(1);
    expect(text(page.querySelector('h1'))).toBe(en.auth.workingCode.requestTitle);
    expect(page.querySelector(`label[for="${field()?.id}"]`)?.textContent).toContain(
      en.auth.workingCode.identifier,
    );
    expect(field()?.getAttribute('dir')).toBe('ltr');
    expect(field()?.getAttribute('autocomplete')).toBe('username');
    expect(field()?.hasAttribute('autofocus')).toBe(false);
    expect(document.activeElement).not.toBe(field());
  });

  it('checks the identifier with Core’s rules before asking Core', async () => {
    const { page, field, submit, gateway, navigations } = await render();
    await submit();
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(
      en.auth.workingCode.identifierRequired,
    );
    type(field(), 'operator@demo');
    await submit();
    expect(field()?.getAttribute('aria-invalid')).toBe('true');
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(
      en.auth.workingCode.identifierInvalid,
    );
    type(field(), '000 000');
    await submit();
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(
      en.auth.workingCode.identifierInvalid,
    );
    expect(gateway.codeCalls).toEqual([]);
    expect(navigations).toEqual([]);
  });

  it('sends a phone number normalized as Core does, then opens the verify page', async () => {
    const { field, submit, gateway, navigations } = await render();
    type(field(), '+999 (0000) 0001');
    await submit();
    expect(gateway.codeCalls).toEqual([{ identifier: { kind: 'phone', phone: '+99900000001' } }]);
    expect(navigations).toEqual(['/login/code/verify']);
  });

  it('shows a rate limit without a countdown and keeps the field editable', async () => {
    const { page, field, submit, gateway } = await render();
    gateway.requestCodeAnswer = fail({ kind: 'rate_limited', status: 429 });
    type(field(), 'operator@demo.nawara.invalid');
    await submit();
    const alert = page.querySelector('nw-inline-alert');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(text(alert)).toBe(en.auth.workingCode.requestRateLimited);
    expect(field()?.readOnly).toBe(false);
    expect(field()?.value).toBe('operator@demo.nawara.invalid');
  });

  it('offers "Try again" when the service is unavailable', async () => {
    const { page, field, submit, gateway, navigations } = await render();
    gateway.requestCodeAnswer = fail({ kind: 'unavailable', status: 503 });
    type(field(), 'operator@demo.nawara.invalid');
    await submit();
    expect(text(page.querySelector('.nw-inline-alert__message'))).toBe(en.auth.banner.unavailable);
    gateway.requestCodeAnswer = new Observable<void>((s) => {
      s.next();
      s.complete();
    });
    page.querySelector<HTMLButtonElement>('.nw-inline-alert__action')?.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(navigations).toEqual(['/login/code/verify']);
  });

  it('blocks a second request while one is pending', async () => {
    const { fixture, page, field, submit, gateway } = await render();
    gateway.requestCodeAnswer = new Observable<void>(() => undefined);
    type(field(), 'operator@demo.nawara.invalid');
    await submit();
    await submit();
    await settle(fixture);
    expect(gateway.codeCalls.length).toBe(1);
    expect(field()?.readOnly).toBe(true);
    expect(page.querySelector('button[type="submit"]')?.getAttribute('aria-disabled')).toBe('true');
  });
});
