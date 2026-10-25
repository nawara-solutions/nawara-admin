import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import {
  DEMO_OWNER_ACCOUNT,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
} from '../../../core/auth/auth.fixtures';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway, UnavailableStepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { LocaleService } from '../../../core/i18n/locale.service';
import { DEMO_BINDINGS } from '../../../demo/demo-bindings';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { AccountSecurityFacade } from '../application/account-security.facade';
import { ChangePasswordFacade } from '../application/change-password.facade';
import {
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from '../data-access/account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  AccountSecurityDemoScenario,
  MockAccountSecurityGateway,
} from '../data-access/account-security.mock';
import { PasswordPage } from './password.page';

const t = en.settings.security.password;
const NEW = 'a calm new passphrase';
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
      PasswordPage,
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
  auth.signedIn.set(
    auth.openSession(
      { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
      null,
    ),
  );
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
    change: vi.spyOn(security, 'changePassword'),
    stepUp: vi.spyOn(TestBed.inject(StepUpGateway), 'obtain'),
    issued: vi.spyOn(auth, 'issueStepUp'),
  };
  const fixture = TestBed.createComponent(PasswordPage);
  const element = fixture.nativeElement as HTMLElement;
  const flow = fixture.debugElement.injector.get(ChangePasswordFacade);
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
  const click = async (selector: string) => {
    element.querySelector<HTMLElement>(selector)?.click();
    await settle(30);
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(30);
  };
  /** The new password twice, Continue, the demo code, Change. */
  const changeTo = async (password = NEW) => {
    await type('new-password', password);
    await type('confirm-password', password);
    await submit();
    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
  };
  await settle();
  return {
    fixture,
    element,
    flow,
    settle,
    field,
    type,
    click,
    submit,
    changeTo,
    navigations,
    spies,
    auth,
  };
}

