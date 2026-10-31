import { ASSISTANCE_STEP_UP_PURPOSE } from '../../../core/authorization/purpose-registry';
import { AssistanceCaseDetail, LateSettlementDetail } from './assistance-read.model';
import {
  AssistanceCorrection,
  AssistanceDispute,
  AssistanceDisputeReason,
  CorrectableField,
} from './assistance.model';
import {
  DISPUTABLE_REQUEST_STATES,
  RESOLVABLE_DISPUTE_REASONS,
  effectiveTime,
} from './assistance.rules';

/**
 * Assistance DISPUTES and owner timestamp CORRECTIONS (Assistance A7): how each dispute stands, what Core would let the owner do
 * about it, and what an open dispute holds. A pure reading of Core's records at nawara-core `0044b20` (billing-service
 * `db/migrations/0031_assistance_resolution.sql`, `src/assistance/`); business references: docs/design/assistance-a7-disputes.md.
 *
 * Read only. Admin offers no correction and no resolution: both are owner commands behind a T2 step-up (F1), not authorized.
 * Nothing here changes a time, an amount or a state, and nothing turns a report into a fact.
 */

/** Which recorded evidence a reason disputes, and therefore what must exist before a beneficiary can file it (`0031:177-183`). */
export type DisputedEvidence = 'collectionReport' | 'collectionTime' | 'cashReturn' | 'returnTime';

export const DISPUTED_EVIDENCE = {
  collection_not_made: 'collectionReport',
  collection_time_incorrect: 'collectionTime',
  cash_not_returned: 'cashReturn',
  return_time_incorrect: 'returnTime',
} as const satisfies Readonly<Record<AssistanceDisputeReason, DisputedEvidence>>;

/**
 * Where a dispute stands on Core's only resolution path (J-1, J-2, H-6):
 * - `resolved`: closed as `timestamp_corrected`, resting on an owner correction;
 * - `noResolutionInCore`: `cash_not_returned` or `collection_not_made`: Core has NO resolution; it stays open (never invented here);
 * - `awaitingCorrection`: a timestamp dispute with no owner correction of exactly the disputed time appended after it opened;
 * - `correctionRecorded`: such a correction exists; Core would accept a resolution resting on it (still the owner's decision).
 */
export type DisputeStanding =
  'resolved' | 'noResolutionInCore' | 'awaitingCorrection' | 'correctionRecorded';

/** The owner correction a timestamp dispute's resolution may rest on: exactly the disputed field, appended after it opened. */
export function qualifyingCorrection(
  dispute: Pick<AssistanceDispute, 'reason' | 'openedAt'>,
  corrections: readonly Pick<AssistanceCorrection, 'id' | 'field' | 'correctedAt' | 'sequence'>[],
): string | null {
  const field = RESOLVABLE_DISPUTE_REASONS[dispute.reason];
  if (field === null) return null;
  const opened = Date.parse(dispute.openedAt);
  const latest = corrections
    .filter((c) => c.field === field && Date.parse(c.correctedAt) >= opened)
    .reduce<Pick<AssistanceCorrection, 'id' | 'sequence'> | null>(
      (best, c) => (best === null || c.sequence > best.sequence ? c : best),
      null,
    );
  return latest?.id ?? null;
}

export function disputeStanding(
  dispute: Pick<AssistanceDispute, 'reason' | 'state' | 'openedAt'>,
  corrections: readonly Pick<AssistanceCorrection, 'id' | 'field' | 'correctedAt' | 'sequence'>[],
): DisputeStanding {
  if (dispute.state === 'resolved') return 'resolved';
  if (RESOLVABLE_DISPUTE_REASONS[dispute.reason] === null) return 'noResolutionInCore';
  return qualifyingCorrection(dispute, corrections) === null
    ? 'awaitingCorrection'
    : 'correctionRecorded';
}

