import { TestBed } from '@angular/core/testing';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { DEMO_DRIVE_PLATFORM_ID } from '../../../demo/world/seed';
import { DEMO_FOREIGN_PLATFORM_ID } from '../../../demo/world/assistance/assistance.seed';
import { demoRestrictionRowsOf } from '../data-access/assistance.mock';
import {
  CASES,
  FOREIGN,
  NOW,
  OWN,
  PRODUCTION,
  caseOf,
  caseReady,
  directoryReady,
  operator,
  rows,
  setUp,
  t,
  text,
} from '../testing/assistance-routed-testing';

/**
 * Assistance acceptance (A12): the whole read-only owner journey and the financial invariants, through the REAL Billing routes with
 * the demo bindings, over EVERY demo case of the Company. Mock-first frontend acceptance, not production financial certification:
 * every record is a deterministic demo record that follows Core's rules at nawara-core `0044b20`.
 */

const listReady = (s: Awaited<ReturnType<typeof setUp>>) => () =>
  s.root().querySelector('[data-case-link], nw-data-state:not([state="loading"]), [data-none]') !==
  null;

/** TND minor units as the page writes them (3 decimals, ISO 4217 through Intl): the digits only. */
const tnd = (minor: number) => (minor / 1000).toFixed(3);

describe('Assistance acceptance (A12): the owner journey end to end', { timeout: 90_000 }, () => {
  it('Billing → directory → case → disputes → settlements → recovery → evidence and history → back', async () => {
    const s = await setUp();
    // Billing is the entry point.
    await s.go('/billing', () => s.$('[data-assistance-link]') !== null);
    await s.click('[data-assistance-link]', directoryReady(s.root));
    // A URL filter, then a case: the collection is a report; its way back keeps the filter.
    const attention = s.root().querySelectorAll<HTMLSelectElement>('select')[3]!;
    attention.value = 'overdue';
    attention.dispatchEvent(new Event('change'));
    await s.until(
      () => s.router.url === '/billing/assistance?attention=overdue' && rows(s.root).length === 3,
    );
    await s.click(`[data-case-link][href$="${caseOf(8).request.id}"]`, caseReady(s.root));
    expect(text(s.$('[data-section="collection"] [data-source="report"]'))).toBe(
      t.case.collection.reported,
    );
    // Case → its disputes overview (contextual link) → settlements and recovery (section navigation).
    await s.click(
      '[data-disputes-link]',
      () => s.$('[data-section="disputes"] [data-case-link]') !== null,
    );
    expect(s.router.url).toBe('/billing/assistance/disputes');
    await s.click(
      '[data-section-link="settlements"]',
      () => s.$('[data-late-list] [data-case-link]') !== null,
    );
    await s.click(
      '[data-section-link="recovery"]',
      () =>
        s.router.url === '/billing/assistance/recovery' &&
        s.$(
          `[data-section="recovery-obligations"] [data-case-link][href$="${caseOf(14).request.id}"]`,
        ) !== null,
    );
    // Recovery → case 14 → evidence and history.
    await s.click(
      `[data-section="recovery-obligations"] [data-case-link][href$="${caseOf(14).request.id}"]`,
      () => s.router.url.endsWith(caseOf(14).request.id) && caseReady(s.root)(),
    );
    expect(
      s.$('[data-section="evidence"] [data-evidence-kind="surplusExternalRecord"]'),
    ).not.toBeNull();
    expect(s.$('[data-section="timeline"] [data-kind="recoveryPayment"]')).not.toBeNull();
    expect(s.$('[data-section="restrictions"] [data-restriction="T3"]')).not.toBeNull();
    // Back returns to the recovery overview it came from; browser back returns to the case.
    expect(text(s.$('[data-back]'))).toBe(t.case.backTo.recovery);
    await s.click('[data-back]', () => s.router.url === '/billing/assistance/recovery');
    s.location.back();
    await s.until(() => s.router.url.endsWith(caseOf(14).request.id) && caseReady(s.root)());
  });

  it('bookmarks open each view filtered, with the right section current', async () => {
    const s = await setUp();
    for (const [url, section, ready] of [
      ['/billing/assistance?state=returned', 'cases', directoryReady(s.root)],
      ['/billing/assistance/disputes?state=resolved', 'disputes', listReady(s)],
      ['/billing/assistance/settlements?return=open&disputed=true', 'settlements', listReady(s)],
      ['/billing/assistance/recovery?surplus=owed', 'recovery', listReady(s)],
    ] as const) {
      await s.go(url, ready);
      expect([
        url,
        s.$('[aria-current="page"][data-section-link]')?.getAttribute('data-section-link'),
      ]).toEqual([url, section]);
    }
    // Each filter is applied, not merely shown: one returned case, one resolved dispute, one disputed open return, case 14.
    await s.go('/billing/assistance?state=returned', directoryReady(s.root));
    expect(rows(s.root)).toEqual([caseOf(7).request.id]);
    await s.go('/billing/assistance/settlements?return=open&disputed=true', listReady(s));
    expect(
      [...s.root().querySelectorAll('[data-section="cash-returns"] [data-case-link]')].map((a) =>
        a.getAttribute('href')?.split('/').at(-1),
      ),
    ).toEqual([caseOf(8).request.id]);
    await s.go('/billing/assistance/recovery?surplus=owed', listReady(s));
    expect(
      [...s.root().querySelectorAll('[data-case-link]')].map((a) =>
        a.getAttribute('href')?.split('/').at(-1),
      ),
    ).toEqual([caseOf(14).request.id]);
  });
});

