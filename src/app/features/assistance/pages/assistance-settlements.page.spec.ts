import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
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
import { AssistanceSettlementsFacade } from '../application/assistance-settlements.facade';
import { AssistanceGateway, UnavailableAssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from '../data-access/assistance.mock';
import { AssistanceSettlementsPage } from './assistance-settlements.page';

const t = en.assistanceCases;
const s = t.settlements;
const l = t.late;
const ret = t.returns;
const NOW = Date.parse('2026-10-30T12:00:00Z');
const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = CASES.filter((x) => x.companyId === DEMO_COMPANY_ID);
const FOREIGN = CASES.filter((x) => x.companyId !== DEMO_COMPANY_ID);
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

async function render({
  actor = owner,
  gateway = 'mock',
  scenario = 'normal',
  lang = 'en',
}: {
  actor?: Actor;
  gateway?: 'mock' | 'unavailable';
  scenario?: AssistanceDemoScenario;
  lang?: 'en' | 'fr' | 'ar';
} = {}) {
  TestBed.configureTestingModule({
    imports: [
      AssistanceSettlementsPage,
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'billing/assistance', component: Blank },
        { path: 'billing/assistance/:requestId', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ASSISTANCE_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: AssistanceGateway,
        useClass: gateway === 'mock' ? MockAssistanceGateway : UnavailableAssistanceGateway,
      },
      ScopeContext,
      AssistanceSettlementsFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const instance = TestBed.inject(AssistanceGateway);
  const spies = {
    lateSettlements: vi.spyOn(instance, 'lateSettlements'),
    lateSettlement: vi.spyOn(instance, 'lateSettlement'),
    caseDetail: vi.spyOn(instance, 'caseDetail'),
    cashReturnCases: vi.spyOn(instance, 'cashReturnCases'),
  };
  const fixture = TestBed.createComponent(AssistanceSettlementsPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  // Wait for a final state of every list (never only "no loading indicator yet", which is also true before the first render).
  const pending = () =>
    element.querySelector('nw-data-state[state="loading"]') !== null ||
    element.querySelector('[data-section], nw-data-state') === null;
  for (let i = 0; i < 60 && pending(); i++) await settle();
  await settle();
  const select = async (filter: string, value: string) => {
    const control = element.querySelector<HTMLSelectElement>(`select[data-filter="${filter}"]`)!;
    control.value = value;
    control.dispatchEvent(new Event('change'));
    await settle();
    await settle();
  };
  return { element, spies, settle, select };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const lateRows = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-late-list] article')].map((a) => [
    a.dataset['request'],
    a.querySelector<HTMLElement>('[data-standing]')?.dataset['standing'],
  ]);
const returnRows = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-return-list] article')].map((a) => [
    a.dataset['request'],
    a.querySelector<HTMLElement>('adm-assistance-return-standing')?.dataset['returnState'],
  ]);
const lateOf = (element: HTMLElement, n: number) =>
  element.querySelector<HTMLElement>(
    `[data-late-list] article[data-request="${caseOf(n).request.id}"]`,
  )!;
const returnOf = (element: HTMLElement, n: number) =>
  element.querySelector<HTMLElement>(
    `[data-return-list] article[data-request="${caseOf(n).request.id}"]`,
  )!;

