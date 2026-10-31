import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { map } from 'rxjs';
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
import { AssistanceDisputesFacade } from '../application/assistance-disputes.facade';
import { AssistanceGateway, UnavailableAssistanceGateway } from '../data-access/assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from '../data-access/assistance.mock';
import { AssistanceDisputeFilter, AssistancePageRequest } from '../domain/assistance-read.model';
import { AssistanceReadContext } from '../domain/assistance-read-context';
import { AssistanceDisputesPage } from './assistance-disputes.page';

const t = en.assistanceCases;
const d = t.disputes;
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

/** The demo adapter, with every open dispute open for more than seven days (Core's `escalationDue`): a state the seed lacks. */
class EscalatedGateway extends MockAssistanceGateway {
  override disputeCases(
    context: AssistanceReadContext,
    filter: AssistanceDisputeFilter,
    page: AssistancePageRequest,
  ) {
    return super.disputeCases(context, filter, page).pipe(
      map((answer) => ({
        ...answer,
        items: answer.items.map((row) => ({
          ...row,
          dispute: { ...row.dispute, escalationDue: row.dispute.state === 'open' },
        })),
      })),
    );
  }
}

async function render({
  actor = owner,
  gateway = 'mock',
  scenario = 'normal',
  lang = 'en',
}: {
  actor?: Actor;
  gateway?: 'mock' | 'unavailable' | 'escalated';
  scenario?: AssistanceDemoScenario;
  lang?: 'en' | 'fr' | 'ar';
} = {}) {
  TestBed.configureTestingModule({
    imports: [
      AssistanceDisputesPage,
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
        useClass:
          gateway === 'mock'
            ? MockAssistanceGateway
            : gateway === 'escalated'
              ? EscalatedGateway
              : UnavailableAssistanceGateway,
      },
      ScopeContext,
      AssistanceDisputesFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const instance = TestBed.inject(AssistanceGateway);
  const spies = {
    disputeCases: vi.spyOn(instance, 'disputeCases'),
    cases: vi.spyOn(instance, 'cases'),
  };
  const fixture = TestBed.createComponent(AssistanceDisputesPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  const loading = () => element.querySelector('nw-data-state[state="loading"]') !== null;
  for (let i = 0; i < 30 && loading(); i++) await settle();
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
const disputeRows = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-disputes] article')].map((a) => [
    a.dataset['dispute'],
    a.dataset['state'],
    a.dataset['request'],
  ]);
const exceptionRows = (element: HTMLElement) =>
  [...element.querySelectorAll<HTMLElement>('[data-exception-cases] article')].map(
    (a) => a.dataset['request'],
  );

describe('Assistance disputes and exceptions page (A7)', { timeout: 60_000 }, () => {
  afterEach(() => vi.restoreAllMocks());

  it('labels the data as simulated, and links back to the directory', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(d.title);
    expect(text(element.querySelector('[data-demo]'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('[data-simulation]'))).toBe(d.simulation);
    expect(element.querySelector('[data-back]')?.getAttribute('href')).toBe('/billing/assistance');
  });

  it('lists the open disputes by default, each linked to its case, with Core’s resolution path', async () => {
    const { element } = await render();
    expect(disputeRows(element)).toEqual([
      ['collection_not_made', 'open', caseOf(4).request.id],
      ['cash_not_returned', 'open', caseOf(8).request.id],
      ['return_time_incorrect', 'open', caseOf(10).request.id],
    ]);
    const paths = [...element.querySelectorAll<HTMLElement>('[data-disputes] [data-path]')].map(
      (dd) => [dd.dataset['path'], text(dd)],
    );
    expect(paths).toEqual([
      ['noResolution', c.dispute.noResolution],
      ['noResolution', c.dispute.noResolution],
      ['correctionOnly', d.path.correctionOnly.replace('{{field}}', c.correction.field.returnedAt)],
    ]);
    const links = [...element.querySelectorAll('[data-disputes] [data-case-link]')].map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual([4, 8, 10].map((n) => `/billing/assistance/${caseOf(n).request.id}`));
    expect(text(element.querySelector('[data-section="disputes"] [data-count]'))).toBe(
      d.list.count.replace('{{shown}}', '3'),
    );
  });

  it('shows all four reasons, and the resolved one with its correction outcome', async () => {
    const r = await render();
    await r.select('state', '');
    expect(disputeRows(r.element).map(([reason]) => reason)).toEqual([
      'collection_not_made',
      'cash_not_returned',
      'collection_time_incorrect',
      'return_time_incorrect',
    ]);
    await r.select('state', 'resolved');
    expect(disputeRows(r.element)).toEqual([
      ['collection_time_incorrect', 'resolved', caseOf(9).request.id],
    ]);
    expect(text(r.element.querySelector('[data-disputes] [data-path]'))).toBe(
      c.dispute.timestampCorrected,
    );
    expect(text(r.element.querySelector('[data-disputes] [data-response]'))).toContain(
      c.dispute.position.contests,
    );
    await r.select('state', '');
    await r.select('reason', 'cash_not_returned');
    expect(disputeRows(r.element)).toEqual([['cash_not_returned', 'open', caseOf(8).request.id]]);
    await r.select('reason', 'collection_time_incorrect');
    await r.select('state', 'open');
    expect(text(r.element.querySelector('[data-none="disputes"]'))).toBe(d.list.none);
  });

  it('gives each dispute its collection and settlement context, never a report as a payment', async () => {
    const { element } = await render();
    const first = element.querySelector('[data-disputes] article')!;
    const context = first.querySelector('[data-settlement-context]')!;
    const tags = [...context.querySelectorAll('adm-assistance-source-tag')].map((tag) =>
      tag.getAttribute('data-source'),
    );
    // Collection: a report. Settlement of case 4: in progress, derived (not settled).
    expect(tags).toEqual(['report', 'derived']);
    expect(text(context)).toContain(t.oversight.settlement.inProgress);
    const exceptions = [...first.querySelectorAll<HTMLElement>('[data-exception]')].map(
      (li) => li.dataset['exception'],
    );
    expect(exceptions).toEqual(['collectionReportedNotSettled', 'openDispute']);
  });

  it('flags an escalation Core derives (open more than seven days), as text and icon', async () => {
    const { element } = await render({ gateway: 'escalated' });
    const badges = element.querySelectorAll('[data-disputes] [data-escalation]');
    expect(badges).toHaveLength(3);
    const badge = badges[0];
    expect(text(badge)).toBe(c.dispute.escalationDue);
    expect(badge?.querySelector('nw-icon')).not.toBeNull();
  });

  it('lists each exception’s cases through the existing directory filters', async () => {
    const r = await render();
    expect(text(r.element.querySelector('[data-exception-description]'))).toContain(
      t.exception.describe.collectionReportedNotSettled,
    );
    // Oldest consent first: cases 10, 8, 11, 6, 4.
    expect(exceptionRows(r.element)).toEqual([10, 8, 11, 6, 4].map((n) => caseOf(n).request.id));
    await r.select('exception', 'uncertainSettlement');
    expect(exceptionRows(r.element)).toEqual([caseOf(6).request.id]);
    await r.select('exception', 'overdueSettlement');
    expect(exceptionRows(r.element)).toEqual([10, 8, 11].map((n) => caseOf(n).request.id));
    expect(text(r.element.querySelector('[data-restriction]'))).toBe(
      t.exception.feeds.replace('{{restriction}}', 'T1'),
    );
    await r.select('exception', 'lateSettlementReview');
    expect(exceptionRows(r.element)).toEqual([caseOf(11).request.id]);
    await r.select('exception', 'recoveryRestriction');
    expect(exceptionRows(r.element)).toEqual([caseOf(13).request.id]);
    expect(r.spies.cases).toHaveBeenLastCalledWith(
      expect.anything(),
      { recoveryOpen: true, order: 'consentOldest' },
      expect.anything(),
    );
  });

  it('never shows another Company’s dispute or case', async () => {
    const r = await render();
    await r.select('state', '');
    const html = r.element.innerHTML;
    for (const x of FOREIGN) {
      expect(html).not.toContain(x.request.id);
      for (const dispute of x.disputes) expect(html).not.toContain(dispute.id);
    }
  });

  it('never asks the gateway for an operator', async () => {
    const { element, spies } = await render({ actor: operator });
    expect(text(element.querySelector('nw-data-state'))).toContain(d.forbiddenDescription);
    expect(spies.disputeCases).not.toHaveBeenCalled();
    expect(spies.cases).not.toHaveBeenCalled();
    expect(element.querySelector('[data-section]')).toBeNull();
  });

  it('not in this build, unavailable with retry, and an empty Company', async () => {
    let r = await render({ gateway: 'unavailable' });
    expect(text(r.element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(text(r.element.querySelector('nw-data-state'))).toContain(d.notInBuildDescription);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'unavailable' });
    expect(text(r.element.querySelector('[data-section="disputes"] nw-data-state'))).toContain(
      t.states.unavailableTitle,
    );
    expect(r.element.querySelector('[data-exceptions-unavailable]')).not.toBeNull();
    const calls = r.spies.disputeCases.mock.calls.length;
    r.element.querySelector<HTMLButtonElement>('nw-data-state button')!.click();
    await r.settle();
    expect(r.spies.disputeCases.mock.calls.length).toBe(calls + 1);
    TestBed.resetTestingModule();
    r = await render({ scenario: 'empty' });
    expect(text(r.element.querySelector('[data-none="disputes"]'))).toBe(d.list.none);
    expect(text(r.element.querySelector('[data-none="exceptions"]'))).toBe(d.exceptionNone);
  });

  it('is read only: no command, form or dialog; reads only; nothing sent over the network', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { element } = await render();
    expect(element.querySelectorAll('form, input, textarea, [role="dialog"]')).toHaveLength(0);
    // The only controls are the three filters; no button exists while everything fits one page.
    expect(element.querySelectorAll('select')).toHaveLength(3);
    expect(element.querySelectorAll('button')).toHaveLength(0);
    expect(text(element)).toContain(d.readOnly);
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
    for (const s of element.querySelectorAll('section, [data-disputes] article'))
      expect(
        element.querySelector(`#${CSS.escape(s.getAttribute('aria-labelledby') ?? '')}`),
      ).not.toBeNull();
    // Status changes are announced; badges carry an icon and words, never colour alone.
    expect(element.querySelector('[data-count][role="status"]')).not.toBeNull();
    for (const badge of element.querySelectorAll('nw-status-badge')) {
      expect(badge.querySelector('nw-icon')).not.toBeNull();
      expect(text(badge).length).toBeGreaterThan(0);
    }
  });

  it('renders in French and Arabic with every key translated', async () => {
    for (const lang of ['fr', 'ar'] as const) {
      const r = await render({ lang });
      await r.select('state', '');
      expect(r.element.textContent, lang).not.toMatch(/assistanceCases\.|shell\./);
      expect(text(r.element.querySelector('h1'))).toBe(
        (lang === 'fr' ? fr : ar).assistanceCases.disputes.title,
      );
      TestBed.resetTestingModule();
    }
  });
});
