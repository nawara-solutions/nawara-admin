import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { Actor } from '../../../core/auth/actor';
import { DEMO_OWNER_ACCOUNT } from '../../../core/auth/auth.fixtures';
import { SimulatedWebAuthnClient } from '../../../core/auth/auth.mock';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { BrowserWebAuthnClient, PasskeyPromptError } from '../../../core/auth/webauthn-client';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DEMO_BINDINGS } from '../../../demo/demo-bindings';
import { DEMO_COMPANY_ID } from '../../../demo/world/seed';
import { AccountSecurityFacade } from '../application/account-security.facade';
import { AccountSecurityGateway } from '../data-access/account-security.gateway';
import {
  ACCOUNT_SECURITY_DEMO_SCENARIO,
  MockAccountSecurityGateway,
} from '../data-access/account-security.mock';
import { AccountSecurityPage } from './account-security.page';

/**
 * WP-4.4 Slice B. Passkey registration is not built (docs/ROADMAP.md P9-S4: "passkey registration later"): Admin
 * reads passkeys (the factor list), signs in with one (a simulated prompt in demo builds) and removes one, but never
 * registers one. These tests keep that boundary: nothing offers, calls or fabricates an enrollment.
 */
const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ACCOUNT.identity.userId,
  email: DEMO_OWNER_ACCOUNT.identity.email,
  companyId: DEMO_COMPANY_ID,
};
const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** A stand-in for `navigator.credentials`: any call is recorded, none succeeds. */
function stubCredentials() {
  const credentials = { create: vi.fn(), get: vi.fn() };
  vi.stubGlobal('navigator', { ...navigator, credentials });
  return credentials;
}

async function renderSecurity() {
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
        langs: { en, fr, ar },
        translocoConfig: {
          availableLangs: ['en', 'fr', 'ar'],
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
        useValue: { production: false, demo: { load: async () => DEMO_BINDINGS } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ACCOUNT_SECURITY_DEMO_SCENARIO, useValue: 'normal' },
      { provide: AccountSecurityGateway, useClass: MockAccountSecurityGateway },
      { provide: StepUpGateway, useClass: MockStepUpGateway },
      AccountSecurityFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(owner);
  const signedIn = {
    identity: { userId: owner.userId, email: owner.email, phone: null, adminTier: owner.kind },
    businessIdentityId: null,
  } as const;
  TestBed.inject(DemoAuthState).signedIn.set(signedIn);
  const fixture = TestBed.createComponent(AccountSecurityPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async (ms = 10) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  await settle();
  return { element, settle, signedIn };
}

describe('Passkey enrollment boundary (WP-4.4 Slice B)', { timeout: 15_000 }, () => {
  afterEach(() => {
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('the Security page says adding a passkey is not available, in English, French and Arabic, and offers no control for it', async () => {
    const credentials = stubCredentials();
    const { element, settle } = await renderSecurity();
    for (const [lang, copy] of [
      ['en', en],
      ['fr', fr],
      ['ar', ar],
    ] as const) {
      TestBed.inject(TranslocoService).setActiveLang(lang);
      await settle();
      expect(text(element.querySelector('[data-unavailable]')), lang).toBe(
        copy.settings.security.overview.passkeyUnavailable,
      );
    }
    TestBed.inject(TranslocoService).setActiveLang('en');
    await settle();
    // The page's controls: Remove per factor and the three approved links; none adds or registers a passkey.
    const controls = [...element.querySelectorAll<HTMLElement>('button, a')];
    for (const control of controls) {
      const label = `${text(control)} ${control.getAttribute('aria-label') ?? ''}`;
      if (/passkey/i.test(label))
        expect(label, label).toContain(en.settings.security.remove.button);
    }
    expect(element.querySelector('a[href*="passkey"], a[href*="webauthn"]')).toBeNull();
    // Rendering never reaches the browser's credential API.
    expect(credentials.create).not.toHaveBeenCalled();
    expect(credentials.get).not.toHaveBeenCalled();
  });

  it('reading the Security page leaves the session, the signed-in account and its factors unchanged', async () => {
    stubCredentials();
    const { signedIn } = await renderSecurity();
    const state = TestBed.inject(DemoAuthState);
    expect(TestBed.inject(AuthSession).actor()).toEqual(owner);
    expect(state.signedIn()).toEqual(signedIn);
    const factors = TestBed.inject(AccountSecurityGateway);
    const first = await new Promise((resolve) => factors.load().subscribe(resolve));
    const second = await new Promise((resolve) => factors.load().subscribe(resolve));
    expect(second).toEqual(first);
  });

  it('the account security gateway has no passkey enrollment operation (TOTP setup only)', () => {
    const operations = Object.getOwnPropertyNames(MockAccountSecurityGateway.prototype)
      .filter((name) => name !== 'constructor')
      .sort();
    expect(operations.some((name) => /passkey|webauthn|register/i.test(name))).toBe(false);
    expect(operations).toContain('beginTotp');
    expect(operations).toContain('confirmTotp');
  });

  it('the WebAuthn clients only ask for an existing passkey; none creates one', () => {
    for (const client of [BrowserWebAuthnClient, SimulatedWebAuthnClient]) {
      const names = Object.getOwnPropertyNames(client.prototype).filter((n) => n !== 'constructor');
      expect(names, client.name).toEqual(['get']);
    }
  });

  it('the simulated passkey prompt never touches navigator.credentials and fabricates no key material', async () => {
    const credentials = stubCredentials();
    TestBed.configureTestingModule({
      imports: [
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [{ provide: DEMO_LATENCY_MS, useValue: 0 }, SimulatedWebAuthnClient],
    });
    const window = TestBed.inject(DOCUMENT).defaultView!;
    const client = TestBed.inject(SimulatedWebAuthnClient);
    // Cancel: a cancelled prompt, nothing returned.
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await expect(client.get()).rejects.toEqual(new PasskeyPromptError('cancelled'));
    // OK: a labelled simulated assertion, with no credential id, public key, signature or attestation.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const assertion = await client.get();
    expect(assertion).toEqual({ credential: { type: 'simulated-passkey' } });
    expect(JSON.stringify(assertion)).not.toMatch(
      /rawId|publicKey|signature|attestation|authenticatorData|clientDataJSON|privateKey/,
    );
    expect(credentials.create).not.toHaveBeenCalled();
    expect(credentials.get).not.toHaveBeenCalled();
  });
});
