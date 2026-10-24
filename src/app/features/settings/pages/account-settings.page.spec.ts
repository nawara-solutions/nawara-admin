import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Component } from '@angular/core';
import { Translation, TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthGateway, UnavailableAuthGateway } from '../../../core/auth/auth.gateway';
import {
  DEMO_CONFIRMATION_CODE,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
  DEMO_TOTP_SECRET,
  DEMO_WORKING_CODE,
} from '../../../core/auth/auth.fixtures';
import { Grants } from '../../../core/auth/auth.model';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { AuthSession } from '../../../core/auth/auth-session';
import { OperatorGrantsRefresh } from '../../../core/auth/operator-grants-refresh';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { LocaleService } from '../../../core/i18n/locale.service';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { SETTINGS_ROUTES } from '../settings.routes';

@Component({ template: '' })
class Blank {}

const t = en.settings.account;

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@demo.nawara.invalid',
  displayName: 'Demo Owner',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'operator.multi@demo.nawara.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};
const phoneOperator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.phone,
  email: null,
  phone: '+99900000001',
  platformAssignments: [DEMO_DRIVE_PLATFORM_ID],
};

/** Core's `/auth/grants`, as a script (the refresh's only call). */
class ScriptedAuth extends UnavailableAuthGateway {
  static answer: () => Observable<Grants> = () => of({ companyId: null, platformAssignments: [] });
  static calls = 0;
  override grants(): Observable<Grants> {
    ScriptedAuth.calls++;
    return ScriptedAuth.answer();
  }
}

/** A directory whose assigned-Platforms read fails until told otherwise (the unavailable state). */
class FlakyDirectory extends MockScopeDirectoryGateway {
  static failing = true;
  override assignedPlatforms(ids: Parameters<MockScopeDirectoryGateway['assignedPlatforms']>[0]) {
    return FlakyDirectory.failing
      ? throwError((): AppError => ({ kind: 'unavailable', status: 503 }))
      : super.assignedPlatforms(ids);
  }
}

const network = { fetch: vi.fn(), xhr: vi.fn() };

