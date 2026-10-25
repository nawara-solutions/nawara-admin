import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, tap } from 'rxjs';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { DEMO_OWNER_ACCOUNT, DEMO_TOTP_CODE } from '../../../core/auth/auth.fixtures';
import { DemoAuthState, demoSecretKeyDigest } from '../../../core/auth/auth.mock-state';
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
import { SECRET_KEY_CHECK_GROUP, SecretKeyFacade } from '../application/secret-key.facade';
import {
  AccountSecurityGateway,
  SecretKeyIssue,
  UnavailableAccountSecurityGateway,
} from '../data-access/account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  AccountSecurityDemoScenario,
  MockAccountSecurityGateway,
} from '../data-access/account-security.mock';
import { SECRET_KEY_SLOW_MS, SecretKeyPage } from './secret-key.page';

const t = en.settings.security.secretKey;
/** The group the injected picker chooses (0-based): group 5. */
const CHECK = 4;
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
    hang = false,
  }: {
    build?: 'demo' | 'production';
    scenario?: AccountSecurityDemoScenario;
    langs?: Record<string, Translation>;
    passkeyOnly?: boolean;
    /** The rotation never answers (to see the page while it is being created). */
    hang?: boolean;
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
      SecretKeyPage,
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
      { provide: SECRET_KEY_CHECK_GROUP, useValue: () => CHECK },
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
  const rotate = security.rotateSecretKey.bind(security);
  /** Every key the (mock) Core returned, to look for it everywhere it must not be. */
  const issued: SecretKeyIssue[] = [];
  const spies = {
    load: vi.spyOn(security, 'load'),
    rotate: vi
      .spyOn(security, 'rotateSecretKey')
      .mockImplementation((token) =>
        hang ? NEVER : rotate(token).pipe(tap((issue) => issued.push(issue))),
      ),
    stepUp: vi.spyOn(TestBed.inject(StepUpGateway), 'obtain'),
  };
  const fixture = TestBed.createComponent(SecretKeyPage);
  const element = fixture.nativeElement as HTMLElement;
  const flow = fixture.debugElement.injector.get(SecretKeyFacade);
  const page = fixture.componentInstance;
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
    const target = element.querySelector<HTMLElement>(selector);
    if (!target) throw new Error(`no ${selector}`);
    target.click();
    await settle(30);
  };
  const tick = async (selector: string) => {
    const box = element.querySelector<HTMLInputElement>(`${selector} input[type="checkbox"]`);
    if (!box) throw new Error(`no checkbox in ${selector}`);
    box.click();
    await settle();
  };
  const submit = async () => {
    element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle(30);
  };
  /** Acknowledged and verified: the key is on the page (masked). */
  const toKey = async () => {
    await tick('[data-acknowledge]');
    await submit();
    await type('step-up-code', DEMO_TOTP_CODE);
    await submit();
    await settle(30);
  };
  const works = async (key: string) =>
    auth.secretKeyMatches(owner.userId, await demoSecretKeyDigest(key));
  await settle();
  return {
    fixture,
    element,
    flow,
    page,
    settle,
    field,
    type,
    click,
    tick,
    submit,
    toKey,
    works,
    navigations,
    spies,
    issued,
    auth,
  };
}

