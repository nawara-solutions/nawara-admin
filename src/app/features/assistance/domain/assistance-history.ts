import { AssistanceTimelineEntry } from './assistance-read.model';
import { AssistanceInformationSource } from './assistance.model';

/**
 * Reading a case's history for audit (A10). Pure, over the entries the gateway already returns: nothing is added, merged or
 * re-classified, and no entry changes its source.
 *
 * Two clocks: `at` is the time an entry is ABOUT (for a report, the time its author asserts), `recordedAt` is when Nawara Core
 * recorded it. They differ for a report (an Organization can report a collection hours after the time it asserts, `0029:33-48`)
 * and for a verified late success (Billing records it after Payment's instant). Ordering by either is a view; neither is corrected.
 */

/** `occurred`: by the time the entry is about; `recorded`: by when Core recorded it. */
export const HISTORY_ORDERS = ['occurred', 'recorded'] as const;
export type AssistanceHistoryOrder = (typeof HISTORY_ORDERS)[number];

export const HISTORY_SOURCES: readonly AssistanceInformationSource[] = [
  'fact',
  'report',
  'decision',
  'derived',
];

const time = (iso: string): number => Date.parse(iso);

/**
 * The entries in one order, oldest first. Ties fall back to the other clock, then to the entry id, so the same history always reads
 * the same way (an owner decision recorded in the same instant as another entry never jumps around).
 */
export function orderHistory(
  entries: readonly AssistanceTimelineEntry[],
  order: AssistanceHistoryOrder,
): readonly AssistanceTimelineEntry[] {
  const [first, second] =
    order === 'occurred' ? (['at', 'recordedAt'] as const) : (['recordedAt', 'at'] as const);
  return [...entries].sort(
    (a, b) =>
      time(a[first]) - time(b[first]) ||
      time(a[second]) - time(b[second]) ||
      a.id.localeCompare(b.id),
  );
}

/** Only the entries of the chosen sources (an empty choice shows nothing; the view says so). */
export function historyOfSources(
  entries: readonly AssistanceTimelineEntry[],
  sources: ReadonlySet<AssistanceInformationSource>,
): readonly AssistanceTimelineEntry[] {
  return entries.filter((entry) => sources.has(entry.source));
}

/** How many entries each source has, so a filter states what it hides. */
export function historySourceCounts(
  entries: readonly AssistanceTimelineEntry[],
): Readonly<Record<AssistanceInformationSource, number>> {
  const counts = { fact: 0, report: 0, decision: 0, derived: 0 };
  for (const entry of entries) counts[entry.source] += 1;
  return counts;
}

/**
 * What an entry means for money, by its kind. Only a Payment-verified fact moves (or verifies the loss of) money; a report, however
 * final it sounds, is a statement Core keeps as evidence; an owner decision is authorized and recorded by Core; a derived state
 * is Core's reading of the other records.
 * - `verifiedFinancial`: a Payment-verified success, refund, chargeback loss or recovery payment;
 * - `verifiedNoPayment`: a Payment-verified failure: no money moved;
 * - `reportedOnly`: a statement; never a payment, a settlement or a confirmation of money received;
 * - `ownerDecision`: the owner's decision;
 * - `coreDerived`: a state Core derived.
 */
export type AssistanceHistoryStanding =
  'verifiedFinancial' | 'verifiedNoPayment' | 'reportedOnly' | 'ownerDecision' | 'coreDerived';

export const HISTORY_STANDING = {
  settlementSucceeded: 'verifiedFinancial',
  settlementFailed: 'verifiedNoPayment',
  lateSuccess: 'verifiedFinancial',
  refundCompleted: 'verifiedFinancial',
  chargebackFinal: 'verifiedFinancial',
  recoveryPayment: 'verifiedFinancial',
  consent: 'reportedOnly',
  declined: 'reportedOnly',
  cashCollected: 'reportedOnly',
  cashReturnReported: 'reportedOnly',
  cashReturnConfirmed: 'reportedOnly',
  disputeOpened: 'reportedOnly',
  disputeResponse: 'reportedOnly',
  lateAttestation: 'reportedOnly',
  correction: 'ownerDecision',
  disputeResolved: 'ownerDecision',
  lateSettlementApplied: 'ownerDecision',
  writeOff: 'ownerDecision',
  surplusExternal: 'ownerDecision',
  cashReturnOwed: 'coreDerived',
  channelUncertain: 'coreDerived',
  channelClosed: 'coreDerived',
  recoveryOpened: 'coreDerived',
} as const satisfies Readonly<Record<AssistanceTimelineEntry['kind'], AssistanceHistoryStanding>>;

/** Each standing belongs to exactly one source: a report can never read as a verified fact. */
export const STANDING_SOURCE = {
  verifiedFinancial: 'fact',
  verifiedNoPayment: 'fact',
  reportedOnly: 'report',
  ownerDecision: 'decision',
  coreDerived: 'derived',
} as const satisfies Readonly<Record<AssistanceHistoryStanding, AssistanceInformationSource>>;

/** The asserted time of a report differs from Core's recording of it (the history shows both, never one for the other). */
export const recordedLater = (entry: AssistanceTimelineEntry): boolean =>
  time(entry.recordedAt) !== time(entry.at);
