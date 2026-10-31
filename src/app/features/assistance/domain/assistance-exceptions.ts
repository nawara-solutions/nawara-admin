import { AssistanceCaseFilter } from './assistance-read.model';
import { AssistanceOversightInput } from './assistance-oversight';
import { AssistanceInformationSource, AssistanceRestriction } from './assistance.model';

/**
 * Assistance EXCEPTIONS (Assistance A7): the categories of a case that need the owner's attention, each read from the same Core
 * values as the A6 oversight (`assistance-oversight.ts`), so a row, its case and its exceptions always agree. Pure and read only:
 * nothing here computes an amount, a deadline, overdue or a restriction (Core derives them), and none is a command.
 *
 * - `collectionReportedNotSettled`: the Organization REPORTED the whole amount collected and the request is neither settled nor
 *   returned. A report is evidence, never settlement;
 * - `uncertainSettlement`: the settlement channel is being sent; Payment may or may not hold it;
 * - `overdueSettlement`: Core says the request is past its `settleBy` (the source of T1);
 * - `openDispute`: the beneficiary disputes the cash evidence;
 * - `cashReturn`: a cash return is owed: open, or reported and not yet confirmed (the source of T2);
 * - `lateSettlementReview`: a verified success arrived after finality and awaits the owner's L-4 decision;
 * - `recoveryRestriction`: a recovery obligation is open (the source of T3).
 */
export const ASSISTANCE_EXCEPTIONS = [
  'collectionReportedNotSettled',
  'uncertainSettlement',
  'overdueSettlement',
  'openDispute',
  'cashReturn',
  'lateSettlementReview',
  'recoveryRestriction',
] as const;
export type AssistanceException = (typeof ASSISTANCE_EXCEPTIONS)[number];

/** A case's exceptions, in the order above: each is exactly the Core value its `EXCEPTION_FILTER` selects on. */
export function assistanceExceptions(
  input: AssistanceOversightInput,
): readonly AssistanceException[] {
  const present: Readonly<Record<AssistanceException, boolean>> = {
    collectionReportedNotSettled: input.state === 'cash_collected',
    uncertainSettlement: input.channel === 'uncertain',
    overdueSettlement: input.overdue === true,
    openDispute: input.openDispute,
    cashReturn: input.cashReturn === 'open' || input.cashReturn === 'return_reported',
    lateSettlementReview: input.lateSettlement === 'unapplied',
    recoveryRestriction: input.recovery === 'open',
  };
  return ASSISTANCE_EXCEPTIONS.filter((e) => present[e]);
}

/** Where each exception's answer comes from, so a reported collection is never shown as a verified fact. */
export const EXCEPTION_SOURCE = {
  collectionReportedNotSettled: 'report',
  uncertainSettlement: 'derived',
  overdueSettlement: 'derived',
  openDispute: 'report',
  cashReturn: 'derived',
  lateSettlementReview: 'fact',
  recoveryRestriction: 'derived',
} as const satisfies Readonly<Record<AssistanceException, AssistanceInformationSource>>;

/** The Core restriction an exception is the source of (they block NEW requests of the Organization only), else `null`. */
export const EXCEPTION_RESTRICTION = {
  collectionReportedNotSettled: null,
  uncertainSettlement: null,
  overdueSettlement: 'T1',
  openDispute: null,
  cashReturn: 'T2',
  lateSettlementReview: null,
  recoveryRestriction: 'T3',
} as const satisfies Readonly<Record<AssistanceException, AssistanceRestriction | null>>;

/** The existing A2 directory filter that lists one exception's cases: no new read and no new Core contract. */
export const EXCEPTION_FILTER = {
  collectionReportedNotSettled: { state: 'cash_collected' },
  uncertainSettlement: { channel: 'uncertain' },
  overdueSettlement: { overdue: true },
  openDispute: { disputed: true },
  cashReturn: { cashReturnOwed: true },
  lateSettlementReview: { lateUnapplied: true },
  recoveryRestriction: { recoveryOpen: true },
} as const satisfies Readonly<Record<AssistanceException, AssistanceCaseFilter>>;

export const isAssistanceException = (value: unknown): value is AssistanceException =>
  typeof value === 'string' && (ASSISTANCE_EXCEPTIONS as readonly string[]).includes(value);
