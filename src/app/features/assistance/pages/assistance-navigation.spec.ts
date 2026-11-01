import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT, AppEnvironment } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { loadBillingRoutes } from '../../billing/billing.routes';
import { ASSISTANCE_SECTIONS } from '../ui/assistance-section-nav';

/**
 * Assistance navigation and workflow (A11), through the REAL Billing routes (guards, providers, breadcrumb data) with the demo
 * bindings: Billing → directory → case → back, the overviews and their links, URL-backed filters, deep links, back and forward,
 * owner-only access and the production build.
 */

const t = en.assistanceCases;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = CASES.filter((c) => c.companyId === DEMO_COMPANY_ID);
const FOREIGN = CASES.filter((c) => c.companyId !== DEMO_COMPANY_ID);
const caseOf = (n: number) => OWN[n - 1]!;

const DEMO_BUILD: AppEnvironment = {
  production: false,
  demo: { load: async () => (await import('../../../demo/demo-bindings')).DEMO_BINDINGS },
};
const PRODUCTION: AppEnvironment = { production: true, demo: null };

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

@Component({ template: '<p data-elsewhere>elsewhere</p>' })
class Elsewhere {}

async function setUp({
  actor = owner,
  environment = DEMO_BUILD,
  lang = 'en',
}: { actor?: Actor; environment?: AppEnvironment; lang?: 'en' | 'fr' | 'ar' } = {}) {
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'billing', loadChildren: () => loadBillingRoutes(environment) },
        { path: '**', component: Elsewhere },
      ]),
      provideLocationMocks(),
      // The session needs a demo build (production has no sign-in before D-A4); `environment` binds the routes' adapters only.
      { provide: APP_ENVIRONMENT, useValue: DEMO_BUILD },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      ScopeContext,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  // The router listens to location pops (back, forward) from its initial navigation on.
  TestBed.inject(Router).initialNavigation();
  const harness = await RouterTestingHarness.create();
  const router = TestBed.inject(Router);
  const location = TestBed.inject(Location);
  const root = () => harness.fixture.nativeElement as HTMLElement;
  /** Waits until `ready` holds (the demo adapter answers on a timer, even at zero latency). */
  const until = async (ready: () => boolean) => {
    for (let i = 0; i < 60 && !ready(); i++) {
      await harness.fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve, 5));
      harness.detectChanges();
    }
    await harness.fixture.whenStable();
    harness.detectChanges();
    if (!ready()) throw new Error(`not ready at ${router.url}`);
  };
  const go = async (url: string, ready: () => boolean) => {
    await harness.navigateByUrl(url);
    await until(ready);
  };
  const click = async (selector: string, ready: () => boolean) => {
    const target = root().querySelector<HTMLElement>(selector);
    if (target === null) throw new Error(`no ${selector} at ${router.url}`);
    target.click();
    await until(ready);
  };
  const $ = (selector: string) => root().querySelector<HTMLElement>(selector);
  return { harness, router, location, root, until, go, click, $ };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const directoryReady = (root: () => HTMLElement) => () =>
  root().querySelector(
    'adm-assistance-directory-page [data-case-link], adm-assistance-directory-page nw-data-state:not([state="loading"]), adm-assistance-directory-page [data-no-match]',
  ) !== null;
const caseReady = (root: () => HTMLElement) => () =>
  root().querySelector(
    '[data-section="timeline"], adm-assistance-case-page nw-data-state:not([state="loading"])',
  ) !== null;
const rows = (root: () => HTMLElement) =>
  [
    ...root().querySelectorAll<HTMLAnchorElement>('adm-assistance-directory-page [data-case-link]'),
  ].map((a) => a.getAttribute('href')?.split('/').at(-1));

