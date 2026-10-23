import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of } from 'rxjs';
import { encode } from 'uqr';
import en from '../../../../../i18n/en.json';
import { TotpEnrollment } from '../../../../core/auth/auth.model';
import {
  TEST_ENROLLMENT,
  configureAuthPage,
  fail,
  settle,
  text,
  type,
} from '../../testing/auth-testing';
import { ENROLL_BANNER_ID, EnrollPage } from './enroll.page';

async function render(options: { enrolling?: boolean; begin?: Observable<TotpEnrollment> } = {}) {
  const setup = configureAuthPage(EnrollPage);
  if (options.begin) setup.gateway.beginEnrollmentAnswer = options.begin;
  if (options.enrolling !== false) {
    setup.gateway.loginAnswer = of({ kind: 'enrollment_required', enrollmentToken: 'enroll-1' });
    void setup.flow.signIn('owner@demo.nawara.invalid', 'secret');
  }
  const fixture = TestBed.createComponent(EnrollPage);
  await settle(fixture);
  setup.navigations.length = 0;
  const page = fixture.nativeElement as HTMLElement;
  const code = () => page.querySelector<HTMLInputElement>('input[name="authenticator-code"]');
  const button = (label: string) =>
    [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) => text(b) === label);
  const submit = async () => {
    await settle(fixture);
    page
      .querySelector<HTMLFormElement>('form')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(fixture);
  };
  const confirms = () => setup.gateway.enrollmentCalls.filter((c) => c.code !== undefined);
  return { ...setup, fixture, page, code, button, submit, confirms };
}

function useClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