describe('Assistance late settlements and cash returns page (A8)', { timeout: 60_000 }, () => {
  afterEach(() => vi.restoreAllMocks());

  it('labels the data as simulated, and links back to the directory', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(s.title);
    expect(text(element.querySelector('[data-demo]'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('[data-simulation]'))).toBe(s.simulation);
    expect(element.querySelector('[data-back]')?.getAttribute('href')).toBe('/billing/assistance');
  });

  it('lists the late settlements newest recorded first: pending without basis, pending but blocked, applied', async () => {
    const { element } = await render();
    expect(lateRows(element)).toEqual([
      [caseOf(11).request.id, 'needsBasis'],
      [caseOf(8).request.id, 'refused'],
      [caseOf(12).request.id, 'applied'],
    ]);
    // Pending is never shown as applied; only case 12 carries the owner's decision.
    const decisions = [
      ...element.querySelectorAll<HTMLElement>('[data-late-list] [data-decision]'),
    ].map((b) => b.dataset['decision']);
    expect(decisions).toEqual(['pending', 'pending', 'applied']);
    expect(text(element.querySelector('[data-section="late-settlements"] [data-count]'))).toBe(
      s.late.count.replace('{{shown}}', '3'),
    );
    const links = [...element.querySelectorAll('[data-late-list] [data-case-link]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([11, 8, 12].map((n) => `/billing/assistance/${caseOf(n).request.id}`));
  });

  it('explains each standing: the blocking refusal, the missing basis, the applied basis, and the receipt Core requires', async () => {
    const { element } = await render();
    const blocked = lateOf(element, 8);
    expect(blocked.querySelector('[data-blocked]')).not.toBeNull();
    expect(blocked.querySelector('[data-refusal]')?.getAttribute('data-refusal')).toBe(
      'dispute_open',
    );
    expect(text(blocked.querySelector('[data-refusal]'))).toBe(l.refusal.disputeOpen);
    expect(text(blocked.querySelector('[data-attestation]'))).toContain(
      t.case.late.attestation.cashNotReturned,
    );
    const pending = lateOf(element, 11);
    expect(text(pending.querySelector('[data-standing-text]'))).toBe(l.standing.needsBasis);
    expect(text(pending.querySelector('[data-evidence]'))).toBe(s.late.noEvidence);
    expect(pending.querySelector('[data-would-supersede]')).not.toBeNull();
    for (const row of [pending, blocked]) {
      const receipt = text(row.querySelector('[data-receipt]'));
      expect(receipt).toContain('late_settlement_apply');
      expect(receipt).toContain('billing.late_settlement.apply');
    }
    const applied = lateOf(element, 12);
    expect(text(applied.querySelector('[data-standing-text]'))).toBe(
      l.standing.applied.replace('{{reason}}', l.applicationReason.attested),
    );
    expect(applied.querySelector('[data-receipt]')).toBeNull();
    expect(applied.querySelector('[data-would-supersede]')).toBeNull();
  });

  it('shows each history oldest first, with facts, the beneficiary’s statement and the owner’s decision kept apart', async () => {
    const { element } = await render();
    const history = (n: number) =>
      [...lateOf(element, n).querySelectorAll<HTMLElement>('[data-late-history] li')].map((li) => [
        li.dataset['kind'],
        li.dataset['source'],
      ]);
    expect(history(12)).toEqual([
      ['lateSuccess', 'fact'],
      ['recorded', 'fact'],
      ['attested', 'report'],
      ['applied', 'decision'],
    ]);
    expect(history(11)).toEqual([
      ['lateSuccess', 'fact'],
      ['recorded', 'fact'],
    ]);
    const times = [...lateOf(element, 12).querySelectorAll('[data-late-history] time')].map((x) =>
      Date.parse(x.getAttribute('datetime') ?? ''),
    );
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('shows the Organization’s T1/T2 restrictions and each case’s cash return', async () => {
    const { element } = await render();
    const restrictions = (n: number) =>
      [...lateOf(element, n).querySelectorAll<HTMLElement>('[data-restriction]')].map(
        (li) => li.dataset['restriction'],
      );
    expect(restrictions(11)).toEqual(['T1', 'T2']);
    expect(restrictions(8)).toEqual(['T1', 'T2']);
    expect(text(lateOf(element, 11).querySelector('[data-restriction="T1"]'))).toContain(
      t.case.restriction.t1,
    );
    expect(
      lateOf(element, 12).querySelector<HTMLElement>(
        '[data-cash-return] adm-assistance-return-standing',
      )?.dataset['returnState'],
    ).toBe('superseded_by_settlement');
  });

  it('filters late settlements by the owner’s decision', async () => {
    const r = await render();
    await r.select('late', 'applied');
    expect(lateRows(r.element)).toEqual([[caseOf(12).request.id, 'applied']]);
    await r.select('late', 'unapplied');
    expect(lateRows(r.element).map(([id]) => id)).toEqual([11, 8].map((n) => caseOf(n).request.id));
    expect(r.spies.lateSettlements).toHaveBeenLastCalledWith(
      expect.anything(),
      { status: 'unapplied' },
      { after: null, limit: 10 },
    );
  });

  it('monitors every cash return: owed, reported (not complete), confirmed, superseded', async () => {
    const { element } = await render();
    expect(returnRows(element)).toEqual([
      [caseOf(11).request.id, 'open'],
      [caseOf(8).request.id, 'open'],
      [caseOf(12).request.id, 'superseded_by_settlement'],
      [caseOf(10).request.id, 'return_reported'],
      [caseOf(7).request.id, 'confirmed_returned'],
    ]);
    const awaiting = (n: number) => text(returnOf(element, n).querySelector('[data-awaiting]'));
    expect(awaiting(11)).toBe(ret.awaiting.organizationReport);
    // A reported return is still owed: never a completion.
    expect(awaiting(10)).toBe(ret.awaiting.beneficiaryConfirmation);
    expect(awaiting(7)).toBe(ret.discharged.confirmed);
    expect(awaiting(12)).toBe(ret.discharged.superseded);
    // The report and the confirmation are separate, each tagged as who stated it.
    const sources = (n: number, field: string) =>
      returnOf(element, n)
        .querySelector(`[${field}] adm-assistance-source-tag`)
        ?.getAttribute('data-source');
    expect(sources(10, 'data-reported-return')).toBe('report');
    expect(returnOf(element, 10).querySelector('[data-confirmed-at]')).toBeNull();
    expect(sources(7, 'data-confirmed-at')).toBe('report');
    expect(sources(12, 'data-superseded-at')).toBe('decision');
  });

  it('disputed returns: the confirmation of a reported return is held, an owed one is not', async () => {
    const r = await render();
    expect(returnOf(r.element, 10).querySelector('[data-held]')).not.toBeNull();
    expect(returnOf(r.element, 8).querySelector('[data-held]')).toBeNull();
    expect(returnOf(r.element, 8).querySelector('[data-disputed]')).not.toBeNull();
    await r.select('return-dispute', 'open');
    expect(returnRows(r.element).map(([id]) => id)).toEqual(
      [8, 10].map((n) => caseOf(n).request.id),
    );
    await r.select('return-state', 'return_reported');
    expect(returnRows(r.element)).toEqual([[caseOf(10).request.id, 'return_reported']]);
    await r.select('return-state', 'confirmed_returned');
    expect(text(r.element.querySelector('[data-none="returns"]'))).toBe(s.returns.none);
  });

  it('never shows another Company’s late settlement or cash return', async () => {
    const { element } = await render();
    const html = element.innerHTML;
    for (const x of FOREIGN) {
      expect(html).not.toContain(x.request.id);
      for (const late of x.lateSettlements) expect(html).not.toContain(late.id);
      for (const o of x.cashReturns) expect(html).not.toContain(o.id);
    }
  });

  it('never asks the gateway for an operator', async () => {
    const { element, spies } = await render({ actor: operator });
    expect(text(element.querySelector('nw-data-state'))).toContain(s.forbiddenDescription);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    expect(element.querySelector('[data-section]')).toBeNull();
  });

  it('not in this build, unavailable with retry, and an empty Company', async () => {
    let r = await render({ gateway: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(text(r.element.querySelector('nw-data-state'))).toContain(s.notInBuildDescription);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'unavailable' });
    expect(
      text(r.element.querySelector('[data-section="late-settlements"] nw-data-state')),
    ).toContain(t.states.unavailableTitle);
    expect(r.element.querySelector('[data-returns-unavailable]')).not.toBeNull();
    const calls = r.spies.lateSettlements.mock.calls.length;
    r.element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await r.settle();
    expect(r.spies.lateSettlements.mock.calls.length).toBe(calls + 1);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'empty' });
    expect(text(r.element.querySelector('[data-none="late"]'))).toBe(s.late.none);
    expect(text(r.element.querySelector('[data-none="returns"]'))).toBe(s.returns.none);
  });

  it('is read only: no command, form or dialog; reads only; nothing sent over the network', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { element } = await render();
    expect(element.querySelectorAll('form, input, textarea, [role="dialog"]')).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(3);
    expect(element.querySelectorAll('button')).toHaveLength(0);
    expect(text(element)).toContain(s.readOnly);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('is keyboard and screen-reader friendly, with references kept left-to-right', async () => {
    const { element } = await render();
    expect(element.querySelector('a, button, select')?.hasAttribute('data-back')).toBe(true);
    for (const focusable of element.querySelectorAll('a, select, [tabindex]'))
      expect(focusable.getAttribute('tabindex')).not.toBe('-1');
    for (const control of element.querySelectorAll('select'))
      expect(control.labels?.length ?? 0).toBeGreaterThan(0);
    for (const code of element.querySelectorAll('code'))
      expect(code.getAttribute('dir')).toBe('ltr');
    for (const x of element.querySelectorAll('section, article'))
      expect(
        element.querySelector(`#${CSS.escape(x.getAttribute('aria-labelledby') ?? '')}`),
      ).not.toBeNull();
    expect(element.querySelectorAll('[data-count][role="status"]')).toHaveLength(2);
    for (const badge of element.querySelectorAll('nw-status-badge')) {
      expect(badge.querySelector('nw-icon')).not.toBeNull();
      expect(text(badge).length).toBeGreaterThan(0);
    }
    // History is an ordered list; each time is machine-readable.
    for (const time of element.querySelectorAll('[data-late-history] time'))
      expect(Number.isNaN(Date.parse(time.getAttribute('datetime') ?? ''))).toBe(false);
  });

  it('renders in French and Arabic with every key translated', async () => {
    for (const lang of ['fr', 'ar'] as const) {
      const r = await render({ lang });
      expect(r.element.textContent, lang).not.toMatch(/assistanceCases\.|shell\./);
      expect(text(r.element.querySelector('h1'))).toBe(
        (lang === 'fr' ? fr : ar).assistanceCases.settlements.title,
      );
      TestBed.resetTestingModule();
    }
  });
});
