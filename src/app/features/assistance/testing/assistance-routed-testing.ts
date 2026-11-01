/**
 * Routed test harness of the Assistance module (A11, reused by the A12 acceptance specs): the REAL Billing routes (guards, providers,
 * breadcrumb data) with the demo bindings, the owner (or an operator) signed in, location mocks for back and forward. Test-only.
 */
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
import { ASSISTANCE_DEMO_SCENARIO, AssistanceDemoScenario } from '../data-access/assistance.mock';

export const t = en.assistanceCases;
export const NOW = Date.parse('2026-10-30T12:00:00Z');
export const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
export const OWN = CASES.filter((c) => c.companyId === DEMO_COMPANY_ID);
export const FOREIGN = CASES.filter((c) => c.companyId !== DEMO_COMPANY_ID);
export const caseOf = (n: number) => OWN[n - 1]!;

export const DEMO_BUILD: AppEnvironment = {
  production: false,
  demo: { load: async () => (await import('../../../demo/demo-bindings')).DEMO_BINDINGS },
};
export const PRODUCTION: AppEnvironment = { production: true, demo: null };

export const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
export const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

@Component({ template: '<p data-elsewhere>elsewhere</p>' })
export class Elsewhere {}

export async function setUp({
  actor = owner,
  environment = DEMO_BUILD,
  lang = 'en',
  scenario = 'normal',
}: {
  actor?: Actor;
  environment?: AppEnvironment;
  lang?: 'en' | 'fr' | 'ar';
  /** The demo adapter's answer (A12: every view state reviewed through the real routes). */
  scenario?: AssistanceDemoScenario;
} = {}) {
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
      { provide: ASSISTANCE_DEMO_SCENARIO, useValue: scenario },
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

export const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
export const directoryReady = (root: () => HTMLElement) => () =>
  root().querySelector(
    'adm-assistance-directory-page [data-case-link], adm-assistance-directory-page nw-data-state:not([state="loading"]), adm-assistance-directory-page [data-no-match]',
  ) !== null;
export const caseReady = (root: () => HTMLElement) => () =>
  root().querySelector(
    '[data-section="timeline"], adm-assistance-case-page nw-data-state:not([state="loading"])',
  ) !== null;
export const rows = (root: () => HTMLElement) =>
  [
    ...root().querySelectorAll<HTMLAnchorElement>('adm-assistance-directory-page [data-case-link]'),
  ].map((a) => a.getAttribute('href')?.split('/').at(-1));
