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
  AssistanceCaseFacade,
  assistanceCaseIdFromUrl,
} from '../application/assistance-case.facade';
import { AssistanceGateway, UnavailableAssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from '../data-access/assistance.mock';
import { AssistanceCasePage } from './assistance-case.page';

const t = en.assistanceCases;
const c = t.case;
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

async function render(
  requestId: string,
  {
    actor = owner,
    gateway = 'mock',
    scenario = 'normal',
  }: { actor?: Actor; gateway?: 'mock' | 'unavailable'; scenario?: AssistanceDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      AssistanceCasePage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
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
      AssistanceCaseFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const instance = TestBed.inject(AssistanceGateway);
  const spies = {
    detail: vi.spyOn(instance, 'caseDetail'),
    timeline: vi.spyOn(instance, 'timeline'),
    late: vi.spyOn(instance, 'lateSettlement'),
    recovery: vi.spyOn(instance, 'recoveryObligation'),
    cases: vi.spyOn(instance, 'cases'),
  };
  await TestBed.inject(Router).navigateByUrl(
    `/billing/assistance/${encodeURIComponent(requestId)}`,
  );
  const fixture = TestBed.createComponent(AssistanceCasePage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  const done = () =>
    element.querySelector('[data-section="timeline"], nw-data-state:not([state="loading"])');
  for (let i = 0; i < 30 && !done(); i++) await settle();
  await settle();
  return { element, spies, settle };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const section = (element: HTMLElement, name: string) =>
  element.querySelector(`[data-section="${name}"]`);
const events = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-timeline] li')].map((li) => [
    li.dataset['source'],
    li.dataset['kind'],
  ]);

describe('Assistance case page (A5)', { timeout: 30_000 }, () => {
  it('reads the reference from the URL, never trusting it', () => {
    expect(assistanceCaseIdFromUrl('/billing/assistance/abc')).toBe('abc');
    expect(assistanceCaseIdFromUrl('/billing/assistance/abc?x=1#y')).toBe('abc');
    expect(assistanceCaseIdFromUrl('/billing/assistance')).toBeNull();
    expect(assistanceCaseIdFromUrl('/billing/assistance/a/b')).toBeNull();
    expect(assistanceCaseIdFromUrl('/billing/assistance/%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('every demo case of the Company opens, with its history oldest first', async () => {
    for (const kase of OWN) {
      const { element } = await render(kase.request.id);
      expect(text(element.querySelector('h1')), kase.request.id).toContain(
        kase.request.id.slice(-8),
      );
      expect(events(element)).toEqual(kase.timeline.map((e) => [e.source, e.kind]));
      const times = [...element.querySelectorAll('[data-timeline] time')].map((time) =>
        Date.parse(time.getAttribute('datetime') ?? ''),
      );
      expect(times).toEqual([...times].sort((a, b) => a - b));
      TestBed.resetTestingModule();
    }
  });

  it('labels the case as simulated and offers a way back to the directory', async () => {
    const { element } = await render(caseOf(1).request.id);
    expect(text(element.querySelector('[data-demo]'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('[data-simulation]'))).toBe(t.simulation);
    const back = element.querySelector('[data-back]');
    expect(back?.getAttribute('href')).toBe('/billing/assistance');
    expect(text(back)).toBe(c.back);
  });

  it('a reported collection is never a payment: an overdue case with its cash return and an open dispute', async () => {
    const kase = caseOf(8);
    const { element } = await render(kase.request.id);
    expect(text(element.querySelector('[data-state]'))).toBe(t.state.cashCollected);
    const collection = section(element, 'collection')!;
    expect(collection.querySelector('[data-source="report"]')).not.toBeNull();
    expect(text(collection.querySelector('[data-source]'))).toBe(c.collection.reported);
    expect(text(collection)).toContain(t.indicator.overdue);
    expect(text(collection.querySelector('[data-channel]'))).toBe(t.channel.closed);
    expect(text(collection)).not.toContain(c.collection.settledFact);
    const restrictions = [
      ...element.querySelectorAll('[data-section="oversight"] [data-restriction]'),
    ].map((li) => li.getAttribute('data-restriction'));
    expect(restrictions).toEqual(['T1', 'T2']);
    expect(text(section(element, 'oversight'))).toContain(c.restriction.t1);
    expect(text(section(element, 'oversight'))).toContain(t.oversight.clears.settledOrReturned);
    const returns = section(element, 'returns')!;
    expect(text(returns)).toContain(c.cashReturn.state.open);
    expect(text(returns.querySelector('[data-amount]'))).toMatch(/TND\s?46\.500/);
    const dispute = section(element, 'disputes')!;
    expect(text(dispute)).toContain(c.dispute.reason.cashNotReturned);
    expect(text(dispute.querySelector('[data-unresolvable]'))).toBe(c.dispute.noResolution);
    // The history keeps the report and the failed settlement apart; nothing claims a successful payment.
    expect(events(element)).toContainEqual(['report', 'cashCollected']);
    expect(events(element)).toContainEqual(['fact', 'settlementFailed']);
    expect(events(element).some(([, kind]) => kind === 'settlementSucceeded')).toBe(false);
  });

  it('a settled case: the verified settlement is a fact, the collection still a report', async () => {
    const { element } = await render(caseOf(5).request.id);
    const collection = section(element, 'collection')!;
    expect(text(collection.querySelector('[data-channel]'))).toBe(
      `${t.channel.settled} ${c.collection.settledFact}`,
    );
    expect(text(element.querySelector('[data-restrictions-none]'))).toBe(t.oversight.noRestriction);
    expect(events(element)).toEqual([
      ['report', 'consent'],
      ['report', 'cashCollected'],
      ['fact', 'settlementSucceeded'],
    ]);
    const fact = element.querySelector('[data-kind="settlementSucceeded"]')!;
    const report = element.querySelector('[data-kind="cashCollected"]')!;
    expect(text(fact)).toContain(c.source.fact);
    expect(text(report)).toContain(c.source.report);
    expect(fact.className).not.toBe(report.className);
  });

  it('shows the frozen terms with Core’s amounts, never recomputed', async () => {
    const { element } = await render(caseOf(4).request.id);
    const amounts = [...section(element, 'terms')!.querySelectorAll('[data-amount]')].map(text);
    expect(amounts.map((a) => a.replace(/\s/g, ' '))).toEqual([
      expect.stringMatching(/TND\s?45\.000/),
      expect.stringMatching(/TND\s?1\.500/),
      expect.stringMatching(/TND\s?46\.500/),
    ]);
    expect(text(section(element, 'terms'))).toContain(c.terms.frozen);
  });

  it('an owner timestamp correction: the corrected time in force, the original kept, the dispute resolved', async () => {
    const kase = caseOf(9);
    const { element } = await render(kase.request.id);
    expect(element.querySelector('[data-collected-at] [data-corrected]')).not.toBeNull();
    expect(text(element.querySelector('[data-corrections]'))).toContain(
      c.correction.field.cashCollectedAt,
    );
    expect(text(element.querySelector('[data-corrections]'))).toContain(
      c.correction.reason.evidenceContradictsReport,
    );
    expect(text(section(element, 'disputes'))).toContain(c.dispute.timestampCorrected);
    expect(events(element)).toContainEqual(['decision', 'correction']);
    expect(events(element)).toContainEqual(['decision', 'disputeResolved']);
  });

  it('a reported return with an open return-time dispute, and a confirmed return', async () => {
    let r = await render(caseOf(10).request.id);
    expect(text(section(r.element, 'returns'))).toContain(c.cashReturn.state.returnReported);
    expect(text(section(r.element, 'disputes'))).toContain(c.dispute.reason.returnTimeIncorrect);
    TestBed.resetTestingModule();
    r = await render(caseOf(7).request.id);
    expect(text(r.element.querySelector('[data-state]'))).toBe(t.state.returned);
    expect(text(section(r.element, 'returns'))).toContain(c.cashReturn.state.confirmedReturned);
    expect(text(section(r.element, 'returns'))).toContain(c.cashReturn.confirmedAt);
  });

  it('late settlements: one awaiting the owner without evidence, one applied by the owner', async () => {
    let r = await render(caseOf(11).request.id);
    let late = section(r.element, 'late')!;
    expect(late.querySelector('[data-late="unapplied"]')).not.toBeNull();
    expect(text(late.querySelector('[data-evidence]'))).toBe(c.late.noEvidence);
    expect(text(late)).toContain(c.late.noAttestation);
    expect(text(late)).toContain(c.late.never);
    expect(r.spies.late).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    r = await render(caseOf(12).request.id);
    late = section(r.element, 'late')!;
    expect(late.querySelector('[data-late="applied"]')).not.toBeNull();
    expect(text(late)).toContain(c.late.attestation.cashNotReturned);
    expect(text(late)).toContain(c.late.receipt);
    expect(text(section(r.element, 'returns'))).toContain(
      c.cashReturn.state.supersededBySettlement,
    );
    expect(events(r.element)).toContainEqual(['decision', 'lateSettlementApplied']);
  });

  it('recovery: base only, with Core’s recovered and outstanding amounts and a surplus owed', async () => {
    let r = await render(caseOf(13).request.id);
    let recovery = section(r.element, 'recovery')!;
    expect([...recovery.querySelectorAll('[data-amount]')].map(text)).toEqual([
      expect.stringMatching(/TND\s?45\.000/),
      expect.stringMatching(/TND\s?15\.000/),
      expect.stringMatching(/TND\s?30\.000/),
    ]);
    expect(
      r.element.querySelector('[data-section="oversight"] [data-restriction="T3"]'),
    ).not.toBeNull();
    expect(text(section(r.element, 'oversight'))).toContain(t.oversight.clears.principalRecovered);
    TestBed.resetTestingModule();
    r = await render(caseOf(14).request.id);
    recovery = section(r.element, 'recovery')!;
    expect(text(recovery)).toContain(t.indicator.recovered);
    expect(text(recovery.querySelector('[data-surpluses]'))).toMatch(
      new RegExp(`TND\\s?2\\.000 ${c.recovery.surplus.owedToOrganization}`),
    );
  });

  it('a pending case and a declined one show only what exists', async () => {
    let r = await render(caseOf(1).request.id);
    expect(text(r.element.querySelector('[data-not-collected]'))).toBe(t.collection.notCollected);
    expect(text(section(r.element, 'collection')?.querySelector('[data-channel]'))).toBe(
      t.channel.none,
    );
    for (const name of ['returns', 'disputes', 'late', 'recovery'])
      expect(section(r.element, name)).toBeNull();
    expect(r.spies.late).not.toHaveBeenCalled();
    expect(r.spies.recovery).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    r = await render(caseOf(3).request.id);
    expect(text(section(r.element, 'context'))).toContain('By the Organization administrator');
  });

  it('another Company’s case, an unknown and a malformed reference: one answer, not found', async () => {
    for (const reference of [FOREIGN[0]!.request.id, 'a551c0de-0000-4000-8000-0000000fffff']) {
      const { element } = await render(reference);
      expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notFoundTitle);
      expect(element.querySelector('[data-section]')).toBeNull();
      TestBed.resetTestingModule();
    }
    const { element, spies } = await render('../../admin');
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notFoundTitle);
    expect(spies.detail).not.toHaveBeenCalled();
  });

  it('never asks the gateway for an operator', async () => {
    const { element, spies } = await render(caseOf(1).request.id, { actor: operator });
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it('not in this build, unavailable with retry, and an empty Company', async () => {
    let r = await render(caseOf(1).request.id, { gateway: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    TestBed.resetTestingModule();
    r = await render(caseOf(1).request.id, { scenario: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.unavailableTitle);
    const calls = r.spies.detail.mock.calls.length;
    r.element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await r.settle();
    expect(r.spies.detail.mock.calls.length).toBe(calls + 1);
    TestBed.resetTestingModule();
    r = await render(caseOf(1).request.id, { scenario: 'empty' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.notFoundTitle);
  });

  it('is read only: no button, form or command; reads only; nothing sent over the network', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { element, spies } = await render(caseOf(12).request.id);
    expect(
      element.querySelectorAll('button, form, input, select, textarea, [role="dialog"]'),
    ).toHaveLength(0);
    expect(spies.cases).not.toHaveBeenCalled();
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('is keyboard friendly and keeps references left-to-right in RTL', async () => {
    const { element } = await render(caseOf(9).request.id);
    expect(element.querySelector('a, button')?.hasAttribute('data-back')).toBe(true);
    for (const focusable of element.querySelectorAll('a, [tabindex]'))
      expect(focusable.getAttribute('tabindex')).not.toBe('-1');
    for (const code of element.querySelectorAll('code'))
      expect(code.getAttribute('dir')).toBe('ltr');
    // Every section is labelled by its heading; the history is an ordered list.
    for (const s of element.querySelectorAll('section'))
      expect(element.querySelector(`#${s.getAttribute('aria-labelledby')}`)).not.toBeNull();
    expect(element.querySelector('ol[data-timeline]')).not.toBeNull();
  });
});

describe('Assistance case oversight (A6)', { timeout: 60_000 }, () => {
  const stages = (element: HTMLElement) =>
    Object.fromEntries(
      [...element.querySelectorAll<HTMLElement>('[data-oversight] [data-stage]')].map((s) => [
        s.dataset['stage'],
        s.dataset['value'],
      ]),
    );
  const sourceOf = (element: HTMLElement, stage: string) =>
    element
      .querySelector(`[data-oversight] [data-stage="${stage}"] adm-assistance-source-tag`)
      ?.getAttribute('data-source') ?? null;

  // [collection, settlement, deadline, cash return, recovery, unresolved dispute]
  const expected: Record<number, readonly string[]> = {
    1: ['notCollected', 'none', 'none', 'none', 'none', 'false'],
    2: ['declined', 'none', 'none', 'none', 'none', 'false'],
    4: ['reported', 'inProgress', 'running', 'none', 'none', 'true'],
    5: ['reported', 'verified', 'met', 'none', 'none', 'false'],
    6: ['reported', 'uncertain', 'running', 'none', 'none', 'false'],
    7: ['reported', 'closedUnpaid', 'met', 'confirmed', 'none', 'false'],
    8: ['reported', 'closedUnpaid', 'overdue', 'owed', 'none', 'true'],
    10: ['reported', 'closedUnpaid', 'overdue', 'reported', 'none', 'true'],
    11: ['reported', 'lateUnapplied', 'overdue', 'owed', 'none', 'false'],
    12: ['reported', 'verifiedLate', 'met', 'superseded', 'none', 'false'],
    13: ['reported', 'verified', 'met', 'none', 'open', 'false'],
    14: ['reported', 'verified', 'met', 'none', 'recovered', 'false'],
  };

  it('shows each scenario’s stages as Core states them', async () => {
    for (const [n, row] of Object.entries(expected)) {
      const { element } = await render(caseOf(Number(n)).request.id);
      const s = stages(element);
      expect(
        [
          s['collection'],
          s['settlement'],
          s['deadline'],
          s['cashReturn'],
          s['recovery'],
          s['dispute'],
        ],
        `case ${n}`,
      ).toEqual(row);
      TestBed.resetTestingModule();
    }
  });

  it('a reported collection is tagged Reported; only a settled channel is tagged a Verified fact', async () => {
    let r = await render(caseOf(8).request.id);
    expect(sourceOf(r.element, 'collection')).toBe('report');
    expect(sourceOf(r.element, 'settlement')).toBe('fact');
    expect(text(r.element.querySelector('[data-stage="settlement"]'))).toContain(
      t.oversight.settlement.closedUnpaid,
    );
    expect(sourceOf(r.element, 'deadline')).toBe('derived');
    TestBed.resetTestingModule();
    r = await render(caseOf(4).request.id);
    expect(sourceOf(r.element, 'collection')).toBe('report');
    expect(text(r.element.querySelector('[data-stage="settlement"] dd'))).toBe(
      `${t.oversight.settlement.inProgress} ${c.source.derived}`,
    );
    TestBed.resetTestingModule();
    r = await render(caseOf(5).request.id);
    expect(sourceOf(r.element, 'settlement')).toBe('fact');
    expect(text(r.element.querySelector('[data-stage="settlement"]'))).toContain(
      t.oversight.settlement.verified,
    );
    TestBed.resetTestingModule();
    r = await render(caseOf(10).request.id);
    expect(sourceOf(r.element, 'cashReturn')).toBe('report');
    expect(text(r.element.querySelector('[data-stage="cashReturn"]'))).toContain(
      t.oversight.cashReturn.reported,
    );
  });

  it('explains each restriction and how it clears; the overdue deadline is flagged', async () => {
    const { element } = await render(caseOf(11).request.id);
    const items = [...element.querySelectorAll('[data-restriction]')].map((li) =>
      [...li.children].map(text),
    );
    expect(items).toEqual([
      ['T1', c.restriction.t1, t.oversight.clears.settledOrReturned],
      ['T2', c.restriction.t2, t.oversight.clears.returnConfirmedOrSuperseded],
    ]);
    expect(text(element.querySelector('[data-stage="deadline"] nw-status-badge'))).toBe(
      t.oversight.deadline.overdue,
    );
  });
});
