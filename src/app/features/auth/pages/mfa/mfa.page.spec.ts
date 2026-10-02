import { TestBed } from '@angular/core/testing';
import en from '../../../../../i18n/en.json';
import { MfaMethod } from '../../../../core/auth/auth.model';
import { configureAuthPage, fail, settle, text, type } from '../../testing/auth-testing';
import { MfaPage } from './mfa.page';

async function render(methods: readonly MfaMethod[] = ['totp', 'passkey']) {
  const setup = configureAuthPage(MfaPage);
  setup.gateway.methods = methods;
  await setup.flow.signIn('owner@x.invalid', 'secret');
  const fixture = TestBed.createComponent(MfaPage);
  await settle(fixture);
  const page = fixture.nativeElement as HTMLElement;
  const code = () => page.querySelector<HTMLInputElement>('input[name="totp"]');
  const submit = async () => {
    await settle(fixture); // what was typed has rendered, as between a user's keystrokes and Enter
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  const links = () => Array.from(page.querySelectorAll('.mfa__link')).map((l) => text(l));
  return { ...setup, fixture, page, code, submit, links };
}

describe('MfaPage', () => {
  it('asks for an authenticator code in one free-length field, with no "send code" action', async () => {
    const { page, code } = await render();
    expect(text(page.querySelector('h1'))).toBe(en.auth.mfa.title);
    expect(code()?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code()?.getAttribute('inputmode')).toBe('numeric');
    expect(code()?.hasAttribute('maxlength')).toBe(false);
    expect(page.querySelectorAll('input').length).toBe(1);
    expect(page.textContent?.toLowerCase()).not.toContain('send');
  });

  it('links to the passkey only when Core offered it', async () => {
    const both = await render();
    expect(both.links()).toEqual([en.auth.mfa.usePasskey, en.auth.mfa.backToSignIn]);
    TestBed.resetTestingModule();
    const totpOnly = await render(['totp']);
    expect(totpOnly.links()).toEqual([en.auth.mfa.backToSignIn]);
  });

  it('requires a code, then clears a refused one and says so in the field', async () => {
    const { page, code, submit, gateway } = await render();
    await submit();
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(en.auth.mfa.codeRequired);
    gateway.verifyAnswer = fail({ kind: 'unauthenticated', status: 401 });
    type(code(), '000000');
    await submit();
    expect(text(page.querySelector('.nw-form-field__error'))).toBe(en.auth.mfa.codeInvalid);
    expect(code()?.value).toBe('');
    expect(code()?.getAttribute('aria-invalid')).toBe('true');
  });

  it('replaces the form when the verification must restart', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.verifyAnswer = fail({ kind: 'not_found', status: 404 });
    type(code(), '123456');
    await submit();
    expect(text(page.querySelector('h1'))).toBe(en.auth.mfa.expiredTitle);
    expect(page.querySelector('form')).toBeNull();
    expect(text(page.querySelector('button'))).toBe(en.auth.mfa.backToSignIn);
  });

  it('switches to the passkey and waits for the browser’s prompt, drawing none of its own', async () => {
    const { fixture, page, links } = await render();
    page.querySelector<HTMLButtonElement>('.mfa__link')?.click();
    await settle(fixture);
    expect(links()).toEqual([en.auth.mfa.useTotp, en.auth.mfa.backToSignIn]);
    expect(text(page.querySelector('.mfa__text'))).toBe(en.auth.mfa.passkeyText);
    page.querySelector<HTMLButtonElement>('button[nw-button]')?.click();
    await settle(fixture);
    expect(text(page.querySelector('.mfa__waiting-title'))).toBe(en.auth.mfa.passkeyWaiting);
    expect(page.querySelector('[role="dialog"]')).toBeNull();
  });
});