describe('Change your password page (P9-S4e)', { timeout: 20_000 }, () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers password-manager fields under the owner’s own identifier, left to right, paste allowed', async () => {
    const r = await render();
    expect(text(r.element.querySelector('h1'))).toBe(t.title);
    const username = r.field('username');
    expect(username?.value).toBe(owner.email);
    expect(username?.getAttribute('autocomplete')).toBe('username');
    expect(username?.readOnly).toBe(true);
    for (const name of ['new-password', 'confirm-password']) {
      const input = r.field(name);
      expect(input?.type).toBe('password');
      expect(input?.getAttribute('autocomplete')).toBe('new-password');
      expect(input?.getAttribute('dir')).toBe('ltr');
      expect(input?.getAttribute('spellcheck')).toBe('false');
      expect(input?.hasAttribute('maxlength')).toBe(false);
      const paste = new Event('paste', { cancelable: true });
      input?.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBe(false);
    }
    expect(r.field('new-password')?.getAttribute('passwordrules')).toBe(
      'minlength: 10; maxlength: 72;',
    );
    expect(r.element.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('checks only Core’s limits, live; Continue is unavailable (and says why) until they hold and both match', async () => {
    const r = await render();
    const met = () =>
      [...r.element.querySelectorAll('[data-rules] [data-met]')].map((li) =>
        li.getAttribute('data-met'),
      );
    const continueButton = () => r.element.querySelector('[data-continue]');
    expect(continueButton()?.getAttribute('aria-disabled')).toBe('true');
    expect(text(r.element.querySelector('#password-continue-hint'))).toBe(t.continueHint);
    await r.type('new-password', 'é'.repeat(37));
    expect(met()).toEqual(['true', 'false']);
    await r.type('new-password', `abcdefghij\u0000`);
    expect(r.element.querySelector('[data-rule="characters"]')).not.toBeNull();
    await r.type('new-password', NEW);
    expect(met()).toEqual(['true', 'true']);
    await r.type('confirm-password', `${NEW} `);
    expect(text(r.element)).toContain(t.mismatch);
    expect(r.field('confirm-password')?.getAttribute('aria-invalid')).toBe('true');
    expect(continueButton()?.getAttribute('aria-disabled')).toBe('true');
    await r.submit();
    expect(r.flow.state().phase).toBe('editing');
    await r.type('confirm-password', NEW);
    expect(continueButton()?.getAttribute('aria-disabled')).toBeNull();
    expect(r.element.querySelector('#password-continue-hint')).toBeNull();
    // no strength score: no meter of any kind
    expect(
      r.element.querySelector('meter, progress, [role="meter"], [role="progressbar"]'),
    ).toBeNull();
  });

  it('Show and Hide reveal each field on request only', async () => {
    const r = await render();
    const show = r.element.querySelector<HTMLButtonElement>('[data-show-new]');
    expect(show?.getAttribute('aria-pressed')).toBe('false');
    await r.click('[data-show-new]');
    expect(r.field('new-password')?.type).toBe('text');
    expect(r.field('confirm-password')?.type).toBe('password');
    expect(r.element.querySelector('[data-show-new]')?.getAttribute('aria-pressed')).toBe('true');
    await r.click('[data-show-confirm]');
    expect(r.field('confirm-password')?.type).toBe('text');
    await r.click('[data-show-new]');
    expect(r.field('new-password')?.type).toBe('password');
  });

  it('end to end: the password, confirm it’s you, changed; the new password signs in, the old one no longer; this session continues', async () => {
    const r = await render();
    await r.type('new-password', NEW);
    await r.type('confirm-password', NEW);
    await r.submit();
    expect(document.activeElement?.id).toBe('password-verify');
    expect(text(r.element.querySelector('[data-demo-note]'))).toContain(DEMO_TOTP_CODE);
    await r.type('step-up-code', DEMO_TOTP_CODE);
    await r.submit();
    await r.settle(30);
    expect(r.spies.stepUp).toHaveBeenCalledWith('owner.password.change', {
      method: 'totp',
      code: DEMO_TOTP_CODE,
    });
    expect(r.spies.change).toHaveBeenCalledTimes(1);
    expect(r.navigations).toEqual([{ url: '/settings/security', extras: { replaceUrl: true } }]);
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBe('passwordChanged');
    expect(await r.auth.passwordMatches(owner.userId, NEW)).toBe(true);
    expect(await r.auth.passwordMatches(owner.userId, DEMO_PASSWORD)).toBe(false);
    const current = r.auth.signedIn();
    expect(current !== null && !r.auth.sessionRevoked(current)).toBe(true);
    expect(r.element.querySelector('input[type="password"]')).toBeNull();
  });

  it('Back keeps what was typed; a refused proof submitted at once is cleared from its field', async () => {
    const r = await render();
    await r.type('new-password', NEW);
    await r.type('confirm-password', NEW);
    await r.submit();
    await r.click('[data-back]');
    expect(r.field('new-password')?.value).toBe(NEW);
    expect(r.field('confirm-password')?.value).toBe(NEW);
    await r.submit();
    const proof = r.field('step-up-code');
    if (!proof) throw new Error('no code field');
    proof.value = '000000';
    proof.dispatchEvent(new Event('input'));
    r.element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await r.settle(30);
    expect(r.element.querySelector('[data-banner="proofRefused"]')).not.toBeNull();
    expect(r.field('step-up-code')?.value).toBe('');
    expect(document.activeElement).toBe(r.field('step-up-code'));
    expect(r.spies.change).not.toHaveBeenCalled();
  });

  for (const scenario of ['changeLost', 'changeServerError', 'changeUnexpected400'] as const)
    it(`${scenario}: unknown, said plainly, never resent; "Set your password again" starts empty`, async () => {
      const r = await render(owner, { scenario });
      await r.changeTo();
      const message = r.element.querySelector('[data-message]');
      expect(message?.getAttribute('data-message')).toBe('unknown');
      expect(text(message)).toContain(t.messages.unknownDescription);
      expect(text(r.element.querySelector('[data-manager-note]'))).toBe(t.messages.managerNote);
      expect(t.messages.unknownDescription).toContain('This session stays signed in either way');
      await r.settle(50);
      expect(r.spies.change).toHaveBeenCalledTimes(1);
      await r.click('[data-start-over]');
      expect(r.flow.state()).toEqual({ phase: 'editing', rejected: false });
      expect(r.field('new-password')?.value).toBe('');
      expect(r.field('confirm-password')?.value).toBe('');
      expect(r.spies.change).toHaveBeenCalledTimes(1);
    });

  it('a throttled change stops with a manual way back only', async () => {
    const r = await render(owner, { scenario: 'changeRateLimited' });
    await r.changeTo();
    expect(r.element.querySelector('[data-banner="rateLimited"]')).not.toBeNull();
    expect(r.field('step-up-code')?.disabled).toBe(true);
    await r.settle(50);
    expect(r.spies.change).toHaveBeenCalledTimes(1);
    expect(await r.auth.passwordMatches(owner.userId, DEMO_PASSWORD)).toBe(true);
  });

  it('a passkey-only owner is told why; an operator is refused; a production build is not available', async () => {
    const passkeys = await render(owner, { passkeyOnly: true });
    expect(passkeys.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'noAuthenticator',
    );
    expect(passkeys.element.querySelector('input[type="password"]')).toBeNull();
    TestBed.resetTestingModule();
    const op = await render(operator);
    expect(op.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'refused',
    );
    expect(op.spies.load).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    const production = await render(owner, { build: 'production' });
    expect(production.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'notInBuild',
    );
    expect(production.element.querySelector('[data-demo-note]')).toBeNull();
  });

  it('leaving the page drops the password', async () => {
    const r = await render();
    await r.type('new-password', NEW);
    await r.type('confirm-password', NEW);
    await r.submit();
    r.fixture.destroy();
    expect(r.flow.state()).toEqual({ phase: 'idle' });
    expect(r.flow.verify(DEMO_TOTP_CODE)).toBe(false);
  });

  it('never puts the password, the code or the grant in storage, history, the URL, the console, a notice or the demo world', async () => {
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
    const r = await render();
    await r.changeTo();
    const grants = r.spies.issued.mock.results.map((x) => String(x.value));
    expect(grants).toHaveLength(1);
    const recorded = JSON.stringify([
      ...Object.values(watched).map((spy) => spy.mock.calls),
      r.navigations,
      TestBed.inject(Router).url,
      history.state,
      location.href,
      TestBed.inject(AccountSecurityFacade).takeNotice(),
      TestBed.inject(DemoWorld).snapshot(),
    ]);
    for (const secret of [NEW, DEMO_TOTP_CODE, 'demo-step-up-', ...grants])
      expect(recorded).not.toContain(secret);
    expect(r.element.innerHTML).not.toContain(NEW);
  });

  it('in Arabic: translated, right to left, the password fields left to right', async () => {
    const r = await render(owner, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await r.settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(r.element.querySelector('h1'))).toBe(ar.settings.security.password.title);
    expect(r.field('new-password')?.getAttribute('dir')).toBe('ltr');
    expect(r.field('confirm-password')?.getAttribute('dir')).toBe('ltr');
  });
});