describe(
  'Assistance acceptance (A12): financial invariants on every demo case',
  { timeout: 120_000 },
  () => {
    it('holds every invariant on each of the Company’s cases, as rendered', async () => {
      const s = await setUp();
      for (const [index, c] of OWN.entries()) {
        const n = index + 1;
        await s.go(`/billing/assistance/${c.request.id}`, caseReady(s.root));
        const at = `case ${n}`;
        const section = (name: string) => s.$(`[data-section="${name}"]`);

        // 1. A reported collection is never a verified settlement: the "settled" words appear only for Core's settled channel.
        if (c.request.collection !== null) {
          expect(section('collection')?.querySelector('[data-source="report"]'), at).not.toBeNull();
          expect(text(section('collection')).includes(t.case.collection.settledFact), at).toBe(
            c.channel?.state === 'settled',
          );
        }
        for (const report of s
          .root()
          .querySelectorAll('[data-timeline] > li[data-source="report"]'))
          expect(report.querySelector('[data-standing]')?.getAttribute('data-standing'), at).toBe(
            'reportedOnly',
          );

        // 2. Late payments are never applied automatically: "applied" only where the owner's application exists.
        const late = [
          ...s.root().querySelectorAll<HTMLElement>('[data-section="late"] [data-late]'),
        ].map((dl) => dl.dataset['late']);
        expect(late, at).toEqual(
          c.lateSettlements.map((l) => (l.application === null ? 'unapplied' : 'applied')),
        );

        // 3. A return report is not a confirmation: a confirmation time is shown only when the beneficiary confirmed.
        for (const obligation of c.cashReturns) {
          const dl = section('returns')?.querySelector(`[data-return="${obligation.state}"]`);
          expect(dl, at).not.toBeNull();
          expect(text(dl).includes(t.case.cashReturn.confirmedAt), at).toBe(
            obligation.confirmedAt !== null,
          );
        }

        // 4. A correction keeps the original fact: the reported time stays visible beside the time in force.
        const corrected = c.corrections.filter((x) => x.field === 'cashCollectedAt');
        expect(section('collection')?.querySelector('[data-corrected]') !== null, at).toBe(
          corrected.length > 0,
        );
        expect(
          s.root().querySelectorAll('[data-section="evidence"] [data-evidence-kind="correction"]')
            .length,
          at,
        ).toBe(c.corrections.length);

        // 5. A dispute holds only what Core says; it is never a restriction (T1/T2/T3 rows come from their own sources).
        const expected = demoRestrictionRowsOf(
          CASES.filter((x) => x.companyId === c.companyId),
          c.request.organizationId,
          NOW,
        );
        const shown = [
          ...s
            .root()
            .querySelectorAll<HTMLElement>('[data-section="restrictions"] [data-restriction]'),
        ].map((li) => [
          li.dataset['restriction'],
          li.querySelector('[data-source-ref] code')?.getAttribute('title'),
        ]);
        expect(shown, at).toEqual(expected.map((r) => [r.kind, r.sourceId]));
        for (const dispute of c.disputes)
          expect(
            shown.some(([, id]) => id === dispute.id),
            at,
          ).toBe(false);

        // 6. Recovery is the base only, with Core's recovered and outstanding amounts as stated.
        if (c.recovery !== null) {
          expect(c.recovery.base.amount, at).toBe(c.request.terms.baseAmount);
          const amounts = [
            ...(section('recovery')?.querySelectorAll('dl [data-amount]') ?? []),
          ].map(text);
          expect(amounts[0], at).toContain(tnd(c.recovery.base.amount));
          expect(amounts[1], at).toContain(tnd(c.recovery.recovered.amount));
          expect(amounts[2], at).toContain(tnd(c.recovery.outstanding.amount));
        }

        // 7. Evidence ids never become links, downloads or uploads; each File grant shows its two ids.
        const evidence = section('evidence');
        expect(
          evidence?.querySelectorAll('a, [download], input[type="file"], iframe, object').length,
          at,
        ).toBe(0);
        const grants = c.lateSettlements.flatMap((l) => l.evidence);
        expect(evidence?.querySelectorAll('[data-file="reference"]').length, at).toBe(
          grants.length,
        );

        // 8. No financial command anywhere on the case: no button, form or text entry; only the history's view controls.
        expect(
          s
            .root()
            .querySelectorAll(
              'adm-assistance-case-page button, adm-assistance-case-page form, adm-assistance-case-page textarea',
            ).length,
          at,
        ).toBe(0);
        for (const control of s
          .root()
          .querySelectorAll('adm-assistance-case-page input, adm-assistance-case-page select'))
          expect(control.closest('[data-history-controls]'), at).not.toBeNull();
      }
    });
  },
);

