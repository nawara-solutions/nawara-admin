import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  HISTORY_STANDING,
  STANDING_SOURCE,
  historyOfSources,
  historySourceCounts,
  orderHistory,
  recordedLater,
} from './assistance-history';
import { AssistanceTimelineEntry } from './assistance-read.model';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);

/** A report asserted early but recorded late, a fact in between, and a decision tied with the fact. */
const ENTRIES: readonly AssistanceTimelineEntry[] = [
  {
    id: 'e-3',
    source: 'decision',
    by: 'owner',
    kind: 'correction',
    at: '2026-10-29T12:00:00.000Z',
    recordedAt: '2026-10-29T12:00:00.000Z',
  },
  {
    id: 'e-1',
    source: 'report',
    by: 'organization_actor',
    kind: 'cashCollected',
    at: '2026-10-28T08:00:00.000Z',
    recordedAt: '2026-10-29T18:00:00.000Z',
  },
  {
    id: 'e-2',
    source: 'fact',
    by: 'core',
    kind: 'settlementFailed',
    at: '2026-10-29T12:00:00.000Z',
    recordedAt: '2026-10-29T12:00:00.000Z',
  },
];
const ids = (entries: readonly AssistanceTimelineEntry[]) => entries.map((e) => e.id);

describe('Assistance history (A10): ordering', () => {
  it('orders by the time an entry is about, or by when Core recorded it; never changes an entry', () => {
    expect(ids(orderHistory(ENTRIES, 'occurred'))).toEqual(['e-1', 'e-2', 'e-3']);
    // The backdated report moves after the entries Core recorded before it.
    expect(ids(orderHistory(ENTRIES, 'recorded'))).toEqual(['e-2', 'e-3', 'e-1']);
    expect(orderHistory(ENTRIES, 'recorded')).toEqual(
      expect.arrayContaining(ENTRIES.map((e) => expect.objectContaining(e))),
    );
    expect(ids(ENTRIES)).toEqual(['e-3', 'e-1', 'e-2']);
  });

  it('breaks ties on the other clock, then the id: the same history always reads the same', () => {
    const reversed = [...ENTRIES].reverse();
    for (const order of ['occurred', 'recorded'] as const)
      expect(ids(orderHistory(reversed, order))).toEqual(ids(orderHistory(ENTRIES, order)));
  });

  it('keeps the gateway’s order for every demo case when ordered by occurrence', () => {
    for (const c of OWN) expect(orderHistory(c.timeline, 'occurred')).toEqual(c.timeline);
  });

  it('flags a report recorded after the time it asserts', () => {
    expect(ENTRIES.map(recordedLater)).toEqual([false, true, false]);
  });
});

describe('Assistance history (A10): sources and what each entry means for money', () => {
  it('filters by source and counts each source', () => {
    expect(historySourceCounts(ENTRIES)).toEqual({ fact: 1, report: 1, decision: 1, derived: 0 });
    expect(ids(historyOfSources(ENTRIES, new Set(['report'])))).toEqual(['e-1']);
    expect(historyOfSources(ENTRIES, new Set())).toEqual([]);
  });

  it('gives every kind one standing, of its own source: a report is never verified financial completion', () => {
    for (const c of OWN)
      for (const entry of c.timeline)
        expect([entry.kind, STANDING_SOURCE[HISTORY_STANDING[entry.kind]]]).toEqual([
          entry.kind,
          entry.source,
        ]);
    const reports = Object.entries(HISTORY_STANDING).filter(([, s]) => s === 'reportedOnly');
    expect(reports.map(([kind]) => kind)).toEqual(
      expect.arrayContaining(['cashCollected', 'cashReturnReported', 'cashReturnConfirmed']),
    );
    expect(HISTORY_STANDING.settlementFailed).toBe('verifiedNoPayment');
    expect(HISTORY_STANDING.recoveryPayment).toBe('verifiedFinancial');
    expect(HISTORY_STANDING.surplusExternal).toBe('ownerDecision');
  });
});
