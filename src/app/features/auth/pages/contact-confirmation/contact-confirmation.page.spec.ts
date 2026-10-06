import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import en from '../../../../../i18n/en.json';
import { AuthSession } from '../../../../core/auth/auth-session';
import { configureAuthPage, fail, settle, text, type } from '../../testing/auth-testing';
import { ContactConfirmationPage } from './contact-confirmation.page';

const EMAIL = { kind: 'email', email: 'operator.new@demo.nawara.invalid' } as const;

async function render(query: Record<string, string> = {}) {
  const setup = configureAuthPage(ContactConfirmationPage, query);
  const fixture = TestBed.createComponent(ContactConfirmationPage);
  await settle(fixture);
  const page = fixture.nativeElement as HTMLElement;
  const identifier = () => page.querySelector<HTMLInputElement>('input[name="username"]');
  const code = () => page.querySelector<HTMLInputElement>('input[name="confirmation-code"]');
  const submit = async () => {
    await settle(fixture);
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  const fill = async (id: string, value: string) => {
    type(identifier(), id);
    type(code(), value);
    await submit();
  };
  return { ...setup, fixture, page, identifier, code, submit, fill };
}

describe('ContactConfirmationPage', () => {
  it('keeps a safe requested page on "Request a working code", and drops an unsafe one', async () => {
    for (const [returnUrl, href] of [
      ['/platforms/school', '/login/code?returnUrl=%2Fplatforms%2Fschool'],
      ['https://evil.example/', '/login/code'],
    ] as const) {
      TestBed.resetTestingModule();
      const { page, fill } = await render({ returnUrl });
      await fill('operator.new@demo.nawara.invalid', '005318');
      expect(page.querySelector('a[nw-button]')?.getAttribute('href')).toBe(href);
    }
  });

  it('asks for the identifier and the code: LTR text fields, nothing focused on arrival', async () => {
    const { page, identifier, code } = await render();
    expect(text(page.querySelector('h1'))).toBe(en.auth.contactConfirmation.title);
    for (const field of [identifier(), code()]) {
      expect(field?.getAttribute('type')).toBe('text');
      expect(field?.getAttribute('dir')).toBe('ltr');
      expect(document.activeElement).not.toBe(field);
    }
    expect(code()?.getAttribute('inputmode')).toBe('numeric');
    expect(code()?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(text(page.querySelector('.working-code__footnote'))).toBe(
      en.auth.contactConfirmation.note,
    );
  });

  it('checks both fields before asking Core, and sends the code as a string', async () => {
    const { page, gateway, fill } = await render();
    await fill('', '');
    expect(text(page)).toContain(en.auth.workingCode.identifierRequired);
    expect(text(page)).toContain(en.auth.contactConfirmation.codeRequired);
    await fill('operator.new@demo.nawara.invalid', '5318');
    expect(text(page)).toContain(en.auth.contactConfirmation.codeFormat);
    expect(gateway.confirmCalls).toEqual([]);
    await fill(' operator.new@demo.nawara.invalid ', '005 318');
    expect(gateway.confirmCalls).toEqual([{ identifier: EMAIL, code: '005318' }]);
  });

  it('on success offers "Request a working code" and opens no session', async () => {
    const { page, fill, navigations } = await render();
    await fill('operator.new@demo.nawara.invalid', '005318');
    const alert = page.querySelector('nw-inline-alert');
    expect(alert?.getAttribute('role')).toBe('status');
    expect(text(alert)).toBe(en.auth.contactConfirmation.confirmed);
    const link = page.querySelector<HTMLAnchorElement>('a[nw-button]');
    expect(text(link)).toBe(en.auth.contactConfirmation.requestWorkingCode);
    expect(link?.getAttribute('href')).toBe('/login/code');
    expect(page.querySelector('form')).toBeNull();
    expect(TestBed.inject(AuthSession).actor()).toBeNull();
    expect(navigations).toEqual([]);
  });

  it('shows one generic state for a refused code, clears the code and keeps the identifier', async () => {
    const { page, gateway, fill, identifier, code } = await render();
    gateway.confirmAnswer = fail({
      kind: 'unauthenticated',
      code: 'operator_code_invalid',
      status: 401,
    });
    await fill('operator.new@demo.nawara.invalid', '000000');
    expect(text(page.querySelector('nw-inline-alert'))).toBe(en.auth.contactConfirmation.invalid);
    expect(code()?.value).toBe('');
    expect(code()?.getAttribute('aria-invalid')).toBe('true');
    expect(identifier()?.value).toBe('operator.new@demo.nawara.invalid');
  });

  it('keeps the fields editable when rate limited, with no countdown', async () => {
    const { page, gateway, fill, identifier, code } = await render();
    gateway.confirmAnswer = fail({ kind: 'rate_limited', status: 429 });
    await fill('operator.new@demo.nawara.invalid', '005318');
    expect(text(page.querySelector('nw-inline-alert'))).toBe(en.auth.workingCode.verifyRateLimited);
    expect(identifier()?.readOnly).toBe(false);
    expect(code()?.readOnly).toBe(false);
    expect(code()?.value).toBe('005318');
  });

  it('retries an unavailable service with "Try again"', async () => {
    const { page, gateway, fill, fixture } = await render();
    gateway.confirmAnswer = fail({ kind: 'unavailable', status: 503 });
    await fill('operator.new@demo.nawara.invalid', '005318');
    expect(text(page.querySelector('nw-inline-alert'))).toContain(
      en.auth.contactConfirmation.unavailable,
    );
    const retry = [...page.querySelectorAll<HTMLButtonElement>('nw-inline-alert button')].find(
      (b) => text(b) === en.auth.banner.retry,
    );
    retry?.click();
    await settle(fixture);
    expect(gateway.confirmCalls).toHaveLength(2);
  });

  it('makes the fields read-only and the button busy while pending, one request at a time', async () => {
    const { page, gateway, identifier, code, submit } = await render();
    gateway.confirmAnswer = new Observable<void>(() => undefined);
    type(identifier(), 'operator.new@demo.nawara.invalid');
    type(code(), '005318');
    await submit();
    await submit();
    expect(gateway.confirmCalls).toHaveLength(1);
    expect(identifier()?.readOnly).toBe(true);
    expect(code()?.readOnly).toBe(true);
    const button = page.querySelector('button[type="submit"]');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(text(button)).toBe(en.auth.contactConfirmation.confirming);
  });
});
