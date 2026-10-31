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
import { AssistanceRecoveryFacade } from '../application/assistance-recovery.facade';
import { AssistanceGateway, UnavailableAssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from '../data-access/assistance.mock';
import { AssistanceRecoveryPage } from './assistance-recovery.page';

const t = en.assistanceCases;
const rv = t.recovery;
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
      AssistanceRecoveryPage,
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
      AssistanceRecoveryFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const instance = TestBed.inject(AssistanceGateway);
  const spies = {
    recoveryObligations: vi.spyOn(instance, 'recoveryObligations'),
    recoveryObligation: vi.spyOn(instance, 'recoveryObligation'),
    caseDetail: vi.spyOn(instance, 'caseDetail'),
    lateSettlement: vi.spyOn(instance, 'lateSettlement'),
  };
  const fixture = TestBed.createComponent(AssistanceRecoveryPage);
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
const rows = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-recovery-list] article')].map((a) => [
    a.dataset['request'],
    a.dataset['state'],
  ]);
const rowOf = (element: HTMLElement, n: number) =>
  element.querySelector<HTMLElement>(
    `[data-recovery-list] article[data-request="${caseOf(n).request.id}"]`,
  )!;
const amounts = (row: HTMLElement) =>
  [...row.querySelectorAll<HTMLElement>('[data-recovery-summary] [data-amount]')].map((dd) => [
    dd.dataset['amount'],
    text(dd.querySelector('bdi')),
  ]);

