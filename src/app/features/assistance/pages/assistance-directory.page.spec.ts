import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
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
import {
  ASSISTANCE_DIRECTORY_PAGE_SIZE,
  AssistanceDirectoryFacade,
} from '../application/assistance-directory.facade';
import { AssistanceGateway, UnavailableAssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from '../data-access/assistance.mock';
import { AssistanceDirectoryPage } from './assistance-directory.page';

const t = en.assistanceCases;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = CASES.filter((c) => c.companyId === DEMO_COMPANY_ID);
const FOREIGN = CASES.filter((c) => c.companyId !== DEMO_COMPANY_ID);
const caseOf = (n: number) => OWN[n - 1]!;

@Component({ template: '' })
class Blank {}

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

const DEMO_BUILD: AppEnvironment = {
  production: false,
  demo: { load: () => Promise.reject(new Error('unused')) },
};

async function render(
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
    latency = 0,
  }: { gateway?: 'mock' | 'unavailable'; scenario?: AssistanceDemoScenario; latency?: number } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      AssistanceDirectoryPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'billing/assistance', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      { provide: APP_ENVIRONMENT, useValue: DEMO_BUILD },
      { provide: DEMO_LATENCY_MS, useValue: latency },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ASSISTANCE_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: AssistanceGateway,
        useClass: gateway === 'mock' ? MockAssistanceGateway : UnavailableAssistanceGateway,
      },
      ScopeContext,
      AssistanceDirectoryFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const gatewayInstance = TestBed.inject(AssistanceGateway);
  const spy = vi.spyOn(gatewayInstance, 'cases');
  await TestBed.inject(Router).navigateByUrl('/billing/assistance');
  const fixture = TestBed.createComponent(AssistanceDirectoryPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  const ready = () =>
    element.querySelector('table, [data-no-match], nw-data-state:not([state="loading"])');
  if (latency === 0) {
    for (let i = 0; i < 20 && !ready(); i++) await settle();
    await settle();
  } else {
    fixture.detectChanges();
  }
  return { element, spy, settle, fixture, gateway: gatewayInstance };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const rowIds = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('tbody tr')].map((r) => r.dataset['request']);
const selects = (element: HTMLElement) => [...element.querySelectorAll('select')];

async function choose(
  element: HTMLElement,
  settle: () => Promise<void>,
  index: number,
  value: string,
): Promise<void> {
  const select = selects(element)[index]!;
  select.value = value;
  select.dispatchEvent(new Event('change'));
  await settle();
  await settle();
}

