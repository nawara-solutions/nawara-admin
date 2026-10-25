import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import {
  DEMO_NEW_AUTHENTICATOR_CODE,
  DEMO_OWNER_ACCOUNT,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
} from '../../../core/auth/auth.fixtures';
import { DemoAuthState, FACTOR_ENROLLMENT_LIMIT } from '../../../core/auth/auth.mock-state';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway, UnavailableStepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { LocaleService } from '../../../core/i18n/locale.service';
import { DEMO_BINDINGS } from '../../../demo/demo-bindings';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { AccountSecurityFacade } from '../application/account-security.facade';
import { AddAuthenticatorFacade } from '../application/add-authenticator.facade';
import {
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from '../data-access/account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  AccountSecurityDemoScenario,
  MockAccountSecurityGateway,
} from '../data-access/account-security.mock';
import { ADD_AUTHENTICATOR_BANNER_ID, AddAuthenticatorPage } from './add-authenticator.page';

const t = en.settings.security.add;
const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ACCOUNT.identity.userId,
  email: DEMO_OWNER_ACCOUNT.identity.email,
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.school,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID],
};

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function render(
  actor: Actor = owner,
  {
    build = 'demo',
    scenario = 'normal',
    langs = { en },
    passkeyOnly = false,
  }: {
    build?: 'demo' | 'production';
    scenario?: AccountSecurityDemoScenario;
    langs?: Record<string, Translation>;
    passkeyOnly?: boolean;
  } = {},
) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  const demo = build === 'demo';
  TestBed.configureTestingModule({
    imports: [
      AddAuthenticatorPage,
      TranslocoTestingModule.forRoot({
        langs,
        translocoConfig: {
          availableLangs: Object.keys(langs),
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        // `production` binds the unavailable adapters, as a production build does; the demo session (which only a demo
        // build can establish) is kept so that the page can be rendered at all.
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO_BINDINGS } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
      {
        provide: AccountSecurityGateway,
        useClass: demo ? MockAccountSecurityGateway : UnavailableAccountSecurityGateway,
      },
      { provide: StepUpGateway, useClass: demo ? MockStepUpGateway : UnavailableStepUpGateway },
      AccountSecurityFacade,
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  TestBed.inject(AuthSession).establish(actor);
  auth.signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: null,
  });
  if (passkeyOnly)
    auth.ownerFactors.set(
      owner.userId,
      (auth.ownerFactors.get(owner.userId) ?? []).filter((f) => f.type === 'webauthn'),
    );
  const router = TestBed.inject(Router);
  const navigations: { url: string; extras: unknown }[] = [];
  vi.spyOn(router, 'navigateByUrl').mockImplementation((url, extras) => {
    navigations.push({ url: url.toString(), extras });
    return Promise.resolve(true);
  });
  const security = TestBed.inject(AccountSecurityGateway);
  const spies = {
    load: vi.spyOn(security, 'load'),
    begin: vi.spyOn(security, 'beginTotp'),
    confirm: vi.spyOn(security, 'confirmTotp'),
    stepUp: vi.spyOn(TestBed.inject(StepUpGateway), 'obtain'),
    issued: vi.spyOn(auth, 'issueStepUp'),
  };
  const fixture = TestBed.createComponent(AddAuthenticatorPage);
  const element = fixture.nativeElement as HTMLElement;
  const flow = fixture.debugElement.injector.get(AddAuthenticatorFacade);
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const field = (name: string) => element.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const type = async (name: string, value: string) => {
    const input = field(name);
    if (!input) throw new Error(`no ${name} field`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  };
  const factors = () => auth.ownerFactors.get(owner.userId) ?? [];
  await settle();
  return { fixture, element, flow, settle, field, type, submit, navigations, spies, auth, factors };
}

describe('Add an authenticator app page (P9-S4b)', { timeout: 20_000 }, () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('end to end in the demo: scan, the new app’s code, confirm it’s you, back on Security with the factor confirmed', async () => {
    const { element, type, submit, navigations, spies, factors, settle } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.title);
    const qr = element.querySelector('.nw-totp-setup__qr');
    expect(qr?.getAttribute('role')).toBe('img');
    expect(qr?.getAttribute('aria-label')).toBe(t.setup.qrLabel);
    expect(element.querySelector('.nw-totp-setup__key-value')?.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('[aria-current="step"]')?.textContent).toContain(t.steps.code);
    expect(text(element.querySelector('[data-demo-note]'))).toContain(DEMO_NEW_AUTHENTICATOR_CODE);
    const pending = factors().find((f) => !f.confirmed);
    expect(pending).toBeDefined();

    await type('new-authenticator-code', DEMO_NEW_AUTHENTICATOR_CODE);
    await submit();
    expect(text(element.querySelector('h2'))).toContain(t.verifyTitle);
    expect(document.activeElement?.id).toBe('add-authenticator-verify');
    expect(element.querySelector('[aria-current="step"]')?.textContent).toContain(t.steps.verify);
    expect(spies.confirm).not.toHaveBeenCalled();
    expect(text(element.querySelector('[data-demo-note]'))).toContain(DEMO_TOTP_CODE);

    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
    expect(spies.stepUp).toHaveBeenCalledWith('owner.factor.enroll', {
      method: 'totp',
      code: DEMO_TOTP_CODE,
    });
    expect(spies.confirm).toHaveBeenCalledTimes(1);
    expect(factors().find((f) => f.id === pending?.id)?.confirmed).toBe(true);
    expect(navigations).toEqual([{ url: '/settings/security', extras: { replaceUrl: true } }]);
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBe('added');
  });

  it('a wrong new code (the existing factor’s) is refused; the next code is confirmed with the same, unspent grant', async () => {
    const { element, type, submit, spies, field, settle, navigations } = await render();
    await type('new-authenticator-code', DEMO_TOTP_CODE);
    await submit();
    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
    const banner = element.querySelector(`#${ADD_AUTHENTICATOR_BANNER_ID}`);
    expect(banner?.getAttribute('data-banner')).toBe('codeRefused');
    expect(text(banner)).toContain(t.codeRefused);
    expect(text(banner)).toContain(t.codeRefusedGrantKept);
    expect(banner?.getAttribute('role')).toBe('alert');
    const input = field('new-authenticator-code');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-describedby')).toContain(ADD_AUTHENTICATOR_BANNER_ID);
    expect(input?.value).toBe('');
    expect(document.activeElement).toBe(input);
    await type('new-authenticator-code', DEMO_NEW_AUTHENTICATOR_CODE);
    await submit();
    await settle(30);
    expect(spies.stepUp).toHaveBeenCalledTimes(1);
    expect(spies.confirm).toHaveBeenCalledTimes(2);
    expect(navigations.map((n) => n.url)).toEqual(['/settings/security']);
  });

  it('says a code must be six digits before anything is sent', async () => {
    const { element, type, submit, spies } = await render();
    await type('new-authenticator-code', '12');
    await submit();
    expect(text(element)).toContain(t.codeFormat);
    expect(spies.stepUp).not.toHaveBeenCalled();
    expect(spies.confirm).not.toHaveBeenCalled();
  });

  it('a passkey-only owner is told why, and no setup is begun', async () => {
    const { element, spies, factors } = await render(owner, { passkeyOnly: true });
    expect(element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'noAuthenticator',
    );
    expect(text(element)).toContain(t.messages.noAuthenticatorDescription);
    expect(spies.begin).not.toHaveBeenCalled();
    expect(factors().every((f) => f.confirmed)).toBe(true);
    expect(element.querySelector('input')).toBeNull();
  });

  it('refuses an operator without any request', async () => {
    const { element, spies } = await render(operator);
    expect(element.querySelector('[data-message]')?.getAttribute('data-message')).toBe('refused');
    expect(spies.load).not.toHaveBeenCalled();
    expect(spies.begin).not.toHaveBeenCalled();
  });

  it('with the production (unavailable) adapters, adding is not available: no setup, no demo code', async () => {
    const { element, spies } = await render(owner, { build: 'production' });
    expect(element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'notInBuild',
    );
    expect(spies.begin).not.toHaveBeenCalled();
    expect(element.querySelector('[data-demo-note]')).toBeNull();
    expect(element.textContent).not.toContain(DEMO_NEW_AUTHENTICATOR_CODE);
  });

  it('cancel drops the setup, goes back to Security with a notice, and leaves Core’s unfinished factor', async () => {
    const { element, flow, navigations, factors, settle } = await render();
    element.querySelector<HTMLButtonElement>('[data-cancel]')?.click();
    await settle();
    expect(flow.setup()).toBeNull();
    expect(navigations).toEqual([{ url: '/settings/security', extras: { replaceUrl: true } }]);
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBe('cancelled');
    expect(factors().filter((f) => !f.confirmed)).toHaveLength(1);
    expect(factors().filter((f) => f.confirmed)).toHaveLength(2);
  });

  it('leaving the page disposes the setup key and codes', async () => {
    const { fixture, flow, type } = await render();
    await type('new-authenticator-code', DEMO_NEW_AUTHENTICATOR_CODE);
    expect(flow.setup()).not.toBeNull();
    fixture.destroy();
    expect(flow.setup()).toBeNull();
    expect(flow.state()).toEqual({ phase: 'idle' });
  });

  it('a lost answer is reconciled from the list, never resent: applied → success', async () => {
    const { type, submit, spies, settle, navigations } = await render(owner, {
      scenario: 'confirmLost',
    });
    await type('new-authenticator-code', DEMO_NEW_AUTHENTICATOR_CODE);
    await submit();
    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
    expect(spies.confirm).toHaveBeenCalledTimes(1);
    expect(spies.load).toHaveBeenCalledTimes(2);
    expect(navigations.map((n) => n.url)).toEqual(['/settings/security']);
  });

  it('a throttled begin asks to wait, with a manual Try again only', async () => {
    const setUp = await render();
    // Use up Core's hourly budget, then enter the page again.
    for (let i = 1; i < FACTOR_ENROLLMENT_LIMIT.requests; i++)
      setUp.auth.takeFactorEnrollmentRequest(owner.userId, Date.now());
    setUp.fixture.destroy();
    const fixture = TestBed.createComponent(AddAuthenticatorPage);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'beginRateLimited',
    );
    const begins = setUp.spies.begin.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(setUp.spies.begin.mock.calls.length).toBe(begins);
    expect(text(element)).toContain(t.retry);
  });

  it('never puts the key, the URI, a code or the grant in storage, history, the URL, the console or a toast', async () => {
    const watched = {
      local: vi.spyOn(Storage.prototype, 'setItem'),
      push: vi.spyOn(history, 'pushState'),
      replace: vi.spyOn(history, 'replaceState'),
      log: vi.spyOn(console, 'log'),
      info: vi.spyOn(console, 'info'),
      warn: vi.spyOn(console, 'warn'),
      error: vi.spyOn(console, 'error'),
      debug: vi.spyOn(console, 'debug'),
    };
    const { element, type, submit, settle, navigations, spies } = await render();
    await type('new-authenticator-code', DEMO_TOTP_CODE);
    await submit();
    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
    await type('new-authenticator-code', DEMO_NEW_AUTHENTICATOR_CODE);
    await submit();
    await settle(30);
    const grants = spies.issued.mock.results.map((r) => String(r.value));
    expect(grants).toHaveLength(1);
    const secrets = [
      DEMO_TOTP_SECRET,
      'otpauth',
      DEMO_NEW_AUTHENTICATOR_CODE,
      DEMO_TOTP_CODE,
      'demo-step-up-',
      ...grants,
    ];
    const recorded = JSON.stringify([
      ...Object.values(watched).map((spy) => spy.mock.calls),
      navigations,
      TestBed.inject(Router).url,
      history.state,
    ]);
    for (const secret of secrets) expect(recorded).not.toContain(secret);
    // after success the page holds nothing of the setup
    expect(element.textContent).not.toContain(DEMO_TOTP_SECRET.slice(0, 8));
    expect(element.querySelector('input')?.value ?? '').toBe('');
  });

  it('in Arabic: translated, right to left, the key and codes left to right', async () => {
    const { element, settle } = await render(owner, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(element.querySelector('h1'))).toBe(ar.settings.security.add.title);
    expect(element.querySelector('.nw-totp-setup__key-value')?.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('input[name="new-authenticator-code"]')?.getAttribute('dir')).toBe(
      'ltr',
    );
  });
});
