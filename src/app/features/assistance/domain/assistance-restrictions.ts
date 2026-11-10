import { RESTRICTION_CLEARS } from './assistance-oversight';
import { AssistanceCaseDetail } from './assistance-read.model';
import { AssistanceRestriction, AssistanceRestrictionRow } from './assistance.model';

/**
 * Reading Core's restrictions on an Organization (A10), from BIL-26's rows (`kind`, `sourceId`, `since`). Pure: Admin derives,
 * clears, extends or predicts no restriction. Verified at nawara-core `0044b20` (billing-service):
 * - ONE model, `billing_assistance_restrictions(organization, at)`, read at the database's current clock (`0032:1-21`, replaced by
 *   `0039:425-440`): T1 a request still `cash_collected` past its `settleBy`; T2 a cash-return obligation still `open` or
 *   `return_reported`; T3 an open recovery obligation;
 * - at `8d89bed` (S0-C14, development only; `0050:186`), an open obligation whose T3 the owner suspended yields no T3 row: BIL-26
 *   lists it under `suspended` (never a restriction, never a sign the debt ended; `assistance-restriction.service.ts`). Admin's
 *   read model does not carry `suspended`, and the demo records hold no suspension (WP-2.3, reported gap);
 * - each blocks NEW assistance requests of the Organization only: no discharge, read or collection path checks them (`0032:14-17`;
 *   BIL-26 description, `assistance.controller.ts:474`);
 * - each lasts exactly while its source qualifies: there is no timer, no repeat-violation state and no other clearance (FC-9);
 * - `inactive` (D6) is reserved and never returned (`src/assistance/assistance-restrictions.ts:11-16`).
 */

/** The record each kind points to: the request (T1), the cash-return obligation (T2), the recovery obligation (T3). */
export const RESTRICTION_SOURCE = {
  T1: 'request',
  T2: 'cashReturn',
  T3: 'recovery',
} as const satisfies Readonly<Record<AssistanceRestriction, string>>;

/** What `since` is: the request's `settleBy` (T1) or the obligation's opening (T2, T3) (BIL-26 `RestrictionDto.since`). */
export const RESTRICTION_SINCE = {
  T1: 'deadlinePassed',
  T2: 'obligationOpened',
  T3: 'obligationOpened',
} as const satisfies Readonly<Record<AssistanceRestriction, string>>;

/** How each kind ends, per Core's model (re-exported from the A6 oversight so the two never diverge). */
export const RESTRICTION_ENDS = RESTRICTION_CLEARS;

/**
 * What is NOT a restriction, though it can look like one (explained, never listed as T1/T2/T3):
 * - `assistanceDispute`: an open assistance dispute holds a few owner and beneficiary steps of ITS case (A7), never new requests;
 * - `paymentDispute`: a Payment dispute (a card chargeback, PAY-09) is Payment's; Billing's `refund_dispute_open` refuses a refund
 *   case (`src/refunds/refund-case.service.ts:109`), not an assistance request. Only a FULL final lost chargeback of an assisted
 *   purchase leads, through a recovery obligation, to T3;
 * - `fraudHold`: a fraud hold (BIL-27) is a separate owner control, not an assistance restriction;
 * - `inactivity`: D6 is reserved in Core and never returned (V-4).
 */
export const NOT_RESTRICTIONS = [
  'assistanceDispute',
  'paymentDispute',
  'fraudHold',
  'inactivity',
] as const;
export type NotARestriction = (typeof NOT_RESTRICTIONS)[number];

/** Whether a row's source is a record of the case being read, or of another case of the same Organization. */
export type RestrictionRelation = 'thisCase' | 'otherCase';

export function restrictionRelation(
  row: AssistanceRestrictionRow,
  detail: Pick<AssistanceCaseDetail, 'request' | 'cashReturns' | 'recoveryObligationId'>,
): RestrictionRelation {
  switch (row.kind) {
    case 'T1':
      return row.sourceId === detail.request.id ? 'thisCase' : 'otherCase';
    case 'T2':
      return detail.cashReturns.some((o) => o.id === row.sourceId) ? 'thisCase' : 'otherCase';
    case 'T3':
      return detail.recoveryObligationId === row.sourceId ? 'thisCase' : 'otherCase';
  }
}

/**
 * The case page a row's source opens, when Admin can name it: only a T1 source is an assistance request id. A T2 or T3 source is an
 * obligation id, and no owner read resolves an obligation to its request (CF-70, CF-68): it stays a reference.
 */
export const restrictionCasePath = (row: AssistanceRestrictionRow): string | null =>
  row.kind === 'T1' ? `/billing/assistance/${row.sourceId}` : null;

/** The distinct kinds of the rows, in Core's order (T1, T2, T3). */
export const restrictionKinds = (
  rows: readonly AssistanceRestrictionRow[],
): readonly AssistanceRestriction[] =>
  (['T1', 'T2', 'T3'] as const).filter((kind) => rows.some((row) => row.kind === kind));