describe('EnrollPage', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('says setup starts from sign-in when there is none on this page (a reload, a typed URL)', async () => {
    const { page, button, navigations, gateway } = await render({ enrolling: false });
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.noSetupTitle);
    expect(page.textContent).toContain(en.auth.enroll.staleEntry);
    expect(gateway.enrollmentCalls).toEqual([]);
    button(en.auth.enroll.goToSignIn)?.click();
    await Promise.resolve();
    expect(navigations).toEqual(['/login']);
  });

  it('shows the account, a QR code of the otpauth URI and the key in groups, as LTR machine values', async () => {
    const { page } = await render();
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.title);
    const account = page.querySelector('adm-identity-row');
    expect(account?.classList).toContain('identity-row--wrap');
    expect(text(account?.querySelector('bdi'))).toBe('owner@demo.nawara.invalid');
    const qr = page.querySelector('.enroll__qr');
    expect(qr?.getAttribute('role')).toBe('img');
    expect(qr?.getAttribute('aria-label')).toBe(en.auth.enroll.qrLabel);
    const { data } = encode(TEST_ENROLLMENT.otpauthUri, { ecc: 'M', border: 4 });
    expect(qr?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${data.length.toString()} ${data.length.toString()}`,
    );
    const modules = data.flat().filter(Boolean).length;
    expect(qr?.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(modules);
    const key = page.querySelector('.enroll__key-value');
    expect(text(key)).toBe('ABCD EFGH IJKL MNOP');
    expect(key?.getAttribute('dir')).toBe('ltr');
  });

  it('has one code field: numeric keyboard, one-time-code autofill, LTR', async () => {
    const { code } = await render();
    expect(code()?.getAttribute('inputmode')).toBe('numeric');
    expect(code()?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(code()?.getAttribute('dir')).toBe('ltr');
    expect(code()?.disabled).toBe(false);
  });

  it('shows the setup being prepared, with the code field disabled', async () => {
    const { page, code } = await render({ begin: new Observable<TotpEnrollment>() });
    const preparing = page.querySelector('.enroll__qr--preparing');
    expect(preparing?.getAttribute('role')).toBe('status');
    expect(text(preparing)).toBe(en.auth.enroll.preparing);
    expect(code()?.disabled).toBe(true);
  });

  it('copies the key without spaces and says so', async () => {
    const copied: string[] = [];
    useClipboard(async (value) => {
      copied.push(value);
    });
    const { page, button, fixture } = await render();
    button(en.auth.enroll.copyKey)?.click();
    await settle(fixture);
    expect(copied).toEqual([TEST_ENROLLMENT.secret]);
    const status = page.querySelector('.enroll__copy-status');
    expect(status?.getAttribute('role')).toBe('status');
    expect(text(status)).toBe(en.auth.enroll.copied);
  });

  it('says when the key could not be copied', async () => {
    useClipboard(() => Promise.reject(new Error('denied')));
    const { page, button, fixture } = await render();
    button(en.auth.enroll.copyKey)?.click();
    await settle(fixture);
    expect(text(page.querySelector('.enroll__copy-status--failed'))).toBe(
      en.auth.enroll.copyFailed,
    );
  });

  it('asks for a code before calling Core', async () => {
    const { page, submit, confirms } = await render();
    await submit();
    expect(page.textContent).toContain(en.auth.enroll.codeRequired);
    expect(confirms()).toEqual([]);
  });

  it('sends the code as a string and goes straight to the access check', async () => {
    const { code, submit, confirms, flow } = await render();
    type(code(), '012 345');
    await submit();
    expect(confirms()).toEqual([{ token: 'enroll-1', factorId: 'factor-1', code: '012345' }]);
    expect(flow.step()).toBe('resolved');
  });

  it('keeps the setup and the typed code after a wrong code, marking the field by the banner', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.confirmEnrollmentAnswer = fail({ kind: 'validation', messages: [], status: 400 });
    type(code(), '012345');
    await submit();
    const banner = page.querySelector(`#${ENROLL_BANNER_ID}`);
    expect(text(banner)).toContain(en.auth.enroll.codeInvalid);
    expect(code()?.getAttribute('aria-invalid')).toBe('true');
    expect(code()?.getAttribute('aria-describedby')).toContain(ENROLL_BANNER_ID);
    expect(code()?.value).toBe('012345');
    expect(page.querySelector('.enroll__qr svg')).not.toBeNull();
  });

  it('retries the same code against the same setup after an unavailable service', async () => {
    const { page, code, submit, gateway, button, fixture, confirms } = await render();
    gateway.confirmEnrollmentAnswer = fail({ kind: 'unavailable', status: 503 });
    type(code(), '123456');
    await submit();
    expect(text(page.querySelector('nw-inline-alert'))).toContain(en.auth.enroll.unavailable);
    gateway.confirmEnrollmentAnswer = of(undefined);
    button(en.auth.banner.retry)?.click();
    await settle(fixture);
    expect(confirms().map((c) => c.code)).toEqual(['123456', '123456']);
  });

  it.each([
    [{ kind: 'unauthenticated', status: 401 }, en.auth.enroll.expiredTitle],
    [
      { kind: 'forbidden', code: 'factor_already_enrolled', status: 403 },
      en.auth.enroll.alreadyTitle,
    ],
  ] as const)('ends the setup on %o', async (error, title) => {
    const { page, code, submit, gateway } = await render();
    gateway.confirmEnrollmentAnswer = fail(error);
    type(code(), '123456');
    await submit();
    expect(text(page.querySelector('h1'))).toBe(title);
    expect(page.querySelector('.enroll__qr')).toBeNull();
  });

  it('offers "Try again" when no setup could be begun, then shows it', async () => {
    const { page, button, fixture, gateway } = await render({
      begin: fail({ kind: 'unavailable', status: 503 }),
    });
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.beginUnavailableTitle);
    gateway.beginEnrollmentAnswer = of(TEST_ENROLLMENT);
    button(en.auth.banner.retry)?.click();
    await settle(fixture);
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.title);
    expect(gateway.enrollmentCalls).toEqual([{ token: 'enroll-1' }, { token: 'enroll-1' }]);
  });

  it('shows a 429 on begin as too many attempts, never as unavailable, with no countdown or automatic retry', async () => {
    const { page, button, fixture, gateway } = await render({
      begin: fail({ kind: 'rate_limited', status: 429 }),
    });
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.beginRateLimitedTitle);
    expect(page.textContent).not.toContain(en.auth.enroll.beginUnavailableTitle);
    expect(page.querySelector('[role="timer"]')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await settle(fixture);
    expect(gateway.enrollmentCalls).toEqual([{ token: 'enroll-1' }]);
    gateway.beginEnrollmentAnswer = of(TEST_ENROLLMENT);
    button(en.auth.banner.retry)?.click();
    await settle(fixture);
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.title);
    expect(gateway.enrollmentCalls).toEqual([{ token: 'enroll-1' }, { token: 'enroll-1' }]);
  });

  it('drops the setup and its key when the page is left', async () => {
    const { fixture, flow } = await render();
    expect(flow.totpEnrollment()).not.toBeNull();
    fixture.destroy();
    expect(flow.totpEnrollment()).toBeNull();
    expect(flow.enrollmentPending()).toBe(false);
  });
});