describe('Assistance recovery and surplus page (A9)', { timeout: 60_000 }, () => {
  afterEach(() => vi.restoreAllMocks());

  it('labels the data as simulated, and links back to the directory', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(rv.title);
    expect(text(element.querySelector('[data-demo]'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('[data-simulation]'))).toBe(rv.simulation);
    expect(element.querySelector('[data-back]')?.getAttribute('href')).toBe('/billing/assistance');
  });

  it('lists the obligations newest opened first, each linked to its case', async () => {
    const { element } = await render();
    expect(rows(element)).toEqual([
      [caseOf(13).request.id, 'open'],
      [caseOf(14).request.id, 'recovered'],
    ]);
    expect(text(element.querySelector('[data-count]'))).toBe(rv.count.replace('{{shown}}', '2'));
    expect(
      [...element.querySelectorAll('[data-recovery-list] [data-case-link]')].map((a) =>
        a.getAttribute('href'),
      ),
    ).toEqual([13, 14].map((n) => `/billing/assistance/${caseOf(n).request.id}`));
  });

  it('owed, recovered and outstanding are Core’s values, kept apart and tagged by source', async () => {
    const { element } = await render();
    expect(amounts(rowOf(element, 13))).toEqual([
      ['base', expect.stringMatching(/TND\s?45\.000/)],
      ['recovered', expect.stringMatching(/TND\s?15\.000/)],
      ['outstanding', expect.stringMatching(/TND\s?30\.000/)],
    ]);
    expect(amounts(rowOf(element, 14))).toEqual([
      ['base', expect.stringMatching(/TND\s?30\.000/)],
      ['recovered', expect.stringMatching(/TND\s?30\.000/)],
      ['outstanding', expect.stringMatching(/TND\s?0\.000/)],
    ]);
    const recovered = rowOf(element, 13).querySelector(
      '[data-amount="recovered"] adm-assistance-source-tag',
    );
    expect(recovered?.getAttribute('data-source')).toBe('fact');
  });

  it('a payment in progress is never a recovery; the open obligation restricts the Organization (T3)', async () => {
    const { element } = await render();
    const open = rowOf(element, 13);
    expect(text(open.querySelector('[data-in-progress]'))).toContain(rv.inProgressExplain);
    expect(
      [...open.querySelectorAll<HTMLElement>('[data-recovery-channels] li')].map(
        (li) => li.dataset['channel'],
      ),
    ).toEqual(['ended', 'active']);
    expect(
      [...open.querySelectorAll<HTMLElement>('[data-restriction]')].map(
        (li) => li.dataset['restriction'],
      ),
    ).toEqual(['T3']);
    const recovered = rowOf(element, 14);
    expect(recovered.querySelector('[data-in-progress]')).toBeNull();
    // Restrictions are the ORGANIZATION's: case 14 is recovered, but its Organization still has case 13 open, so T3 stays.
    expect(caseOf(14).request.organizationId).toBe(caseOf(13).request.organizationId);
    expect(text(recovered.querySelector('[data-restriction="T3"]'))).toBe(
      `T3 ${t.case.restriction.t3}`,
    );
  });

  it('surplus payable to the Organization: owed, and recorded by the owner but still owed until confirmed', async () => {
    const { element } = await render();
    const surpluses = [...rowOf(element, 14).querySelectorAll<HTMLElement>('[data-surplus]')];
    expect(surpluses.map((li) => li.dataset['surplus'])).toEqual(['owed', 'externalRecorded']);
    expect(text(surpluses[0])).toMatch(
      new RegExp(`^TND\\s?2\\.000 ${t.case.recovery.surplus.owedToOrganization}`),
    );
    expect(surpluses[1]!.querySelector('[data-awaiting-confirmation]')).not.toBeNull();
    expect(
      surpluses[1]!.querySelector('adm-assistance-source-tag')?.getAttribute('data-source'),
    ).toBe('decision');
    expect(text(rowOf(element, 13).querySelector('[data-surpluses-none]'))).toBe(rv.surplusNone);
    // Each payment shows Core's split; an entirely-surplus one recovers nothing.
    const payments = [...rowOf(element, 14).querySelectorAll('[data-payment]')].map(text);
    expect(payments).toHaveLength(3);
    expect(payments[2]).toMatch(/recovered TND\s?0\.000, surplus TND\s?5\.000/);
  });

  it('shows each history oldest first, and the related late settlements (none here)', async () => {
    const { element } = await render();
    const kinds = [
      ...rowOf(element, 14).querySelectorAll<HTMLElement>('[data-recovery-history] li'),
    ].map((li) => li.dataset['kind']);
    expect(kinds[0]).toBe('opened');
    expect(kinds).toContain('recovered');
    const times = [...rowOf(element, 14).querySelectorAll('[data-recovery-history] time')].map(
      (x) => Date.parse(x.getAttribute('datetime') ?? ''),
    );
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(text(rowOf(element, 13).querySelector('[data-related-late]'))).toBe(rv.noLateSettlement);
    expect(text(rowOf(element, 13).querySelector('[data-recovery-why]'))).toContain(rv.whyLoss);
  });

  it('filters by state and by a surplus still owed', async () => {
    const r = await render();
    await r.select('state', 'open');
    expect(rows(r.element)).toEqual([[caseOf(13).request.id, 'open']]);
    await r.select('state', 'recovered');
    expect(rows(r.element)).toEqual([[caseOf(14).request.id, 'recovered']]);
    await r.select('state', '');
    await r.select('surplus', 'owed');
    expect(rows(r.element)).toEqual([[caseOf(14).request.id, 'recovered']]);
    expect(r.spies.recoveryObligations).toHaveBeenLastCalledWith(
      expect.anything(),
      { surplusOwed: true },
      { after: null, limit: 10 },
    );
    await r.select('state', 'open');
    expect(text(r.element.querySelector('[data-none]'))).toBe(rv.none);
  });

  it('never shows another Company’s obligation, payment or surplus', async () => {
    const { element } = await render();
    const html = element.innerHTML;
    for (const x of FOREIGN) {
      expect(html).not.toContain(x.request.id);
      if (x.recovery) expect(html).not.toContain(x.recovery.id);
    }
  });

  it('never asks the gateway for an operator', async () => {
    const { element, spies } = await render({ actor: operator });
    expect(text(element.querySelector('nw-data-state'))).toContain(rv.forbiddenDescription);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
    expect(element.querySelector('[data-section]')).toBeNull();
  });

  it('not in this build, unavailable with retry, and an empty Company', async () => {
    let r = await render({ gateway: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(text(r.element.querySelector('nw-data-state'))).toContain(rv.notInBuildDescription);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.unavailableTitle);
    const calls = r.spies.recoveryObligations.mock.calls.length;
    r.element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await r.settle();
    expect(r.spies.recoveryObligations.mock.calls.length).toBe(calls + 1);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'empty' });
    expect(text(r.element.querySelector('[data-none]'))).toBe(rv.none);
  });

  it('is read only: no command, form or dialog; reads only; nothing sent over the network', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { element } = await render();
    expect(element.querySelectorAll('form, input, textarea, [role="dialog"]')).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(2);
    expect(element.querySelectorAll('button')).toHaveLength(0);
    expect(text(element)).toContain(rv.readOnly);
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
    // Subheadings sit one level below each card's heading.
    for (const h of element.querySelectorAll('[data-recovery-list] [role="heading"]'))
      expect(h.getAttribute('aria-level')).toBe('4');
    for (const badge of element.querySelectorAll('nw-status-badge')) {
      expect(badge.querySelector('nw-icon')).not.toBeNull();
      expect(text(badge).length).toBeGreaterThan(0);
    }
    // Words never run together for a screen reader: an amount and its status are separate words.
    expect(text(rowOf(element, 14).querySelector('[data-surplus]'))).toMatch(/\d \S/);
  });

  it('renders in French and Arabic with every key translated', async () => {
    for (const lang of ['fr', 'ar'] as const) {
      const r = await render({ lang });
      expect(r.element.textContent, lang).not.toMatch(/assistanceCases\.|shell\./);
      expect(text(r.element.querySelector('h1'))).toBe(
        (lang === 'fr' ? fr : ar).assistanceCases.recovery.title,
      );
      TestBed.resetTestingModule();
    }
  });
});
