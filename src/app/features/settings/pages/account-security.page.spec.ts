import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import {
  DEMO_OWNER_ACCOUNT,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
} from '../../../core/auth/auth.fixtures';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { LocaleService } from '../../../core/i18n/locale.service';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { DEMO_BINDINGS } from '../../../demo/demo-bindings';
import { AccountSecurityFacade } from '../application/account-security.facade';
import {
  AccountSecurity,
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from '../data-access/account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  AccountSecurityDemoScenario,
  MockAccountSecurityGateway,
} from '../data-access/account-security.mock';
import { AccountSecurityPage } from './account-security.page';

const t = en.settings.security;

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

/** A gateway answering a fixed overview (shapes the demo cannot reach on its own: none, or an unfinished setup). */
class Scripted extends UnavailableAccountSecurityGateway {
  static answer: AccountSecurity = { factors: [] };
  override load(): Observable<AccountSecurity> {
    return of(Scripted.answer);
  }
}

async function render(
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
    langs = { en },
    before,
  }: {
    gateway?: 'mock' | 'unavailable' | 'scripted';
    scenario?: AccountSecurityDemoScenario;
    langs?: Record<string, Translation>;
    /** Runs after the test module is configured, before the page is created. */
    before?: () => void;
  } = {},
) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      AccountSecurityPage,
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
        provide: APP_ENVIRONMENT,
        // The removal dialog reads the demo code from the demo bindings; nothing else on the page does.
        useValue: { production: false, demo: { load: async () => DEMO_BINDINGS } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: scenario },
      {
        provide: AccountSecurityGateway,
        useClass:
          gateway === 'mock'
            ? MockAccountSecurityGateway
            : gateway === 'scripted'
              ? Scripted
              : UnavailableAccountSecurityGateway,
      },
      { provide: StepUpGateway, useClass: MockStepUpGateway },
      AccountSecurityFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: null,
  });
  const spy = vi.spyOn(TestBed.inject(AccountSecurityGateway), 'load');
  const network = { fetch: vi.fn(), xhr: vi.fn() };
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(network.xhr);
  before?.();
  const fixture = TestBed.createComponent(AccountSecurityPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  await settle();
  return { element, spy, settle, network };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Settings → Security (P9-S4a)', { timeout: 15_000 }, () => {
  afterEach(() => {
    Scripted.answer = { factors: [] };
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists the owner’s own factors from the simulated records: type and confirmation, no invented time', async () => {
    const { element, spy } = await render();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(text(element.querySelector('h1'))).toBe(t.title);
    const factors = [...element.querySelectorAll<HTMLElement>('[data-factor]')];
    expect(factors.map((f) => [f.dataset['factor'], f.dataset['confirmed']])).toEqual([
      ['totp', 'true'],
      ['webauthn', 'true'],
    ]);
    expect(factors.map((f) => text(f.querySelector('h3')))).toEqual([
      t.factors.totp,
      t.factors.webauthn,
    ]);
    expect(text(element.querySelector('[data-confirmed-count]'))).toBe('Confirmed factors: 2');
    // the fixtures' factors predate the demo: no "Added" date is shown, and no use is claimed
    expect(element.querySelector('[data-added]')).toBeNull();
    for (const f of factors)
      expect(text(f.querySelector('[data-last-used] dd'))).toBe(t.factors.noUse);
  });

  it('distinguishes an unfinished authenticator setup, after the confirmed factors', async () => {
    Scripted.answer = {
      factors: [
        {
          id: 'u',
          type: 'totp',
          confirmed: false,
          createdAt: '2026-10-25T08:00:00Z',
          lastUsedAt: null,
        },
        {
          id: 'c',
          type: 'totp',
          confirmed: true,
          createdAt: '2026-10-01T10:00:00Z',
          lastUsedAt: '2026-10-24T18:00:00Z',
        },
      ],
    };
    const { element } = await render(owner, { gateway: 'scripted' });
    const factors = [...element.querySelectorAll<HTMLElement>('[data-factor]')];
    expect(factors.map((f) => f.dataset['confirmed'])).toEqual(['true', 'false']);
    expect(text(factors[0])).toContain(t.factors.confirmed);
    expect(factors[0]?.querySelector('[data-added]')).not.toBeNull();
    expect(text(factors[0]?.querySelector('[data-last-used] dd'))).not.toBe(t.factors.noUse);
    expect(text(factors[1])).toContain(t.factors.unfinished);
    expect(text(factors[1]?.querySelector('[data-unfinished-note]'))).toBe(
      t.factors.unfinishedNote,
    );
    expect(text(element.querySelector('[data-confirmed-count]'))).toBe('Confirmed factors: 1');
  });

  it('states the rules and limits without promising recovery or claiming a secret key exists', async () => {
    const { element } = await render();
    const page = text(element);
    expect(page).toContain(t.actions.lastFactor);
    expect(page).toContain(t.actions.stepUp);
    expect(page).toContain(t.recovery.notGuaranteed);
    expect(text(element.querySelector('[data-secret-key]'))).toBe(t.recovery.secretKey);
    expect(page).toContain(t.recovery.process);
    // a promise would be an un-negated guarantee, or a claim about the key's existence
    expect(page).not.toMatch(
      /(?<!not )guarantees? that you can recover|you will be able to recover|your secret key (is|was) (set|issued|generated)/i,
    );
    for (const item of Object.values(t.unavailable)) expect(page).toContain(item);
  });

  it('offers two actions as links, a Remove per confirmed factor, and no form (P9-S4b to P9-S4d)', async () => {
    const { element } = await render();
    const controls = [
      ...element.querySelectorAll('button, a, input, textarea, select, form, [contenteditable]'),
    ];
    expect(
      controls.map((c) => [
        c.tagName,
        c.getAttribute('href') ?? c.getAttribute('aria-label'),
        text(c),
      ]),
    ).toEqual([
      ['BUTTON', `Remove ${t.factors.totp}`, t.remove.button],
      ['BUTTON', `Remove ${t.factors.webauthn}`, t.remove.button],
      ['A', '/settings/security/add-authenticator', t.add.action],
      ['A', '/settings/security/secret-key', t.secretKey.action],
    ]);
  });

  it('the secret-key card claims nothing about an existing key and promises no recovery (P9-S4c)', async () => {
    const { element } = await render();
    const card = element.querySelector('[data-secret-key-card]');
    expect(text(card?.querySelector('h2'))).toBe(t.secretKey.cardTitle);
    expect(text(card)).toContain(t.secretKey.cardBody);
    expect(t.secretKey.cardBody).toContain('Admin can’t check whether you have one');
    expect(text(card)).not.toMatch(
      /you (have|don’t have|do not have) a (secret )?key\b|last (created|rotated)/i,
    );
    expect(t.unavailable).not.toHaveProperty('secretKey');
  });

  it('a passkey-only owner sees the action disabled, with the reason as its description (P9-S4b)', async () => {
    Scripted.answer = {
      factors: [
        { id: 'p', type: 'webauthn', confirmed: true, createdAt: null, lastUsedAt: null },
        { id: 'u', type: 'totp', confirmed: false, createdAt: null, lastUsedAt: null },
      ],
    };
    const { element } = await render(owner, { gateway: 'scripted' });
    expect(element.querySelector('a')).toBeNull();
    const button = element.querySelector<HTMLButtonElement>('[data-add] button');
    expect(button?.disabled).toBe(true);
    const reason = element.querySelector('[data-add-unavailable]');
    expect(button?.getAttribute('aria-describedby')).toBe(reason?.id);
    expect(text(reason)).toBe(t.add.needsAuthenticator);
    // the same limitation for a new secret key (P9-S4c): no passkey confirmation yet, never a fallback
    const keyButton = element.querySelector<HTMLButtonElement>('[data-secret-key-action] button');
    expect(keyButton?.disabled).toBe(true);
    const keyReason = element.querySelector('[data-secret-key-unavailable]');
    expect(keyButton?.getAttribute('aria-describedby')).toBe(keyReason?.id);
    expect(text(keyReason)).toBe(t.secretKey.needsAuthenticator);
  });

  it('shows the notice the add page left, once, without any secret (P9-S4b)', async () => {
    const first = await render(owner, {
      before: () => TestBed.inject(AccountSecurityFacade).announce('added'),
    });
    expect(text(first.element.querySelector('[data-notice="added"]'))).toBe(t.add.addedNotice);
    expect(first.element.querySelector('[data-notice="added"]')?.getAttribute('role')).toBe(
      'status',
    );
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBeNull();
    // a new factor is not presented as a recovery path
    expect(t.add.addedNotice).toContain('It does not make recovery possible on its own');
  });

  it('shows each secret-key notice once, with no part of a key (P9-S4c)', async () => {
    const expected = {
      keySaved: ['status', t.secretKey.notices.saved],
      keyNotSaved: ['alert', t.secretKey.notices.notSaved],
      keyUnknown: ['alert', t.secretKey.notices.unknown],
      keyCancelled: ['status', t.secretKey.notices.cancelled],
    } as const;
    for (const [notice, [role, copy]] of Object.entries(expected)) {
      TestBed.resetTestingModule();
      const { element } = await render(owner, {
        before: () =>
          TestBed.inject(AccountSecurityFacade).announce(notice as keyof typeof expected),
      });
      const alert = element.querySelector(`[data-notice="${notice}"]`);
      expect(text(alert)).toBe(copy);
      expect(alert?.getAttribute('role')).toBe(role);
      expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBeNull();
    }
    expect(t.secretKey.notices.saved).not.toMatch(/recover/i);
  });

  it('never shows a seed, code, password, key, token or grant, and sends no request', async () => {
    const { element, settle, network } = await render();
    const grant = TestBed.inject(DemoAuthState).issueStepUp(
      'platform.create',
      owner.userId,
      Date.now() + 60_000,
    );
    await settle();
    const html = element.outerHTML;
    for (const secret of [
      DEMO_TOTP_SECRET,
      DEMO_TOTP_CODE,
      DEMO_PASSWORD,
      grant,
      'otpauth',
      owner.userId,
    ]) {
      expect(html).not.toContain(secret);
    }
    expect(network.fetch).not.toHaveBeenCalled();
    expect(network.xhr).not.toHaveBeenCalled();
  });

  it('refuses an operator without asking the gateway', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element)).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('[data-factors]')).toBeNull();
    expect(element.querySelector('[data-secret-key-card]')).toBeNull();
  });

  it('a production build says Security is not available, never a simulated factor', async () => {
    const { element } = await render(owner, { gateway: 'unavailable' });
    expect(text(element)).toContain(t.states.notInBuildTitle);
    expect(element.querySelector('[data-factor], [data-recovery]')).toBeNull();
  });

  it('no factor at all is said plainly; an unavailable read offers Try again', async () => {
    const empty = await render(owner, { gateway: 'scripted' });
    expect(text(empty.element)).toContain(t.states.emptyTitle);
    TestBed.resetTestingModule();
    const { element, spy, settle } = await render(owner, { scenario: 'error' });
    expect(text(element)).toContain(t.states.errorTitle);
    element.querySelector<HTMLButtonElement>('button')?.click();
    await settle();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('in Arabic: translated and right to left', async () => {
    const { element, settle } = await render(owner, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(element.querySelector('h1'))).toBe(ar.settings.security.title);
    expect(text(element.querySelector('[data-factor] h3'))).toBe(ar.settings.security.factors.totp);
  });
});