describe('EnrollPage: ends, retries and limits (A4-S4 remediation)', () => {
  it.each([
    [
      { kind: 'unauthenticated', code: 'verification_failed', status: 401 },
      en.auth.enroll.expiredTitle,
    ],
    [
      { kind: 'forbidden', code: 'factor_already_enrolled', status: 403 },
      en.auth.enroll.alreadyTitle,
    ],
  ] as const)(
    'ends the setup when beginning answers %o, without a key or a code field',
    async (error, title) => {
      const { page, button, flow } = await render({ begin: fail(error) });
      expect(text(page.querySelector('h1'))).toBe(title);
      expect(page.querySelector('.enroll__qr')).toBeNull();
      expect(page.querySelector('input[name="authenticator-code"]')).toBeNull();
      expect(button(en.auth.enroll.backToSignIn)).toBeDefined();
      expect(button(en.auth.banner.retry)).toBeUndefined();
      expect(flow.enrollmentPending()).toBe(false);
    },
  );

  it.each([
    [{ kind: 'rate_limited', status: 429 }, en.auth.enroll.beginRateLimitedTitle],
    [{ kind: 'unavailable', status: 503 }, en.auth.enroll.beginUnavailableTitle],
  ] as const)(
    'keeps the card with a busy "Try again" while a retry after %o is pending, one request at a time',
    async (error, title) => {
      const { page, fixture, gateway } = await render({ begin: fail(error) });
      const retry = () =>
        page.querySelector<HTMLButtonElement>('.enroll__actions button[nw-button]');
      const pending = new Subject<TotpEnrollment>();
      gateway.beginEnrollmentAnswer = pending;
      retry()?.click();
      await settle(fixture);
      expect(text(page.querySelector('h1'))).toBe(title);
      expect(retry()?.classList).toContain('nw-button--busy');
      expect(retry()?.getAttribute('aria-disabled')).toBe('true');
      expect(text(retry())).toBe(en.auth.enroll.preparing);
      retry()?.click();
      await settle(fixture);
      expect(gateway.enrollmentCalls).toEqual([{ token: 'enroll-1' }, { token: 'enroll-1' }]);
      pending.next(TEST_ENROLLMENT);
      pending.complete();
      await settle(fixture);
      expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.title);
      expect(page.querySelector('.enroll__qr svg')).not.toBeNull();
    },
  );

  it('shows a 429 on confirmation as a warning without a retry action, keeping the setup and the code', async () => {
    const { page, code, submit, gateway } = await render();
    gateway.confirmEnrollmentAnswer = fail({ kind: 'rate_limited', status: 429 });
    type(code(), '123456');
    await submit();
    const banner = page.querySelector('nw-inline-alert');
    expect(text(banner)).toContain(en.auth.enroll.rateLimited);
    expect(banner?.getAttribute('role')).toBe('alert');
    expect(banner?.querySelector('button')).toBeNull();
    expect(page.querySelector('[role="timer"]')).toBeNull();
    expect(code()?.value).toBe('123456');
    expect(code()?.readOnly).toBe(false);
    expect(code()?.getAttribute('aria-invalid')).not.toBe('true');
    expect(page.querySelector('.enroll__qr svg')).not.toBeNull();
    expect(text(page.querySelector('h1'))).toBe(en.auth.enroll.title);
  });
});
