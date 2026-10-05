import { TestBed } from '@angular/core/testing';
import { Observable } from 'rxjs';
import en from '../../../../../i18n/en.json';
import { platformId } from '../../../../core/context/scope.model';
import { configureAuthPage, fail, settle, text, type } from '../../testing/auth-testing';
import { WorkingCodeVerifyPage } from './working-code-verify.page';

const EMAIL = { kind: 'email', email: 'operator@demo.nawara.invalid' } as const;

async function render(options: { requested?: boolean } = {}) {
  const setup = configureAuthPage(WorkingCodeVerifyPage);
  if (options.requested !== false) {
    await setup.flow.requestWorkingCode('operator@demo.nawara.invalid', EMAIL);
    setup.navigations.length = 0;
  }
  const fixture = TestBed.createComponent(WorkingCodeVerifyPage);
  await settle(fixture);
  const page = fixture.nativeElement as HTMLElement;
  const code = () => page.querySelector<HTMLInputElement>('input[name="working-code"]');
  const submit = async () => {
    await settle(fixture);
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  const again = () =>
    [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
      text(b)?.includes(en.auth.workingCode.again),
    );
  return { ...setup, fixture, page, code, submit, again };
}

describe('WorkingCodeVerifyPage', () => {
  it('returns to the request page when no code was requested', async () => {
    const { navigations } = await render({ requested: false });
    expect(navigations).toEqual(['/login/code']);
  });

  it('says a code is sent only if the account is eligible, and shows the identifier', async () => {
    const { page } = await render();
    const notice = page.querySelector('nw-inline-alert');
    expect(notice?.getAttribute('role')).toBe('status');
    expect(text(notice)).toBe(en.auth.workingCode.requested);
    const shown = page.querySelector('adm-identity-row bdi');
    expect(text(shown)).toBe('operator@demo.nawara.invalid');
    expect(shown?.getAttribute('dir')).toBe('ltr');
  });

  it('has one code field: numeric keyboard, one-time-code autofill, not focused on arrival', async () => {
    const { code } = await render();
    expect(code()?.getAttribute('inputmode')).toBe('numeric');
    expect(code()?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code()?.getAttribute('dir')).toBe('ltr');
    expect(document.activeElement).not.toBe(code());
  });

  it('checks the 6 digits before asking Core, and sends the code as a string', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.codeCalls.length = 0;
    type(code(), '04291');
    await submit();
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(en.auth.workingCode.codeFormat);
    expect(gateway.codeCalls).toEqual([]);
    gateway.identity = { userId: 'op', email: EMAIL.email, phone: null, adminTier: 'operator' };
    gateway.grantsAnswer = { companyId: null, platformAssignments: [platformId('school')] };
    type(code(), '042 917');
    await submit();
    expect(gateway.codeCalls).toEqual([{ identifier: EMAIL, code: '042917' }]);
  });

  it('shows one generic message for a refused code, clears the field and ties it to the message', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.verifyCodeAnswer = fail({
      kind: 'unauthenticated',
      code: 'operator_code_invalid',
      status: 401,
    });
    type(code(), '111111');
    await submit();
    const alert = page.querySelector('nw-inline-alert');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(text(alert)).toBe(en.auth.workingCode.invalid);
    expect(code()?.value).toBe('');
    expect(code()?.getAttribute('aria-invalid')).toBe('true');
    expect(code()?.getAttribute('aria-describedby')?.split(' ')).toContain(alert?.id);
    expect(page.querySelector('.nw-form-field__error')).toBeNull();
  });

  it('keeps the field editable after too many attempts, without a countdown', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.verifyCodeAnswer = fail({ kind: 'rate_limited', status: 429 });
    type(code(), '111111');
    await submit();
    expect(text(page.querySelector('nw-inline-alert'))).toBe(en.auth.workingCode.verifyRateLimited);
    expect(code()?.readOnly).toBe(false);
    expect(page.textContent).not.toMatch(/\d+\s*(s|sec|min)/);
  });

  it('requests a new code, saying it replaces the previous one, and blocks a duplicate', async () => {
    const { fixture, page, again, gateway } = await render();
    expect(page.textContent).toContain(en.auth.workingCode.replaces);
    gateway.codeCalls.length = 0;
    gateway.requestCodeAnswer = new Observable<void>(() => undefined);
    again()?.click();
    await settle(fixture);
    again()?.click();
    await settle(fixture);
    expect(gateway.codeCalls.length).toBe(1);
    expect(text(page.querySelector('nw-inline-alert'))).toBe(en.auth.workingCode.requestingAgain);
    expect(page.querySelector('button[type="submit"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('retries the action that failed when the service was unavailable', async () => {
    const { fixture, page, again, gateway } = await render();
    gateway.codeCalls.length = 0;
    gateway.requestCodeAnswer = fail({ kind: 'unavailable', status: 503 });
    again()?.click();
    await settle(fixture);
    expect(text(page.querySelector('.nw-inline-alert__message'))).toBe(en.auth.banner.unavailable);
    page.querySelector<HTMLButtonElement>('.nw-inline-alert__action')?.click();
    await settle(fixture);
    expect(gateway.codeCalls.map((c) => c.code)).toEqual([undefined, undefined]);
  });

  it('goes back to change the identifier', async () => {
    const { fixture, page, navigations } = await render();
    [...page.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => text(b) === en.auth.workingCode.change)
      ?.click();
    await settle(fixture);
    expect(navigations).toEqual(['/login/code']);
  });
});