describe(
  'Assistance acceptance (A12): authorization, isolation and states',
  { timeout: 90_000 },
  () => {
    it('keeps Platform scope: Drive has no case, a foreign Platform is not found, never another Company’s rows', async () => {
      const s = await setUp();
      await s.go(`/billing/assistance?platform=${DEMO_DRIVE_PLATFORM_ID}`, directoryReady(s.root));
      expect(s.$('[data-no-match]')).not.toBeNull();
      await s.go(
        `/billing/assistance?platform=${DEMO_FOREIGN_PLATFORM_ID}`,
        directoryReady(s.root),
      );
      expect(text(s.$('nw-data-state'))).toContain(t.states.notFoundTitle);
      expect(rows(s.root)).toEqual([]);
      // A foreign case reference searched, or a partial one dropped from the address (never sent).
      await s.go(`/billing/assistance?ref=${FOREIGN[0]!.request.id}`, directoryReady(s.root));
      expect(text(s.$('nw-data-state'))).toContain(t.states.notFoundTitle);
      await s.go(
        `/billing/assistance?ref=${caseOf(3).request.id.slice(0, 10)}`,
        directoryReady(s.root),
      );
      expect(rows(s.root).length).toBeGreaterThan(0);
      for (const c of FOREIGN) expect(s.root().innerHTML).not.toContain(c.request.id);
    });

    it('every view states an outage as unavailable, with Retry, never as an empty result', async () => {
      const s = await setUp({ scenario: 'unavailable' });
      for (const url of [
        '/billing/assistance',
        '/billing/assistance/disputes',
        '/billing/assistance/settlements',
        '/billing/assistance/recovery',
        `/billing/assistance/${caseOf(5).request.id}`,
      ]) {
        await s.go(url, () => s.root().querySelector('nw-data-state[state="error"]') !== null);
        expect([url, text(s.$('nw-data-state[state="error"]'))]).toEqual([
          url,
          expect.stringContaining(t.states.unavailableTitle),
        ]);
        expect(s.$('nw-data-state[state="error"] button'), url).not.toBeNull();
        expect(s.root().textContent, url).not.toContain(t.states.emptyTitle);
      }
    });

    it('a Company with no case says so on each view; an empty list is never an outage', async () => {
      const s = await setUp({ scenario: 'empty' });
      await s.go('/billing/assistance', directoryReady(s.root));
      expect(text(s.$('nw-data-state'))).toContain(t.states.emptyTitle);
      for (const url of [
        '/billing/assistance/disputes',
        '/billing/assistance/settlements',
        '/billing/assistance/recovery',
      ]) {
        await s.go(url, () => s.$('[data-none]') !== null);
        expect(s.$('nw-data-state[state="error"]'), url).toBeNull();
      }
    });

    it('refuses an operator everywhere and binds only unavailable adapters in production', async () => {
      let s = await setUp({ actor: operator });
      await s.go(
        '/billing/assistance/settlements?late=applied',
        () => s.$('[data-elsewhere]') !== null,
      );
      expect(s.router.url).toBe('/forbidden');
      TestBed.resetTestingModule();
      s = await setUp({ environment: PRODUCTION });
      await s.go(`/billing/assistance/${caseOf(5).request.id}`, caseReady(s.root));
      expect(text(s.$('nw-data-state'))).toContain(t.states.notInBuildTitle);
      expect(s.$('[data-section="collection"]')).toBeNull();
    });
  },
);

describe('Assistance acceptance (A12): localization', () => {
  const strings = (node: unknown, path = ''): [string, string][] =>
    typeof node === 'string'
      ? [[path, node]]
      : Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
          strings(v, path ? `${path}.${k}` : k),
        );

  it('French Assistance copy never starts a line with ; : ! or ? (a no-break space precedes them)', () => {
    const broken = strings(fr.assistanceCases).filter(([, value]) => / [;:!?](\s|$)/.test(value));
    expect(broken).toEqual([]);
  });

  it('every Assistance key exists, non-empty, in English, French and Arabic', () => {
    const keys = (catalog: unknown) =>
      strings(catalog)
        .map(([k]) => k)
        .sort();
    expect(keys(fr.assistanceCases)).toEqual(keys(en.assistanceCases));
    expect(keys(ar.assistanceCases)).toEqual(keys(en.assistanceCases));
    for (const catalog of [en, fr, ar])
      for (const [key, value] of strings(catalog.assistanceCases))
        expect([key, value.trim().length > 0]).toEqual([key, true]);
  });
});
