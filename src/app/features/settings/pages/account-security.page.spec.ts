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
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { LocaleService } from '../../../core/i18n/locale.service';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
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
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
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

  it('offers one action, "Add an authenticator app", as a link to its page, and no form (P9-S4b)', async () => {
    const { element } = await render();
    const controls = [
      ...element.querySelectorAll('button, a, input, textarea, select, form, [contenteditable]'),
    ];
    expect(controls).toHaveLength(1);
    expect(controls[0]?.tagName).toBe('A');
    expect(controls[0]?.getAttribute('href')).toBe('/settings/security/add-authenticator');
    expect(text(controls[0])).toBe(t.add.action);
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