/**
 * What an OPEN assistance dispute holds in Core, and what it never holds:
 * - `cashReturnConfirmation`: the beneficiary cannot confirm a reported return (`409 assistance_dispute_open`, J-4);
 * - `lateSettlementApplication`: an L-4 application is refused (`dispute_open`, `src/late-settlements/late-settlement.service.ts:261`);
 * - `secondDispute`: one open dispute per request (`assistance_dispute_open_unique`).
 * Never held: a verified electronic settlement, the cash-return sweep, any amount or obligation (`assistance.controller.ts:264-266`).
 * An assistance dispute is not a restriction (T1/T2/T3) and blocks no new request of the Organization by itself.
 */
export const OPEN_DISPUTE_HOLDS = [
  'cashReturnConfirmation',
  'lateSettlementApplication',
  'secondDispute',
] as const;
export type OpenDisputeHold = (typeof OPEN_DISPUTE_HOLDS)[number];

/** Whether a hold affects this case NOW: a reported return awaiting confirmation, an unapplied late settlement. */
export function holdsInEffect(
  detail: Pick<AssistanceCaseDetail, 'disputes' | 'cashReturns'>,
  lateSettlements: readonly Pick<LateSettlementDetail, 'applied'>[],
): Readonly<Record<OpenDisputeHold, boolean>> {
  const open = detail.disputes.some((d) => d.state === 'open');
  return {
    cashReturnConfirmation: open && detail.cashReturns.at(-1)?.state === 'return_reported',
    lateSettlementApplication: open && lateSettlements.some((l) => !l.applied),
    secondDispute: open,
  };
}

/**
 * Whether Core would accept an owner correction of a field (presentation only: never a command). Core's guards
 * (`0031:135-160`): the request carries cash evidence; `returnedAt` only once a return was reported; the corrected value must differ
 * and keep the time order (checked by Core when the value is known). `notReported`: there is no such asserted time to correct.
 */
export interface CorrectionEligibility {
  readonly field: CorrectableField;
  readonly eligible: boolean;
  /** The Organization's original assertion (never changed), or `null` when it was never reported. */
  readonly original: string | null;
  /** The time in force: the latest correction, else the original (`billing_assistance_effective_time`). */
  readonly effective: string | null;
  readonly corrections: number;
}

export function correctionEligibility(
  detail: Pick<AssistanceCaseDetail, 'request' | 'cashReturns' | 'corrections'>,
): readonly CorrectionEligibility[] {
  const { request, corrections } = detail;
  const evidence = DISPUTABLE_REQUEST_STATES.includes(request.state);
  const collected = request.collection?.cashCollectedAt ?? null;
  const returned = detail.cashReturns.at(-1)?.returnReport?.returnedAt ?? null;
  const of = (field: CorrectableField, original: string | null): CorrectionEligibility => ({
    field,
    eligible: evidence && original !== null,
    original,
    effective: original === null ? null : effectiveTime(original, field, corrections),
    corrections: corrections.filter((c) => c.field === field).length,
  });
  return [of('cashCollectedAt', collected), of('returnedAt', returned)];
}

/**
 * Core's authority for the two owner decisions, as a FUTURE capability: the Company owner of the request's Platform (live), with a
 * fresh factor step-up of the operation's own purpose, verified by Billing through Auth (T2). Never an operator, never a party to
 * the request, never the beneficiary (`assistance.controller.ts:382-386`; `0031:146-148`). Admin offers neither (F1 not authorized).
 */
export const OWNER_DISPUTE_AUTHORITY = {
  correct: {
    purpose: ASSISTANCE_STEP_UP_PURPOSE.correct,
    register: 'BIL-19',
    route: 'POST /billing/admin/assistance-requests/:id/corrections',
  },
  resolve: {
    purpose: ASSISTANCE_STEP_UP_PURPOSE.disputeResolve,
    register: 'BIL-22',
    route: 'POST /billing/admin/assistance-disputes/:id/resolution',
  },
} as const;