async function setup(
  actor: Actor | null,
  {
    directory = 'mock',
    url = '/settings/account',
    langs = { en },
  }: {
    directory?: 'mock' | 'flaky';
    url?: string;
    langs?: Record<string, Translation>;
  } = {},
) {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  network.fetch = vi.fn();
  network.xhr = vi.fn();
  vi.stubGlobal('fetch', network.fetch);
  vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(network.xhr);
  ScriptedAuth.calls = 0;
  TestBed.configureTestingModule({
    imports: [
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
      provideRouter([
        { path: 'settings', children: SETTINGS_ROUTES },
        { path: '**', component: Blank },
      ]),
      { provide: APP_ENVIRONMENT, useValue: { production: false, demo: { load: loadDemo } } },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      {
        provide: ScopeDirectoryGateway,
        useClass: directory === 'flaky' ? FlakyDirectory : MockScopeDirectoryGateway,
      },
      { provide: AuthGateway, useClass: ScriptedAuth },
      OperatorGrantsRefresh,
      ScopeContext,
    ],
  });
  if (actor) TestBed.inject(AuthSession).establish(actor);
  const harness = await RouterTestingHarness.create();
  const settle = async () => {
    await harness.fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  await harness.navigateByUrl(url);
  await settle();
  const page = () => harness.routeNativeElement as HTMLElement;
  return {
    harness,
    page,
    settle,
    session: TestBed.inject(AuthSession),
    context: TestBed.inject(ScopeContext),
  };
}

const loadDemo = vi.fn(async () => {
  throw new Error('the Account page must not load the demo bindings');
});
const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const fact = (page: HTMLElement, name: string) => text(page.querySelector(`[data-${name}]`));

describe('Settings → Account (P9-S2)', { timeout: 15_000 }, () => {
  afterEach(() => {
    FlakyDirectory.failing = true;
    ScriptedAuth.answer = () => of({ companyId: null, platformAssignments: [] });
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('the owner sees their own account: type, contact, Company and scope, and nothing of an operator', async () => {
    const { page } = await setup(owner);
    expect(text(page().querySelector('h1'))).toBe(t.title);
    expect(fact(page(), 'type')).toBe(en.shell.role.owner);
    expect(fact(page(), 'email')).toBe('owner@demo.nawara.invalid');
    expect(page().querySelector('[data-email] [dir="ltr"]')).not.toBeNull();
    expect(fact(page(), 'phone')).toBe(t.none);
    expect(fact(page(), 'company')).toBe('Nawara Solutions');
    expect(fact(page(), 'scope')).toContain(t.ownerScope);
    expect(fact(page(), 'scope')).toContain('2 Platforms');
    expect(page().querySelector('[data-platform], [data-confirmation]')).toBeNull();
    // Core keeps no display name: the demo's is not presented as an account fact
    expect(text(page())).not.toContain('Demo Owner');
    expect(text(page().querySelector('[data-sign-in]'))).toContain(t.ownerSignIn);
  });

  it('an operator sees their own account and only the Platforms granted to them, with no Company data', async () => {
    const { page } = await setup(operator);
    expect(fact(page(), 'type')).toBe(en.shell.role.operator);
    expect(fact(page(), 'email')).toBe('operator.multi@demo.nawara.invalid');
    expect(fact(page(), 'confirmation')).toContain(t.confirmed);
    expect([...page().querySelectorAll('[data-platform]')].map(text)).toEqual([
      'Nawara School',
      'Nawara Drive',
    ]);
    expect(page().querySelector('[data-company], [data-scope]')).toBeNull();
    expect(text(page())).toContain(t.managedByOwner);
    expect(text(page().querySelector('[data-sign-in]'))).toContain(t.operatorSignIn);
    // no owner or administration control: the page has no button and no link at all
    expect(page().querySelectorAll('a, button')).toHaveLength(0);
  });

  it('a phone-only operator: the phone, left to right, and no email', async () => {
    const { page } = await setup(phoneOperator);
    expect(fact(page(), 'email')).toBe(t.none);
    expect(fact(page(), 'phone')).toBe('+99900000001');
    expect(page().querySelector('[data-phone] [dir="ltr"]')).not.toBeNull();
    expect([...page().querySelectorAll('[data-platform]')].map(text)).toEqual(['Nawara Drive']);
  });

  it('no identity can be asked for: query parameters are ignored and the route has no identity parameter', async () => {
    const { page } = await setup(operator, {
      url: `/settings/account?userId=${DEMO_OWNER_ID}&email=owner@demo.nawara.invalid&id=${DEMO_OPERATOR_IDS.school}`,
    });
    expect(fact(page(), 'email')).toBe('operator.multi@demo.nawara.invalid');
    expect(fact(page(), 'type')).toBe(en.shell.role.operator);
    expect(text(page())).not.toContain('owner@demo.nawara.invalid');
    const route = SETTINGS_ROUTES.find((r) => r.path === 'account');
    expect(route?.path).not.toContain(':');
  });

  it('a revoked Platform disappears at once when the grants change, before any list reloads', async () => {
    const { page, settle, session } = await setup(operator);
    expect(page().querySelectorAll('[data-platform]')).toHaveLength(2);
    session.refreshGrants(session.epoch(), operator.userId, [DEMO_DRIVE_PLATFORM_ID]);
    await settle();
    expect([...page().querySelectorAll('[data-platform]')].map(text)).toEqual(['Nawara Drive']);
    session.refreshGrants(session.epoch(), operator.userId, []);
    await settle();
    expect(page().querySelector('[data-platform]')).toBeNull();
    expect(page().querySelector('[data-no-platforms]')).not.toBeNull();
  });

  it('access that cannot be read is shown unavailable, never invented; Try again re-reads the grants first', async () => {
    ScriptedAuth.answer = () =>
      of({ companyId: null, platformAssignments: [DEMO_SCHOOL_PLATFORM_ID] });
    const { page, settle } = await setup(operator, { directory: 'flaky' });
    expect(page().querySelector('[data-platforms-unavailable]')).not.toBeNull();
    expect(text(page().querySelector('[data-platforms-unavailable]'))).toContain(
      en.shell.nav.platformsUnavailable,
    );
    expect(page().querySelector('[data-platform]')).toBeNull();
    FlakyDirectory.failing = false;
    page().querySelector<HTMLButtonElement>('[data-platforms-unavailable] button')?.click();
    await settle();
    await settle();
    expect(ScriptedAuth.calls).toBe(1); // the canonical P6-S2b refresh ("retry")
    // the refreshed grants decide: only School is effective now
    expect([...page().querySelectorAll('[data-platform]')].map(text)).toEqual(['Nawara School']);
  });

  it('a blocked operator (Core answers 401 to the grants read) is signed out, and nothing is shown', async () => {
    ScriptedAuth.answer = () =>
      throwError((): AppError => ({ kind: 'unauthenticated', status: 401 }));
    const { page, settle, session } = await setup(operator, { directory: 'flaky' });
    page().querySelector<HTMLButtonElement>('[data-platforms-unavailable] button')?.click();
    await settle();
    expect(session.actor()).toBeNull();
    expect(TestBed.inject(Router).url).toContain('reason=session-expired');
  });

  it('refuses without a session: the signed-out state, no account data', async () => {
    const { page } = await setup(null);
    expect(text(page())).toContain(t.signedOutTitle);
    expect(page().querySelector('[data-identity], [data-access]')).toBeNull();
  });

  it('shows no password, code, secret, token or challenge, stores nothing and sends no request', async () => {
    const { page, settle } = await setup(owner);
    // a live simulated step-up grant exists in the session's Auth state: it must never surface
    const stepUp = TestBed.inject(DemoAuthState).issueStepUp(
      'platform.create',
      owner.userId,
      Date.now() + 60_000,
    );
    await settle();
    const html = page().outerHTML;
    for (const secret of [
      DEMO_PASSWORD,
      DEMO_TOTP_SECRET,
      DEMO_TOTP_CODE,
      DEMO_WORKING_CODE,
      DEMO_CONFIRMATION_CODE,
      stepUp,
    ]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain(owner.userId);
    expect(localStorage.length).toBe(0);
    expect(network.fetch).not.toHaveBeenCalled();
    expect(network.xhr).not.toHaveBeenCalled();
    expect(loadDemo).not.toHaveBeenCalled();
  });

  it('in Arabic: translated and right to left, contacts kept left to right', async () => {
    const { page, settle } = await setup(phoneOperator, { langs: { en, ar } });
    await TestBed.inject(LocaleService).use('ar');
    await settle();
    expect(document.documentElement.dir).toBe('rtl');
    expect(text(page().querySelector('h1'))).toBe(ar.settings.account.title);
    expect(page().querySelector('[data-phone] [dir="ltr"]')?.textContent).toBe('+99900000001');
  });
});