describe('Create a new secret key page (P9-S4c)', { timeout: 20_000 }, () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('end to end in the demo: warning, acknowledgement, confirm it’s you, the key masked, revealed, checked, saved, Done', async () => {
    const r = await render();
    expect(text(r.element.querySelector('h1'))).toBe(t.title);
    expect(r.element.querySelector('[aria-current="step"]')?.textContent).toContain(t.steps.before);
    expect(text(r.element.querySelector('[data-warning]'))).toContain(t.intro.replaceTitle);
    expect(text(r.element.querySelector('[data-recovery]'))).toContain(t.intro.recoveryBody);
    expect(r.spies.stepUp).not.toHaveBeenCalled();

    await r.tick('[data-acknowledge]');
    await r.submit();
    expect(text(r.element.querySelector('h2'))).toBe(t.verifyTitle);
    expect(document.activeElement?.id).toBe('secret-key-verify');
    expect(text(r.element.querySelector('[data-demo-note]'))).toContain(DEMO_TOTP_CODE);
    await r.type('step-up-code', DEMO_TOTP_CODE);
    await r.submit();
    await r.settle(30);
    expect(r.spies.stepUp).toHaveBeenCalledWith('owner.secret_key.rotate', {
      method: 'totp',
      code: DEMO_TOTP_CODE,
    });
    expect(r.spies.rotate).toHaveBeenCalledTimes(1);
    const [issue] = r.issued;
    if (!issue) throw new Error('no key issued');
    const groups = issue.secretKey.split('-');
    expect(await r.works(issue.secretKey)).toBe(true);

    // shown once, masked first: nothing of the key in the page
    expect(document.activeElement?.id).toBe('secret-key-save');
    expect(r.element.querySelector('[data-key-masked]')).not.toBeNull();
    expect(r.element.querySelector('[data-key]')).toBeNull();
    for (const group of groups) expect(r.element.innerHTML).not.toContain(group);

    await r.click('[data-reveal]');
    const list = r.element.querySelector('[data-key]');
    expect(list?.getAttribute('dir')).toBe('ltr');
    expect(list?.getAttribute('translate')).toBe('no');
    expect(list?.getAttribute('aria-describedby')).toBe('secret-key-reading');
    const items = [...(list?.querySelectorAll('li') ?? [])];
    expect(items.map((li) => text(li.querySelector('.secret-key-groups__value')))).toEqual(groups);
    expect(text(items[2]?.querySelector('.nw-visually-hidden'))).toBe(
      `Group 3 of 13: ${groups[2]?.split('').join(' ')}`,
    );
    expect(r.element.querySelector('[data-reveal]')?.getAttribute('aria-pressed')).toBe('true');
    // the check is made from the saved copy, with the key hidden
    expect(r.field('secret-key-group')?.disabled).toBe(true);
    await r.click('[data-reveal]');
    expect(r.element.querySelector('[data-key]')).toBeNull();

    await r.type('secret-key-group', groups[CHECK]?.toLowerCase() ?? '');
    await r.click('[data-check-submit]');
    expect(text(r.element.querySelector('[data-check-matched]'))).toBe(
      t.check.matched.replace('{{number}}', '5'),
    );
    expect(r.element.querySelector('[data-done]')?.getAttribute('aria-disabled')).toBe('true');
    await r.tick('[data-saved]');
    expect(r.element.querySelector('[data-done]')?.getAttribute('aria-disabled')).toBeNull();
    await r.click('[data-done]');
    expect(r.navigations).toEqual([{ url: '/settings/security', extras: { replaceUrl: true } }]);
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBe('keySaved');
    expect(r.flow.revealedGroups()).toBeNull();
    for (const group of groups) expect(r.element.innerHTML).not.toContain(group);
  });

  it('nothing is sent until the warning is acknowledged: Continue is unavailable and says why', async () => {
    const r = await render();
    const button = r.element.querySelector('[data-continue]');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(text(r.element.querySelector(`#${button?.getAttribute('aria-describedby')}`))).toBe(
      t.intro.acknowledgeRequired,
    );
    await r.click('[data-continue]');
    await r.submit();
    expect(r.flow.state().phase).toBe('intro');
    expect(r.spies.stepUp).not.toHaveBeenCalled();
    expect(r.spies.rotate).not.toHaveBeenCalled();
  });

  it('Done needs the matched group AND “I’ve saved it”; a wrong group is announced on its field', async () => {
    const r = await render();
    await r.toKey();
    await r.tick('[data-saved]');
    const done = r.element.querySelector('[data-done]');
    expect(done?.getAttribute('aria-disabled')).toBe('true');
    expect(text(r.element.querySelector(`#${done?.getAttribute('aria-describedby')}`))).toBe(
      t.check.doneRequires,
    );
    await r.click('[data-done]');
    expect(r.navigations).toEqual([]);
    await r.type('secret-key-group', 'ZZZZ');
    await r.click('[data-check-submit]');
    const input = r.field('secret-key-group');
    expect(text(r.element.querySelector('[data-check]'))).toContain(t.check.mismatch);
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.value).toBe('');
    expect(document.activeElement).toBe(input);
    expect(r.navigations).toEqual([]);
    expect(r.spies.rotate).toHaveBeenCalledTimes(1);
  });

  it('a refused code is cleared from its field even when Enter follows the typing at once', async () => {
    const r = await render();
    await r.tick('[data-acknowledge]');
    await r.submit();
    const input = r.field('step-up-code');
    if (!input) throw new Error('no code field');
    // typed and submitted in the same task: no render in between
    input.value = '000000';
    input.dispatchEvent(new Event('input'));
    r.element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await r.settle(30);
    expect(r.element.querySelector('[data-banner="proofRefused"]')).not.toBeNull();
    expect(r.field('step-up-code')?.value).toBe('');
    expect(document.activeElement).toBe(r.field('step-up-code'));
    expect(r.spies.rotate).not.toHaveBeenCalled();
  });

  it('copying needs an explicit click, and warns about clipboard history', async () => {
    const writes: string[] = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText: (value: string) => Promise.resolve(void writes.push(value)) },
    });
    const r = await render();
    await r.toKey();
    expect(writes).toEqual([]);
    expect(text(r.element)).toContain(t.key.clipboard);
    await r.click('[data-copy]');
    expect(writes).toEqual([r.issued[0]?.secretKey]);
    expect(text(r.element.querySelector('[data-copy-status]'))).toBe(t.key.copied);
  });

  it('a passkey-only owner is told why; nothing is verified or created', async () => {
    const r = await render(owner, { passkeyOnly: true });
    expect(r.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'noAuthenticator',
    );
    expect(text(r.element)).toContain(t.messages.noAuthenticatorDescription);
    expect(r.element.querySelector('input')).toBeNull();
    expect(r.spies.stepUp).not.toHaveBeenCalled();
    expect(r.spies.rotate).not.toHaveBeenCalled();
  });

  it('refuses an operator without any request', async () => {
    const r = await render(operator);
    expect(r.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe('refused');
    expect(r.spies.load).not.toHaveBeenCalled();
    expect(r.spies.rotate).not.toHaveBeenCalled();
  });

  it('with the production (unavailable) adapters, creating a key is not available: no demo code, no request', async () => {
    const r = await render(owner, { build: 'production' });
    expect(r.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe(
      'notInBuild',
    );
    expect(r.element.querySelector('[data-demo-note]')).toBeNull();
    expect(r.spies.rotate).not.toHaveBeenCalled();
  });

  for (const scenario of ['rotateLost', 'rotateServerError'] as const)
    it(`${scenario}: the outcome is unknown, said plainly, never resent; “Create another key” starts over`, async () => {
      const r = await render(owner, { scenario });
      await r.toKey();
      const message = r.element.querySelector('[data-message]');
      expect(message?.getAttribute('data-message')).toBe('unknown');
      expect(text(message)).toContain(
        'The request may have created a new secret key. Your previous key may no longer work, and Admin cannot retrieve the new one.',
      );
      expect(text(message)).toContain(t.messages.unknownNext);
      await r.settle(50);
      expect(r.spies.rotate).toHaveBeenCalledTimes(1);
      expect(r.spies.stepUp).toHaveBeenCalledTimes(1);
      await r.click('[data-start-over]');
      expect(r.flow.state()).toEqual({ phase: 'intro' });
      expect(r.element.querySelector<HTMLInputElement>('[data-acknowledge] input')?.checked).toBe(
        false,
      );
      expect(r.spies.rotate).toHaveBeenCalledTimes(1);
    });

  it('a success without a usable key says a key was created but cannot be shown', async () => {
    const r = await render(owner, { scenario: 'rotateIncomplete' });
    await r.toKey();
    const message = r.element.querySelector('[data-message]');
    expect(message?.getAttribute('data-message')).toBe('incomplete');
    expect(text(message)).toContain(t.messages.incompleteDescription);
    expect(r.spies.rotate).toHaveBeenCalledTimes(1);
  });

  it('a throttled rotation (429) stops on the verification with a manual way back only', async () => {
    const r = await render(owner, { scenario: 'rotateRateLimited' });
    await r.toKey();
    expect(r.element.querySelector('[data-banner="rateLimited"]')).not.toBeNull();
    expect(r.field('step-up-code')?.disabled).toBe(true);
    await r.settle(50);
    expect(r.spies.rotate).toHaveBeenCalledTimes(1);
  });

  it('while creating: everything is locked, it says to stay, and after a while that it is still waiting', async () => {
    const r = await render(owner, { hang: true });
    await r.tick('[data-acknowledge]');
    await r.submit();
    await r.type('step-up-code', DEMO_TOTP_CODE);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      r.element.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.advanceTimersByTimeAsync(5);
      await r.fixture.whenStable();
      expect(r.flow.state().phase).toBe('creating');
      expect(text(r.element.querySelector('[data-creating]'))).toContain(t.creatingStay);
      expect(r.element.querySelector('[data-slow]')).toBeNull();
      expect(r.element.querySelector('[data-cancel]')?.getAttribute('aria-disabled')).toBe('true');
      await vi.advanceTimersByTimeAsync(SECRET_KEY_SLOW_MS);
      await r.fixture.whenStable();
      expect(text(r.element.querySelector('[data-slow]'))).toBe(t.creatingSlow);
      expect(r.spies.rotate).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaving with the key unsaved asks first: “Stay” keeps it, “Leave anyway” drops it and Security says so', async () => {
    const r = await render();
    expect(r.page.canLeave()).toBe(true);
    await r.toKey();
    const staying = r.page.canLeave();
    expect(staying).toBeInstanceOf(Promise);
    await r.settle();
    const dialog = document.querySelector('[role="alertdialog"]');
    expect(text(dialog)).toContain(t.leave.title);
    expect(document.activeElement?.hasAttribute('data-stay')).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-stay]')?.click();
    expect(await staying).toBe(false);
    expect(r.flow.state().phase).toBe('shown');

    const leaving = r.page.canLeave();
    await r.settle();
    document.querySelector<HTMLButtonElement>('[data-leave]')?.click();
    expect(await leaving).toBe(true);
    expect(r.flow.state()).toEqual({ phase: 'abandoned' });
    expect(r.flow.revealedGroups()).toBeNull();
    expect(TestBed.inject(AccountSecurityFacade).takeNotice()).toBe('keyNotSaved');
    expect(r.navigations).toEqual([]);
  });

  it('closing the tab with the key unsaved asks the browser to confirm; otherwise it does not', async () => {
    const r = await render();
    const before = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(false);
    await r.toKey();
    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);
  });

  it('a session change drops the key at once, and leaving then asks nothing', async () => {
    const r = await render();
    await r.toKey();
    await r.click('[data-reveal]');
    TestBed.inject(AuthSession).signOut();
    await r.settle();
    expect(r.page.canLeave()).toBe(true);
    expect(r.element.querySelector('[data-key]')).toBeNull();
    expect(r.element.querySelector('[data-message]')?.getAttribute('data-message')).toBe('refused');
  });

  it('destroying the page disposes the key', async () => {
    const r = await render();
    await r.toKey();
    await r.click('[data-reveal]');
    r.fixture.destroy();
    expect(r.flow.revealedGroups()).toBeNull();
    expect(r.flow.state()).toEqual({ phase: 'idle' });
  });

  it('never puts the key in storage, history, the URL, the console, a notice or the demo world', async () => {
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
    await r.toKey();
    await r.click('[data-reveal]');
    const key = r.issued[0]?.secretKey ?? '';
    const groups = key.split('-');
    await r.click('[data-reveal]');
    await r.type('secret-key-group', groups[CHECK] ?? '');
    await r.click('[data-check-submit]');
    await r.tick('[data-saved]');
    await r.click('[data-done]');
    const recorded = JSON.stringify([
      ...Object.values(watched).map((spy) => spy.mock.calls),
      r.navigations,
      TestBed.inject(Router).url,
      history.state,
      TestBed.inject(AccountSecurityFacade).takeNotice(),
      TestBed.inject(DemoWorld).snapshot(),
    ]);
    expect(key).toMatch(/^([A-Z2-9]{4}-){12}[A-Z2-9]{4}$/);
    for (const secret of [key, key.replace(/-/g, ''), `${groups[0]}-${groups[1]}`])
      expect(recorded).not.toContain(secret);
    expect(r.element.innerHTML).not.toContain(groups.slice(0, 3).join(''));
  });

  it('in Arabic: translated, right to left, the key left to right', async () => {
    const r = await render(owner, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await r.settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(r.element.querySelector('h1'))).toBe(ar.settings.security.secretKey.title);
    await r.toKey();
    await r.click('[data-reveal]');
    expect(r.element.querySelector('[data-key]')?.getAttribute('dir')).toBe('ltr');
    expect(r.field('secret-key-group')?.getAttribute('dir')).toBe('ltr');
  });
});