async function search(element: HTMLElement, settle: () => Promise<void>, value: string) {
  const input = element.querySelector<HTMLInputElement>('[data-search] input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  element.querySelector('[data-search]')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await settle();
  await settle();
}

const newestFirst = [...OWN].sort((a, b) => b.request.consentAt.localeCompare(a.request.consentAt));

describe('Assistance case directory (A4)', { timeout: 20_000 }, () => {
  it('shows the first page of cases, newest consent first, clearly labelled as simulated', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(text(element.querySelector('[data-demo]'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('[data-simulation]'))).toBe(t.simulation);
    expect(rowIds(element)).toEqual(
      newestFirst.slice(0, ASSISTANCE_DIRECTORY_PAGE_SIZE).map((c) => c.request.id),
    );
    expect(text(element.querySelector('[data-count]'))).toBe(
      'Showing the first 10 cases; more are available',
    );
    expect(text(element.querySelector('.assistance__hint'))).toBe(t.readOnly);
    // A7: the disputes and exceptions overview, one link away.
    const disputes = element.querySelector('[data-disputes-link]');
    expect(disputes?.getAttribute('href')).toBe('/billing/assistance/disputes');
    expect(text(disputes)).toBe(t.disputes.link);
  });

  it('shows Core states only: status, collection, settlement and indicators; no amount', async () => {
    const { element } = await render();
    const row = (n: number) =>
      element.querySelector(`tr[data-request="${caseOf(n).request.id}"]`) as HTMLElement;
    const cells = (n: number) => [...row(n).querySelectorAll('th, td')].map((c) => text(c));
    // Overdue cash return with an open dispute.
    const overdue = cells(8);
    expect(overdue[3]).toBe(t.state.cashCollected);
    const collection = row(8).querySelectorAll('[data-collection] > span');
    // A6: the collection is tagged as the Organization's report.
    expect(text(collection[0])).toBe(`${t.collection.collected} ${t.case.source.report}`);
    expect(text(collection[1])).toMatch(/^Settle by .+$/);
    expect(overdue[5]).toBe(`${t.oversight.settlement.closedUnpaid} ${t.case.source.fact}`);
    expect([...row(8).querySelectorAll('[data-indicators] li')].map((li) => text(li))).toEqual([
      t.indicator.overdue,
      t.indicator.dispute,
    ]);
    // Pending: nothing collected, no settlement, no indicator.
    expect(cells(1).slice(3)).toEqual([
      t.state.pending,
      t.collection.notCollected,
      t.channel.none,
      t.oversight.cashReturn.none,
      t.indicator.none,
    ]);
    // Settled cases say "collected" (a report) without a deadline.
    expect(cells(9)[4]).toBe(`${t.collection.collected} ${t.case.source.report}`);
    const table = text(element.querySelector('table'));
    expect(table).not.toMatch(/\bTND\b|[€$£]|46[ ,.]?500|45[ ,.]?000|\d[.,]\d{3}\b/);
  });

  it('links each case to its page (A5), its Organization and Platform, and names the Platform', async () => {
    const { element } = await render();
    const row = element.querySelector(`tr[data-request="${caseOf(1).request.id}"]`)!;
    const links = [...row.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      `/billing/assistance/${caseOf(1).request.id}`,
      `/platforms/${DEMO_SCHOOL_PLATFORM_ID}/organizations/${caseOf(1).request.organizationId}`,
      `/platforms/${DEMO_SCHOOL_PLATFORM_ID}`,
    ]);
    expect(text(row.querySelectorAll('td')[1])).toBe('Nawara School');
    expect(text(row.querySelector('th'))).toContain(caseOf(1).request.id);
  });

  it('pages with "Show more" (keyset), then stops', async () => {
    const { element, settle, spy } = await render();
    element.querySelector<HTMLButtonElement>('[data-more]')!.click();
    await settle();
    await settle();
    expect(rowIds(element)).toEqual(newestFirst.map((c) => c.request.id));
    expect(element.querySelector('[data-more]')).toBeNull();
    expect(text(element.querySelector('[data-count]'))).toBe(`Showing ${OWN.length} cases`);
    expect(spy.mock.calls.map((c) => c[2])).toEqual([
      { after: null, limit: 10 },
      { after: newestFirst[9]!.request.id, limit: 10 },
    ]);
  });

  it('filters by status, attention and Platform, and orders both ways', async () => {
    const { element, settle } = await render();
    await choose(element, settle, 1, 'settled');
    expect(rowIds(element)!.length).toBe(5);
    await choose(element, settle, 1, '');
    await choose(element, settle, 3, 'disputed');
    expect(rowIds(element).sort()).toEqual(
      [caseOf(4), caseOf(8), caseOf(10)].map((c) => c.request.id).sort(),
    );
    await choose(element, settle, 3, 'all');
    await choose(element, settle, 4, 'consentOldest');
    expect(rowIds(element)[0]).toBe(caseOf(14).request.id);
    // Nawara Drive has no assistance: the filters match nothing, and clearing restores everything.
    await choose(element, settle, 0, DEMO_DRIVE_PLATFORM_ID);
    expect(text(element.querySelector('[data-no-match]'))).toContain(t.list.noMatch);
    element.querySelector<HTMLButtonElement>('[data-no-match] button')!.click();
    await settle();
    await settle();
    expect(rowIds(element)).toHaveLength(ASSISTANCE_DIRECTORY_PAGE_SIZE);
    expect(selects(element).map((s) => s.value)).toEqual(['', '', '', 'all', 'consentNewest']);
  });

  it('finds a case by its full reference; refuses a partial one without asking', async () => {
    const { element, settle, spy } = await render();
    const calls = spy.mock.calls.length;
    await search(element, settle, caseOf(9).request.id.slice(0, 13));
    expect(text(element.querySelector('[data-search]'))).toContain(t.search.invalid);
    expect(spy.mock.calls.length).toBe(calls);
    await search(element, settle, ` ${caseOf(9).request.id.toUpperCase()} `);
    expect(rowIds(element)).toEqual([caseOf(9).request.id]);
    expect(spy.mock.calls.at(-1)?.[1]).toMatchObject({ requestId: caseOf(9).request.id });
  });

  it('another Company’s, another Platform’s or an unknown reference: one answer, not found', async () => {
    const { element, settle } = await render();
    for (const reference of [FOREIGN[0]!.request.id, 'a551c0de-0000-4000-8000-0000000fffff']) {
      await search(element, settle, reference);
      expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notFoundTitle);
    }
    await choose(element, settle, 0, DEMO_DRIVE_PLATFORM_ID);
    await search(element, settle, caseOf(1).request.id);
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notFoundTitle);
    element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await settle();
    await settle();
    expect(rowIds(element)).toHaveLength(ASSISTANCE_DIRECTORY_PAGE_SIZE);
  });

  it('never asks the gateway for an operator, whatever their Platform assignments', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('table, [data-search]')).toBeNull();
  });

  it('says it is not available when no adapter is bound (every non-demo build)', async () => {
    const { element } = await render(owner, { gateway: 'unavailable' });
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(element.querySelector('table, [data-search], [data-filters]')).toBeNull();
  });

  it('empty, unavailable (with retry) and loading states', async () => {
    let r = await render(owner, { scenario: 'empty' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.emptyTitle);
    TestBed.resetTestingModule();
    r = await render(owner, { scenario: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.unavailableTitle);
    const calls = r.spy.mock.calls.length;
    r.element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await r.settle();
    expect(r.spy.mock.calls.length).toBe(calls + 1);
    TestBed.resetTestingModule();
    r = await render(owner, { latency: 60_000 });
    await r.fixture.whenStable();
    expect(r.element.querySelector('nw-data-state[state="loading"]')).not.toBeNull();
  });

  it('is operable by keyboard with native controls, and offers no command', async () => {
    const { element } = await render();
    const controls = [...element.querySelectorAll('input, select, button, a, [tabindex]')];
    for (const c of controls) expect(c.getAttribute('tabindex')).not.toBe('-1');
    expect(element.querySelector('.assistance__table-box')?.getAttribute('tabindex')).toBe('0');
    for (const select of selects(element)) expect(select.closest('nw-form-field')).not.toBeNull();
    expect(element.querySelector('[data-search]')?.getAttribute('role')).toBe('search');
    const buttons = [...element.querySelectorAll('button')].map((b) => text(b));
    expect(buttons).toEqual([t.search.submit, t.list.more]);
    expect(element.querySelector('[role="dialog"], textarea')).toBeNull();
  });

  it('keeps references and ids left-to-right inside a right-to-left page', async () => {
    const { element } = await render();
    for (const code of element.querySelectorAll('code'))
      expect(code.getAttribute('dir') ?? code.closest('[dir]')?.getAttribute('dir')).toBe('ltr');
    expect(element.querySelector('[data-search] input')?.getAttribute('dir')).toBe('ltr');
  });

  it('reads cases only: no fetch, no XHR, no other gateway method', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { element, settle, gateway } = await render();
    const others = (
      [
        'caseDetail',
        'timeline',
        'settlement',
        'cashReturns',
        'disputes',
        'lateSettlements',
        'lateSettlement',
        'recoveryObligations',
        'recoveryObligation',
      ] as const
    ).map((name) => vi.spyOn(gateway, name));
    element.querySelector<HTMLButtonElement>('[data-more]')!.click();
    await settle();
    for (const spy of others) expect(spy).not.toHaveBeenCalled();
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe('Assistance directory oversight (A6)', { timeout: 30_000 }, () => {
  const cell = (element: HTMLElement, n: number, name: string) =>
    element.querySelector<HTMLElement>(`tr[data-request="${caseOf(n).request.id}"] [data-${name}]`);

  it('a reported collection is tagged Reported; settlement and cash return say what they are', async () => {
    const { element, settle } = await render();
    element.querySelector<HTMLButtonElement>('[data-more]')!.click();
    await settle();
    await settle();
    for (const c of OWN.filter((x) => x.request.collection !== null)) {
      const tag = element.querySelector(
        `tr[data-request="${c.request.id}"] [data-collection] adm-assistance-source-tag`,
      );
      expect(tag?.getAttribute('data-source')).toBe('report');
    }
    expect(cell(element, 5, 'settlement')?.dataset['value']).toBe('verified');
    expect(
      cell(element, 5, 'settlement')
        ?.querySelector('adm-assistance-source-tag')
        ?.getAttribute('data-source'),
    ).toBe('fact');
    expect(cell(element, 4, 'settlement')?.dataset['value']).toBe('inProgress');
    expect(cell(element, 6, 'settlement')?.dataset['value']).toBe('uncertain');
    expect(cell(element, 11, 'settlement')?.dataset['value']).toBe('lateUnapplied');
    expect(cell(element, 12, 'settlement')?.dataset['value']).toBe('verifiedLate');
    expect([7, 8, 10, 12, 1].map((n) => cell(element, n, 'cash-return')?.dataset['value'])).toEqual(
      ['confirmed', 'owed', 'reported', 'superseded', 'none'],
    );
    expect(text(cell(element, 10, 'cash-return'))).toContain(t.oversight.cashReturn.reported);
  });

  it('filters by settlement state and by each new attention, through the gateway', async () => {
    const { element, settle, spy } = await render();
    await choose(element, settle, 2, 'closed');
    expect(rowIds(element).sort()).toEqual(
      [7, 8, 10, 11, 12].map((n) => caseOf(n).request.id).sort(),
    );
    expect(spy.mock.calls.at(-1)?.[1]).toMatchObject({ channel: 'closed' });
    await choose(element, settle, 2, '');
    const attention: [string, number[]][] = [
      ['cashReturnOwed', [8, 10, 11]],
      ['lateUnapplied', [11]],
      ['recoveryOpen', [13]],
    ];
    for (const [value, cases] of attention) {
      await choose(element, settle, 3, value);
      expect(rowIds(element).sort(), value).toEqual(cases.map((n) => caseOf(n).request.id).sort());
    }
  });
});

describe('Assistance case directory catalogs (A4)', () => {
  const keys = (node: unknown, prefix = ''): string[] =>
    typeof node === 'object' && node !== null
      ? Object.entries(node).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
      : [prefix];
  const values = (node: unknown): string[] =>
    typeof node === 'object' && node !== null
      ? Object.values(node).flatMap(values)
      : [String(node)];

  it('has every directory key in English, French and Arabic, none empty', () => {
    expect(keys(fr.assistanceCases)).toEqual(keys(en.assistanceCases));
    expect(keys(ar.assistanceCases)).toEqual(keys(en.assistanceCases));
    for (const catalog of [en, fr, ar]) {
      for (const value of values(catalog.assistanceCases)) expect(value.trim()).not.toBe('');
      expect(catalog.titles.assistance).not.toBe('');
      expect(catalog.shell.breadcrumb.assistance).not.toBe('');
      expect(catalog.billing.related.assistance).not.toBe('');
    }
    // Arabic copy is Arabic, not an untranslated English string.
    expect(ar.assistanceCases.header.title).not.toBe(en.assistanceCases.header.title);
    expect(ar.assistanceCases.header.title).toMatch(/[؀-ۿ]/);
  });
});
