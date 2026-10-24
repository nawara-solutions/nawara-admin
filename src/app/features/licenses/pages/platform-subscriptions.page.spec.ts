import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
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
import { PlatformSubscriptionsFacade } from '../application/platform-subscriptions.facade';
import { LicensesGateway, UnavailableLicensesGateway } from '../data-access/licenses.gateway';
import {
  LICENSES_DEMO_SCENARIO,
  LicensesDemoScenario,
  MockLicensesGateway,
} from '../data-access/licenses.mock';
import { PlatformSubscriptionsPage } from './platform-subscriptions.page';

const t = en.licenses.platform;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const SCHOOL = `/licenses/platforms/${DEMO_SCHOOL_PLATFORM_ID}`;

@Component({ template: '' })
class Blank {}

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
/** Assigned to the very Platform shown: still no commercial authority. */
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

async function render(
  url: string = SCHOOL,
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
  }: { gateway?: 'mock' | 'unavailable'; scenario?: LicensesDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      PlatformSubscriptionsPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'licenses', component: Blank },
        { path: 'licenses/platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: LICENSES_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: LicensesGateway,
        useClass: gateway === 'mock' ? MockLicensesGateway : UnavailableLicensesGateway,
      },
      ScopeContext,
      PlatformSubscriptionsFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const platformSpy = vi.spyOn(TestBed.inject(LicensesGateway), 'platform');
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(PlatformSubscriptionsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  for (let i = 0; i < 20 && !element.querySelector('nw-data-state, table, [data-no-match]'); i++)
    await settle();
  await settle();
  return { element, platformSpy, router, settle, world: TestBed.inject(DemoWorld) };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

const rows = (element: HTMLElement) =>
  [...element.querySelectorAll('tbody tr')].map((r) =>
    [...r.querySelectorAll('th, td')].map((c) => text(c)),
  );

const names = (element: HTMLElement) => rows(element).map((r) => r[0]);

describe('Platform subscriptions page (P7-S2)', { timeout: 15_000 }, () => {
  it('lists every Organization of the Platform by name, with the P7-S1 figures for it', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.title);
    expect(text(element.querySelector('.platform-subscriptions__eyebrow'))).toBe('Nawara School');
    expect(
      [...element.querySelectorAll('.platform-subscriptions__total')].map((d) => [
        text(d.querySelector('dt')),
        text(d.querySelector('dd')),
      ]),
    ).toEqual([
      [en.licenses.figures.organizations, '16'],
      [en.licenses.figures.active, '13'],
      [en.licenses.figures.grace, '1'],
      [en.licenses.figures.none, '2'],
      ['Ending ≤ 14 days', '3'],
    ]);
    expect(text(element.querySelector('[data-entitled]'))).toBe(
      'Entitled now: 14 of 16 Organizations (13 active, 1 in grace).',
    );
    const listed = names(element);
    expect(listed).toHaveLength(16);
    expect([...listed].sort((a, b) => a!.localeCompare(b!, 'en', { sensitivity: 'base' }))).toEqual(
      listed,
    );
    expect(text(element.querySelector('[role="status"]'))).toBe('Showing 16 of 16 Organizations');
  });

  it('keeps state, timeline and entitlement apart for active, grace and none', async () => {
    const { element } = await render();
    const row = (name: string) => rows(element).find((r) => r[0] === name);
    expect(row('Lycée Al Amal')).toEqual([
      'Lycée Al Amal',
      t.state.grace,
      expect.stringMatching(/^Ended .+Grace ends .+$/),
      t.entitlement.entitledInGrace,
    ]);
    expect(row('Collège Riad')).toEqual([
      'Collège Riad',
      t.state.active,
      expect.stringMatching(/^Ends .+Ends in 6 days$/),
      t.entitlement.entitled,
    ]);
    expect(row('École Horizon')?.[2]).toMatch(/^Ends [^]+$/);
    expect(row('École Horizon')?.[2]).not.toContain('Ends in');
    expect(row('Institut Nour')).toEqual([
      'Institut Nour',
      t.state.none,
      t.noEnd,
      t.entitlement.notEntitled,
    ]);
    expect(element.querySelectorAll('[data-ending-soon]')).toHaveLength(3);
    const link = [...element.querySelectorAll('tbody th a')].find(
      (a) => text(a) === 'Collège Riad',
    );
    expect(link?.getAttribute('href')).toMatch(
      new RegExp(`^/platforms/${DEMO_SCHOOL_PLATFORM_ID}/organizations/[0-9a-f-]{36}$`),
    );
    expect(
      [...element.querySelectorAll('.platform-subscriptions__actions a')].map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual(['/licenses', `/platforms/${DEMO_SCHOOL_PLATFORM_ID}`]);
  });

  it('filters by state through the URL, with the canonical counts in the options', async () => {
    const { element, router, settle } = await render();
    const select = element.querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map((o) => text(o))).toEqual([
      'All (16)',
      'Active (13)',
      'Ending within 14 days (3)',
      'In grace (1)',
      'No subscription (2)',
    ]);
    select.value = 'grace';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(router.url).toBe(`${SCHOOL}?state=grace`);
    expect(names(element)).toEqual(['Lycée Al Amal']);
    select.value = 'endingSoon';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(names(element)).toEqual(['Collège Riad', 'École Ibn Sina', 'Lycée Ibn Khaldoun']);
    select.value = 'all';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(router.url).toBe(SCHOOL);
    TestBed.resetTestingModule();
    // A deep link keeps its filter; an unknown value is All.
    const deep = await render(`${SCHOOL}?state=none`);
    expect(rows(deep.element).every((r) => r[1] === t.state.none)).toBe(true);
    expect(rows(deep.element)).toHaveLength(2);
    TestBed.resetTestingModule();
    expect(rows((await render(`${SCHOOL}?state=paid`)).element)).toHaveLength(16);
  });

  it('searches the loaded names, accents and case aside, and offers to clear a search without match', async () => {
    const { element, settle, platformSpy } = await render();
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'LYCEE';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(names(element).every((n) => n!.startsWith('Lycée'))).toBe(true);
    expect(text(element.querySelector('[role="status"]'))).toMatch(/^Showing \d+ of 16/);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(text(element.querySelector('[data-no-match] p'))).toBe(t.noMatch);
    element.querySelector<HTMLButtonElement>('[data-no-match] button')!.click();
    await settle();
    expect(names(element)).toHaveLength(16);
    // Searching and filtering request nothing.
    expect(platformSpy).toHaveBeenCalledTimes(1);
  });

  it('offers no commercial change and invents no commercial value', async () => {
    const { element } = await render();
    const buttons = [...element.querySelectorAll('button')];
    expect(buttons).toHaveLength(0);
    expect(element.querySelectorAll('form, [role="dialog"]')).toHaveLength(0);
    expect(text(element)).not.toMatch(/[€$£]|\bTND\b|\bplan\b|\bprice\b|\bseat/i);
    expect(text(element.querySelector('.platform-subscriptions__hint'))).toBe(t.independence);
  });

  it('never asks an operator’s gateway, even for a Platform they are assigned to', async () => {
    const { element, platformSpy } = await render(SCHOOL, operator);
    expect(platformSpy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(
      en.licenses.states.forbiddenDescription,
    );
    expect(element.querySelector('table')).toBeNull();
  });

  it('says a Platform is not found when it is unknown or not the Company’s', async () => {
    const { element } = await render('/licenses/platforms/7d1c0b9e-0000-4000-8000-000000000000');
    expect(text(element.querySelector('nw-data-state'))).toContain(t.notFoundTitle);
    expect(element.querySelector('table')).toBeNull();
  });

  it('says it is not available in a build without the mock, and handles error and empty', async () => {
    const unavailable = await render(SCHOOL, owner, { gateway: 'unavailable' });
    expect(text(unavailable.element.querySelector('nw-data-state'))).toContain(
      en.licenses.states.notInBuildTitle,
    );
    expect(unavailable.element.querySelector('table')).toBeNull();
    TestBed.resetTestingModule();
    const failing = await render(SCHOOL, owner, { scenario: 'error' });
    expect(text(failing.element.querySelector('nw-data-state'))).toContain(
      en.licenses.states.errorTitle,
    );
    failing.element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await failing.settle();
    expect(failing.platformSpy).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
    const empty = await render(SCHOOL, owner, { scenario: 'empty' });
    expect(text(empty.element.querySelector('nw-data-state'))).toContain(t.emptyTitle);
  });

  it('changes nothing in the world', async () => {
    const { world } = await render();
    expect(world.snapshot()).toEqual(demoWorldSeed(NOW));
  });
});
