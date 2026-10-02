import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import en from '../../../../../i18n/en.json';
import { configureAuthPage, fail, settle, text, type } from '../../testing/auth-testing';
import { SignInPage } from './sign-in.page';

async function render(query: Record<string, string> = {}) {
  const setup = configureAuthPage(SignInPage, query);
  const fixture = TestBed.createComponent(SignInPage);
  await settle(fixture);
  const page = fixture.nativeElement as HTMLElement;
  const email = () => page.querySelector<HTMLInputElement>('input[type="email"]');
  const password = () => page.querySelector<HTMLInputElement>('input[name="password"]');
  const submit = async () => {
    await settle(fixture); // what was typed has rendered, as between a user's keystrokes and Enter
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  return { ...setup, fixture, page, email, password, submit };
}

describe('SignInPage', () => {
  it('has one heading, labelled fields with sign-in autocomplete, and no banner by default', async () => {
    const { page, email, password } = await render();
    expect(page.querySelectorAll('h1').length).toBe(1);
    expect(text(page.querySelector('h1'))).toBe(en.auth.signIn.title);
    expect(email()?.getAttribute('autocomplete')).toBe('username');
    expect(email()?.getAttribute('dir')).toBe('ltr');
    expect(password()?.getAttribute('autocomplete')).toBe('current-password');
    expect(page.querySelector(`label[for="${email()?.id}"]`)).not.toBeNull();
    expect(page.querySelector('nw-inline-alert')).toBeNull();
  });

  it('checks empty and malformed fields on the client, linked to the fields', async () => {
    const { page, email, submit, navigations } = await render();
    await submit();
    expect(email()?.getAttribute('aria-invalid')).toBe('true');
    expect(text(page.querySelector(`#${email()?.getAttribute('aria-describedby')}`))).toBe(
      en.auth.signIn.errors.emailRequired,
    );
    expect(page.textContent).toContain(en.auth.signIn.errors.passwordRequired);
    type(email(), 'owner@');
    await submit();
    expect(page.textContent).toContain(en.auth.signIn.errors.emailFormat);
    expect(navigations).toEqual([]);
  });

  it('toggles the password visibility with a pressed state and a changing label', async () => {
    const { fixture, page, password } = await render();
    const toggle = page.querySelector<HTMLButtonElement>('.sign-in__toggle');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    expect(toggle?.getAttribute('aria-label')).toBe(en.auth.signIn.showPassword);
    expect(toggle?.getAttribute('aria-controls')).toBe(password()?.id);
    toggle?.click();
    await settle(fixture);
    expect(password()?.type).toBe('text');
    expect(toggle?.getAttribute('aria-label')).toBe(en.auth.signIn.hidePassword);
  });

  it('clears the password and keeps the email after a refused attempt', async () => {
    const { page, email, password, submit, gateway } = await render();
    gateway.loginAnswer = fail({ kind: 'unauthenticated', status: 401 });
    type(email(), 'owner@x.invalid');
    type(password(), 'wrong');
    await submit();
    const alert = page.querySelector('nw-inline-alert');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(text(alert)).toBe(en.auth.banner.failed);
    expect(email()?.value).toBe('owner@x.invalid');
    expect(password()?.value).toBe('');
  });

  it('offers "Try again" when sign-in is unavailable, keeping what was typed', async () => {
    const { page, email, password, submit, gateway, navigations } = await render();
    gateway.loginAnswer = fail({ kind: 'unavailable', status: 503 });
    type(email(), 'owner@x.invalid');
    type(password(), 'secret');
    await submit();
    expect(text(page.querySelector('nw-inline-alert .nw-inline-alert__message'))).toBe(
      en.auth.banner.unavailable,
    );
    expect(password()?.value).toBe('secret');
    gateway.loginAnswer = null;
    page.querySelector<HTMLButtonElement>('.nw-inline-alert__action')?.click();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(navigations).toEqual(['/login/verify']);
  });

  it.each([
    [{ reason: 'signed-out' }, en.auth.banner.signedOut, 'status'],
    [{ reason: 'session-expired' }, en.auth.banner.sessionExpired, 'status'],
    [{ reason: 'shift-ended' }, en.auth.banner.shiftEnded, 'status'],
    [{ returnUrl: '/platforms' }, en.auth.banner.returnTo, 'status'],
  ])('explains why it was opened: %o', async (query, message, role) => {
    const { page } = await render(query);
    const alert = page.querySelector('nw-inline-alert');
    expect(text(alert)).toBe(message);
    expect(alert?.getAttribute('role')).toBe(role);
  });

  it('keeps the working-code and recovery entries, unavailable and saying why', async () => {
    const { page } = await render();
    const entries = [
      [
        page.querySelector('.sign-in__working-code'),
        en.auth.signIn.workingCode,
        en.auth.signIn.workingCodeUnavailable,
      ],
      [
        page.querySelector('.sign-in__link'),
        en.auth.signIn.recover,
        en.auth.signIn.recoverUnavailable,
      ],
    ] as const;
    for (const [button, label, note] of entries) {
      expect(button?.tagName).toBe('BUTTON');
      expect(text(button)).toBe(label);
      expect(button?.getAttribute('aria-disabled')).toBe('true');
      expect(text(page.querySelector(`#${button?.getAttribute('aria-describedby')}`))).toBe(note);
    }
  });

  it('does nothing when an unavailable entry is activated, and keeps it reachable by keyboard', async () => {
    const { fixture, page, navigations, gateway } = await render();
    let logins = 0;
    const login = gateway.login.bind(gateway);
    gateway.login = () => {
      logins++;
      return login();
    };
    for (const selector of ['.sign-in__working-code', '.sign-in__link']) {
      const button = page.querySelector<HTMLButtonElement>(selector);
      expect(button?.type).toBe('button'); // never submits the sign-in form
      expect(button?.closest('form')).toBeNull();
      expect(button?.disabled).toBe(false); // focusable, announced as unavailable
      expect(button?.hasAttribute('href')).toBe(false);
      const note = page.querySelector(`#${button?.getAttribute('aria-describedby')}`);
      expect(note?.getAttribute('role')).toBe('tooltip');
      button?.focus();
      expect(document.activeElement).toBe(button);
      button?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      button?.click(); // what Enter and Space do on a native button
      await settle(fixture);
    }
    expect(navigations).toEqual([]);
    expect(logins).toBe(0);
    expect(page.querySelector('nw-inline-alert')).toBeNull();
    expect(text(page.querySelector('h1'))).toBe(en.auth.signIn.title);
  });

  it('shows enrollment and recovery as their own states, not as errors', async () => {
    const { page, email, password, submit, gateway, navigations } = await render();
    type(email(), 'owner@x.invalid');
    type(password(), 'secret');
    gateway.loginAnswer = of({ kind: 'enrollment_required' });
    await submit();
    const alert = page.querySelector('nw-inline-alert');
    expect(text(alert)).toBe(en.auth.banner.enrollmentRequired);
    expect(alert?.getAttribute('role')).toBe('status');
    gateway.loginAnswer = of({ kind: 'recovery_required' });
    await submit();
    expect(text(page.querySelector('nw-inline-alert'))).toBe(en.auth.banner.recoveryRequired);
    expect(navigations).toEqual([]);
  });

  it('shows no return banner for an unsafe return URL', async () => {
    const { page } = await render({ returnUrl: 'https://evil.example' });
    expect(page.querySelector('nw-inline-alert')).toBeNull();
  });
});