describe('Settings → Security: removing a factor (P9-S4d)', { timeout: 20_000 }, () => {
  afterEach(() => {
    Scripted.answer = { factors: [] };
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const r = t.remove;
  /** The demo owner with a second confirmed authenticator app (so that one can be removed). */
  const withSecondApp = () => {
    const state = TestBed.inject(DemoAuthState);
    const id = state.beginTotpFactor(owner.userId, '2026-10-25T09:00:00.000Z');
    state.confirmTotpFactor(owner.userId, id, '2026-10-25T09:01:00.000Z');
  };
  const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
  const inDialog = <E extends Element = HTMLElement>(selector: string) =>
    dialog()?.querySelector<E>(selector) ?? null;
  const removeButtons = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLButtonElement>('[data-remove]'),
  ];

  it('numbers factors of the same type and says why one cannot be removed (the last authenticator app)', async () => {
    const { element } = await render();
    // the demo owner: one authenticator app and one passkey
    const [totp, passkey] = removeButtons(element);
    expect(totp?.disabled).toBe(true);
    const reason = element.querySelector(`#${totp?.getAttribute('aria-describedby') ?? ''}`);
    expect(text(reason)).toBe(r.blocked.lastAuthenticator);
    expect(passkey?.disabled).toBe(false);
    expect(passkey?.getAttribute('aria-describedby')).toMatch(/^security-factor-/);
    TestBed.resetTestingModule();
    const two = await render(owner, { before: withSecondApp });
    expect([...two.element.querySelectorAll('[data-factor] h3')].map(text)).toEqual([
      'Authenticator app 1',
      'Passkey',
      'Authenticator app 2',
    ]);
    expect(
      removeButtons(two.element).map((b) => [b.getAttribute('aria-label'), b.disabled]),
    ).toEqual([
      ['Remove Authenticator app 1', false],
      ['Remove Passkey', false],
      ['Remove Authenticator app 2', false],
    ]);
  });

  it('the last confirmed factor and a passkey-only owner: disabled, with the reason; an unfinished setup offers nothing', async () => {
    Scripted.answer = {
      factors: [
        { id: 't', type: 'totp', confirmed: true, createdAt: null, lastUsedAt: null },
        { id: 'u', type: 'totp', confirmed: false, createdAt: null, lastUsedAt: null },
      ],
    };
    const single = await render(owner, { gateway: 'scripted' });
    expect(removeButtons(single.element)).toHaveLength(1);
    expect(removeButtons(single.element)[0]?.disabled).toBe(true);
    expect(text(single.element.querySelector('[data-remove-reason]'))).toBe(r.blocked.lastFactor);
    TestBed.resetTestingModule();
    Scripted.answer = {
      factors: [
        { id: 'p1', type: 'webauthn', confirmed: true, createdAt: null, lastUsedAt: null },
        { id: 'p2', type: 'webauthn', confirmed: true, createdAt: null, lastUsedAt: null },
      ],
    };
    const passkeys = await render(owner, { gateway: 'scripted' });
    expect(removeButtons(passkeys.element).every((b) => b.disabled)).toBe(true);
    expect([...passkeys.element.querySelectorAll('[data-remove-reason]')].map(text)).toEqual([
      r.blocked.noAuthenticator,
      r.blocked.noAuthenticator,
    ]);
  });

  it('end to end: Remove → the fresh read → confirmation (focus on Cancel) → a wrong then a right code → removed, focus on the outcome', async () => {
    const { element, settle } = await render(owner, { before: withSecondApp });
    const security = TestBed.inject(AccountSecurityGateway);
    const removals = vi.spyOn(security, 'removeFactor');
    const loads = vi.spyOn(security, 'load');
    const stepUps = vi.spyOn(TestBed.inject(StepUpGateway), 'obtain');
    const target = removeButtons(element)[2];
    const before = loads.mock.calls.length;
    target?.click();
    await settle(30);
    // the dialog read the list again before offering anything
    expect(loads.mock.calls.length).toBeGreaterThan(before);
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(text(dialog()?.querySelector('h2'))).toBe('Remove Authenticator app 2?');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    const consequences = text(inDialog('[data-consequences]'));
    for (const line of Object.values(r.consequences)) expect(consequences).toContain(line);
    expect(text(inDialog('[data-remaining]'))).toBe(r.remaining.replace('{{count}}', '2'));
    expect(inDialog('[data-last-warning]')).toBeNull();

    inDialog<HTMLButtonElement>('[data-continue]')?.click();
    await settle(30);
    const field = () => inDialog<HTMLInputElement>('input[name="step-up-code"]');
    expect(document.activeElement).toBe(field());
    expect(text(inDialog('[data-demo-note]'))).toContain(DEMO_TOTP_CODE);
    // a wrong code typed and submitted at once: refused, the field cleared, nothing removed
    const input = field();
    if (!input) throw new Error('no code field');
    input.value = '000000';
    input.dispatchEvent(new Event('input'));
    inDialog('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(30);
    expect(inDialog('[data-banner="proofRefused"]')?.getAttribute('role')).toBe('alert');
    expect(field()?.value).toBe('');
    expect(field()?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(field());
    expect(removals).not.toHaveBeenCalled();

    const again = field();
    if (!again) throw new Error('no code field');
    again.value = DEMO_TOTP_CODE;
    again.dispatchEvent(new Event('input'));
    inDialog('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(60);
    expect(stepUps.mock.calls.map((c) => c[0])).toEqual([
      'owner.factor.remove',
      'owner.factor.remove',
    ]);
    expect(removals).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    const outcome = element.querySelector('[data-removal-outcome="removed"]');
    expect(text(outcome)).toBe(r.outcomes.removed);
    expect(document.activeElement).toBe(outcome);
    expect([...element.querySelectorAll('[data-factor] h3')].map(text)).toEqual([
      'Authenticator app',
      'Passkey',
    ]);
  });

  it('two confirmed factors: the removal warns that only one would remain', async () => {
    const before = () => {
      withSecondApp();
      const state = TestBed.inject(DemoAuthState);
      state.ownerFactors.set(
        owner.userId,
        (state.ownerFactors.get(owner.userId) ?? []).filter((f) => f.type === 'totp'),
      );
    };
    const { element, settle } = await render(owner, { before });
    removeButtons(element)[1]?.click();
    await settle(30);
    expect(text(inDialog('[data-last-warning]'))).toContain(r.lastWarningTitle);
    expect(inDialog('[data-last-warning]')?.getAttribute('role')).toBe('alert');
    expect(inDialog('[data-remaining]')).toBeNull();
  });

  it('Cancel and Escape close it before anything is sent, and focus returns to its Remove button', async () => {
    const { element, settle } = await render(owner, { before: withSecondApp });
    const removals = vi.spyOn(TestBed.inject(AccountSecurityGateway), 'removeFactor');
    const target = removeButtons(element)[1];
    target?.focus();
    target?.click();
    await settle(30);
    inDialog<HTMLButtonElement>('[data-cancel]')?.click();
    await settle(30);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(target);
    target?.click();
    await settle(30);
    inDialog<HTMLButtonElement>('[data-continue]')?.click();
    await settle(30);
    dialog()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    await settle(30);
    expect(dialog()).toBeNull();
    expect(removals).not.toHaveBeenCalled();
    expect(element.querySelector('[data-removal-outcome]')).toBeNull();
  });

  it('a removal whose answer is lost is settled by the list: the factor is gone → "no longer on your account", never resent', async () => {
    const { element, settle } = await render(owner, {
      before: withSecondApp,
      scenario: 'removeLost',
    });
    const removals = vi.spyOn(TestBed.inject(AccountSecurityGateway), 'removeFactor');
    removeButtons(element)[2]?.click();
    await settle(30);
    inDialog<HTMLButtonElement>('[data-continue]')?.click();
    await settle(30);
    const input = inDialog<HTMLInputElement>('input[name="step-up-code"]');
    if (!input) throw new Error('no code field');
    input.value = DEMO_TOTP_CODE;
    input.dispatchEvent(new Event('input'));
    inDialog('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(80);
    expect(removals).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(text(element.querySelector('[data-removal-outcome="absent"]'))).toBe(r.outcomes.absent);
    expect(r.outcomes.absent).not.toMatch(/removed/i);
  });

  it('never puts the code or the grant in storage, history, the console or a notice', async () => {
    const watched = {
      local: vi.spyOn(Storage.prototype, 'setItem'),
      push: vi.spyOn(history, 'pushState'),
      replace: vi.spyOn(history, 'replaceState'),
      log: vi.spyOn(console, 'log'),
      warn: vi.spyOn(console, 'warn'),
      error: vi.spyOn(console, 'error'),
    };
    const { element, settle } = await render(owner, { before: withSecondApp });
    const issued = vi.spyOn(TestBed.inject(DemoAuthState), 'issueStepUp');
    removeButtons(element)[2]?.click();
    await settle(30);
    inDialog<HTMLButtonElement>('[data-continue]')?.click();
    await settle(30);
    const input = inDialog<HTMLInputElement>('input[name="step-up-code"]');
    if (!input) throw new Error('no code field');
    input.value = DEMO_TOTP_CODE;
    input.dispatchEvent(new Event('input'));
    inDialog('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(60);
    const grants = issued.mock.results.map((x) => String(x.value));
    expect(grants).toHaveLength(1);
    const recorded = JSON.stringify([
      ...Object.values(watched).map((spy) => spy.mock.calls),
      history.state,
      location.href,
      element.innerHTML,
    ]);
    for (const secret of [DEMO_TOTP_CODE, 'demo-step-up-', ...grants])
      expect(recorded).not.toContain(secret);
  });

  it('in Arabic: the dialog is translated and right to left, the code field left to right', async () => {
    const { element, settle } = await render(owner, { langs: { en, ar }, before: withSecondApp });
    await TestBed.inject(LocaleService).use('ar');
    await settle();
    expect(text(element.querySelector('[data-factor] h3'))).toBe(
      ar.settings.security.factors.totpNumbered.replace('{{number}}', '1'),
    );
    removeButtons(element)[2]?.click();
    await settle(30);
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(dialog()?.querySelector('h2'))).toContain(
      ar.settings.security.remove.confirmTitle.slice(0, 5),
    );
    inDialog<HTMLButtonElement>('[data-continue]')?.click();
    await settle(30);
    expect(inDialog('input[name="step-up-code"]')?.getAttribute('dir')).toBe('ltr');
  });
});