describe('Assistance navigation and workflow (A11)', { timeout: 60_000 }, () => {
  it('enters from Billing, and reaches every Assistance view through one section navigation', async () => {
    const s = await setUp();
    await s.go('/billing', () => s.$('[data-assistance-link]') !== null);
    expect(s.$('[data-assistance-link]')?.getAttribute('href')).toBe('/billing/assistance');
    await s.click('[data-assistance-link]', directoryReady(s.root));
    expect(s.router.url).toBe('/billing/assistance');
    for (const section of ASSISTANCE_SECTIONS) {
      await s.click(
        `[data-section-link="${section.id}"]`,
        () => s.$(`[data-section-link="${section.id}"][aria-current="page"]`) !== null,
      );
      expect(s.router.url).toBe(section.path);
      // Exactly one current section, and it is this one (the directory is never current on an overview).
      expect([
        ...s.root().querySelectorAll('[data-section-link][aria-current="page"]'),
      ]).toHaveLength(1);
      expect(s.$('nav[aria-label]')?.getAttribute('aria-label')).toBe(t.nav.label);
    }
  });

  it('keeps the directory filters in the address: case → back returns to the same filtered view', async () => {
    const s = await setUp();
    await s.go('/billing/assistance', directoryReady(s.root));
    const attention = s.root().querySelectorAll<HTMLSelectElement>('select')[3]!;
    attention.value = 'disputed';
    attention.dispatchEvent(new Event('change'));
    await s.until(
      () => s.router.url === '/billing/assistance?attention=disputed' && rows(s.root).length === 3,
    );
    expect(rows(s.root).sort()).toEqual([4, 8, 10].map((n) => caseOf(n).request.id).sort());
    // A filter change replaces the history entry: back leaves the page, never steps through filters.
    await s.click(`[data-case-link][href$="${caseOf(8).request.id}"]`, caseReady(s.root));
    const back = s.$('adm-assistance-case-page [data-back]');
    expect(back?.getAttribute('data-back')).toBe('directory');
    expect(back?.getAttribute('href')).toBe('/billing/assistance?attention=disputed');
    expect(text(back)).toBe(t.case.back);
    await s.click('adm-assistance-case-page [data-back]', directoryReady(s.root));
    expect(s.router.url).toBe('/billing/assistance?attention=disputed');
    expect(rows(s.root)).toHaveLength(3);
    expect(s.root().querySelectorAll<HTMLSelectElement>('select')[3]!.value).toBe('disputed');
  });

  it('restores the view on browser back and forward, and on a direct link with filters', async () => {
    const s = await setUp();
    await s.go('/billing/assistance?state=settled&order=consentOldest', directoryReady(s.root));
    const settled = rows(s.root);
    expect(settled).toHaveLength(6);
    expect(settled[0]).toBe(caseOf(14).request.id);
    expect(s.root().querySelectorAll<HTMLSelectElement>('select')[1]!.value).toBe('settled');
    await s.click(`[data-case-link][href$="${caseOf(14).request.id}"]`, caseReady(s.root));
    expect(s.router.url).toBe(`/billing/assistance/${caseOf(14).request.id}`);
    s.location.back();
    await s.until(
      () => s.router.url.startsWith('/billing/assistance?') && rows(s.root).length === 6,
    );
    expect(s.router.url).toBe('/billing/assistance?state=settled&order=consentOldest');
    s.location.forward();
    await s.until(caseReady(s.root));
    expect(s.router.url).toBe(`/billing/assistance/${caseOf(14).request.id}`);
    // History state survives back and forward: the case still returns to the filtered directory.
    expect(s.$('[data-back]')?.getAttribute('href')).toBe(
      '/billing/assistance?state=settled&order=consentOldest',
    );
  });

  it('restores a searched reference from the address into the search field', async () => {
    const s = await setUp();
    await s.go(
      `/billing/assistance?ref=${caseOf(9).request.id.toUpperCase()}`,
      directoryReady(s.root),
    );
    expect(rows(s.root)).toEqual([caseOf(9).request.id]);
    expect(s.root().querySelector<HTMLInputElement>('input[type="search"], input')!.value).toBe(
      caseOf(9).request.id,
    );
  });

  it('a case opened from an overview returns to that overview, with its filters', async () => {
    const s = await setUp();
    const disputesReady = () => s.$('[data-section="disputes"] [data-case-link]') !== null;
    await s.go('/billing/assistance/disputes?state=all', disputesReady);
    const link = s.$('[data-section="disputes"] [data-case-link]')!;
    const target = link.getAttribute('href')!;
    await s.click('[data-section="disputes"] [data-case-link]', caseReady(s.root));
    expect(s.router.url).toBe(target);
    const back = s.$('[data-back]');
    expect(back?.getAttribute('data-back')).toBe('disputes');
    expect(back?.getAttribute('href')).toBe('/billing/assistance/disputes?state=all');
    expect(text(back)).toBe(t.case.backTo.disputes);
    await s.click('[data-back]', disputesReady);
    expect(s.router.url).toBe('/billing/assistance/disputes?state=all');

    for (const [path, page, label] of [
      ['/billing/assistance/settlements?late=applied', 'settlements', t.case.backTo.settlements],
      ['/billing/assistance/recovery?state=open', 'recovery', t.case.backTo.recovery],
    ] as const) {
      await s.go(path, () => s.$('[data-case-link]') !== null);
      await s.click('[data-case-link]', caseReady(s.root));
      expect([
        s.$('[data-back]')?.getAttribute('data-back'),
        s.$('[data-back]')?.getAttribute('href'),
      ]).toEqual([page, path]);
      expect(text(s.$('[data-back]'))).toBe(label);
    }
  });

  it('a case reached from another case keeps the original way back', async () => {
    const s = await setUp();
    await s.go('/billing/assistance?state=settled', directoryReady(s.root));
    await s.click(`[data-case-link][href$="${caseOf(12).request.id}"]`, caseReady(s.root));
    expect(s.$('[data-back]')?.getAttribute('href')).toBe('/billing/assistance?state=settled');
    // Case 12's Organization is restricted by case 11: following that link keeps case 12's way back.
    await s.click(
      '[data-source-case]',
      () => s.router.url.endsWith(caseOf(11).request.id) && s.$('[data-source-case]') === null,
    );
    await s.until(caseReady(s.root));
    expect(s.$('[data-back]')?.getAttribute('href')).toBe('/billing/assistance?state=settled');
    expect(s.$('[data-back]')?.getAttribute('data-back')).toBe('directory');
  });

  it('a deep link to a case returns to the directory; unknown, malformed and another Company’s cases look the same', async () => {
    const s = await setUp();
    await s.go(`/billing/assistance/${caseOf(5).request.id}`, caseReady(s.root));
    expect(s.$('[data-back]')?.getAttribute('href')).toBe('/billing/assistance');
    expect(text(s.$('[data-back]'))).toBe(t.case.back);
    const notFound: string[] = [];
    for (const reference of [
      FOREIGN[0]!.request.id,
      'a551c0de-0000-4000-8000-00000000ffff',
      'not-a-reference',
    ]) {
      await s.go(`/billing/assistance/${reference}`, caseReady(s.root));
      notFound.push(text(s.$('adm-assistance-case-page nw-data-state')));
      expect(s.root().innerHTML).not.toContain(FOREIGN[0]!.request.organizationId);
    }
    expect(new Set(notFound).size).toBe(1);
    expect(notFound[0]).toContain(t.states.notFoundTitle);
  });

  it('refuses an operator on every Assistance address, deep links included', async () => {
    const s = await setUp({ actor: operator });
    for (const section of ASSISTANCE_SECTIONS) {
      await s.go(section.path, () => s.$('[data-elsewhere]') !== null);
      expect(s.router.url).toBe('/forbidden');
      expect(s.$('adm-assistance-section-nav')).toBeNull();
    }
    await s.go(
      `/billing/assistance/${caseOf(5).request.id}`,
      () => s.$('[data-elsewhere]') !== null,
    );
    expect(s.router.url).toBe('/forbidden');
  });

  it('the production bindings show "not available", never an empty result, and no demo case', async () => {
    const s = await setUp({ environment: PRODUCTION });
    await s.go('/billing/assistance', directoryReady(s.root));
    expect(text(s.$('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(s.$('[data-case-link]')).toBeNull();
    expect(s.root().textContent).not.toContain(t.states.emptyTitle);
    for (const path of [
      '/billing/assistance/disputes',
      '/billing/assistance/settlements',
      '/billing/assistance/recovery',
    ]) {
      await s.go(path, () => s.$('nw-data-state:not([state="loading"])') !== null);
      expect(text(s.$('nw-data-state'))).toContain(t.states.notInBuildTitle);
      expect(s.$('[data-case-link]')).toBeNull();
    }
  });

  for (const lang of ['fr', 'ar'] as const)
    it(`labels the section navigation and the way back in ${lang}`, async () => {
      const catalog = (lang === 'fr' ? fr : ar).assistanceCases;
      const s = await setUp({ lang });
      await s.go('/billing/assistance/recovery', () => s.$('[data-case-link]') !== null);
      expect(s.$('nav[aria-label]')?.getAttribute('aria-label')).toBe(catalog.nav.label);
      expect(text(s.$('[aria-current="page"]'))).toBe(catalog.nav.recovery);
      await s.click('[data-case-link]', caseReady(s.root));
      expect(text(s.$('[data-back]'))).toBe(catalog.case.backTo.recovery);
    });

  it('keeps the section navigation keyboard reachable, in reading order, with nothing removed from the tab order', async () => {
    const s = await setUp();
    await s.go('/billing/assistance/settlements', () => s.$('[data-case-link]') !== null);
    const links = [...s.root().querySelectorAll<HTMLAnchorElement>('[data-section-link]')];
    expect(links.map((a) => a.dataset['sectionLink'])).toEqual([
      'cases',
      'disputes',
      'settlements',
      'recovery',
    ]);
    for (const link of links) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('tabindex')).toBeNull();
      link.focus();
      expect(document.activeElement).toBe(link);
    }
    // The section navigation is the first focusable control of the page.
    expect(
      s
        .$(
          'adm-assistance-settlements-page a, adm-assistance-settlements-page button, adm-assistance-settlements-page select',
        )
        ?.hasAttribute('data-section-link'),
    ).toBe(true);
  });
});
