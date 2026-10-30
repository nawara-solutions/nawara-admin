import {
  AssistanceCaseDetail,
  LateSettlementDetail,
  LateSettlementStatus,
  RecoveryObligationDetail,
} from './assistance-read.model';
import {
  AssistanceInformationSource,
  AssistanceRequestState,
  CashReturnState,
  RecoveryObligationState,
  SettlementChannelState,
} from './assistance.model';

/**
 * Cash collection and settlement OVERSIGHT (Assistance A6): how one case stands at each stage, and where each answer comes from.
 * A pure reading of Core's states, never a decision: it computes no amount, no deadline and no restriction (Core derives
 * overdue and T1/T2/T3), and it never turns a report into a fact. Business references (nawara-core `0044b20` billing-service
 * `db/migrations/`): docs/design/assistance-a6-oversight.md.
 */

/** The Core values the oversight reads: the same on a directory row and on a case. */
export interface AssistanceOversightInput {
  readonly state: AssistanceRequestState;
  /** Core's `settleBy` (`cashCollectedAt + 72h`), `null` before collection. */
  readonly settleBy: string | null;
  /** Core-derived (unresolved and past `settleBy`); `null` when not stated. */
  readonly overdue: boolean | null;
  readonly channel: SettlementChannelState | null;
  readonly cashReturn: CashReturnState | null;
  readonly lateSettlement: LateSettlementStatus | null;
  readonly recovery: RecoveryObligationState | null;
  readonly openDispute: boolean;
}

/**
 * The Organization's collection: `reported` is a REPORT of the whole frozen total in cash (`0029:8-11`: "evidence, never
 * settlement"); there is no partial collection and no amount in it.
 */
export type CollectionStage = 'notCollected' | 'declined' | 'reported';

/**
 * Electronic settlement of the base through the channel (`0030:5-16`):
 * - `none`: no channel (not collected, or declined);
 * - `inProgress` (`open`), `uncertain` (being sent; Payment may or may not hold it): NOT settled;
 * - `verified`: `settled`, only together with the request's purchase (a Payment-verified success);
 * - `verifiedLate`: a verified success arrived after finality and the OWNER applied it (L-4);
 * - `lateUnapplied`: a verified success arrived after finality and awaits the owner: the request is not settled by it;
 * - `closedUnpaid`: the payment ended unsuccessfully (never closed by time).
 */
export type SettlementStage =
  | 'none'
  | 'inProgress'
  | 'uncertain'
  | 'verified'
  | 'verifiedLate'
  | 'lateUnapplied'
  | 'closedUnpaid';

/**
 * The 72-hour deadline (`0029:59`): `none` before collection; `running` until `settleBy`; `overdue` per Core (T1); `met` once the
 * request is resolved (settled or returned).
 */
export type DeadlineStage = 'none' | 'running' | 'overdue' | 'met';

/**
 * The cash return the Organization owes the beneficiary when the deadline passes unsettled (`0030:17-19`, `0040:23`):
 * `owed` (open), `reported` (the Organization's REPORT: it does not discharge the obligation), `confirmed` (the beneficiary
 * confirmed it), `superseded` (an applied late settlement replaced it).
 */
export type CashReturnStage = 'none' | 'owed' | 'reported' | 'confirmed' | 'superseded';

export type RecoveryStage = 'none' | 'open' | 'recovered';

export interface AssistanceOversight {
  readonly collection: CollectionStage;
  readonly settlement: SettlementStage;
  readonly deadline: DeadlineStage;
  readonly cashReturn: CashReturnStage;
  readonly recovery: RecoveryStage;
  /** An open assistance dispute: unresolved until Core resolves it (only by a timestamp correction, and not for every reason). */
  readonly unresolvedDispute: boolean;
  /** Whether the owner should look at this case: Core says something is overdue, owed, disputed, awaiting or recovering. */
  readonly attention: boolean;
}

/** Where each stage's answer comes from, so a report is never shown as a fact. */
export const STAGE_SOURCE: {
  readonly collection: Readonly<Record<CollectionStage, AssistanceInformationSource | null>>;
  readonly settlement: Readonly<Record<SettlementStage, AssistanceInformationSource | null>>;
  readonly deadline: Readonly<Record<DeadlineStage, AssistanceInformationSource | null>>;
  readonly cashReturn: Readonly<Record<CashReturnStage, AssistanceInformationSource | null>>;
  readonly recovery: Readonly<Record<RecoveryStage, AssistanceInformationSource | null>>;
} = {
  collection: { notCollected: null, declined: 'report', reported: 'report' },
  settlement: {
    none: null,
    inProgress: 'derived',
    uncertain: 'derived',
    verified: 'fact',
    verifiedLate: 'decision',
    lateUnapplied: 'fact',
    closedUnpaid: 'fact',
  },
  deadline: { none: null, running: 'derived', overdue: 'derived', met: 'derived' },
  cashReturn: {
    none: null,
    owed: 'derived',
    reported: 'report',
    confirmed: 'report',
    superseded: 'decision',
  },
  recovery: { none: null, open: 'derived', recovered: 'fact' },
};

/** Reads one case's oversight from Core's values. Pure and total. */
export function assistanceOversight(input: AssistanceOversightInput): AssistanceOversight {
  const collection: CollectionStage =
    input.state === 'declined' ? 'declined' : input.settleBy === null ? 'notCollected' : 'reported';

  const settlement: SettlementStage =
    input.lateSettlement === 'applied'
      ? 'verifiedLate'
      : input.channel === 'settled'
        ? 'verified'
        : input.lateSettlement === 'unapplied'
          ? 'lateUnapplied'
          : input.channel === 'closed'
            ? 'closedUnpaid'
            : input.channel === 'uncertain'
              ? 'uncertain'
              : input.channel === 'open'
                ? 'inProgress'
                : 'none';

  const deadline: DeadlineStage =
    input.settleBy === null
      ? 'none'
      : input.state === 'settled' || input.state === 'returned'
        ? 'met'
        : input.overdue === true
          ? 'overdue'
          : 'running';

  const cashReturn: CashReturnStage =
    input.cashReturn === 'open'
      ? 'owed'
      : input.cashReturn === 'return_reported'
        ? 'reported'
        : input.cashReturn === 'confirmed_returned'
          ? 'confirmed'
          : input.cashReturn === 'superseded_by_settlement'
            ? 'superseded'
            : 'none';

  const recovery: RecoveryStage = input.recovery ?? 'none';

  return {
    collection,
    settlement,
    deadline,
    cashReturn,
    recovery,
    unresolvedDispute: input.openDispute,
    attention:
      deadline === 'overdue' ||
      settlement === 'uncertain' ||
      settlement === 'lateUnapplied' ||
      cashReturn === 'owed' ||
      cashReturn === 'reported' ||
      recovery === 'open' ||
      input.openDispute,
  };
}

/** The same input from one case's records (the case page), so a row and its case always agree. */
export function oversightInputOfCase(
  detail: AssistanceCaseDetail,
  lateSettlements: readonly Pick<LateSettlementDetail, 'applied'>[],
  recovery: Pick<RecoveryObligationDetail, 'state'> | null,
): AssistanceOversightInput {
  return {
    state: detail.request.state,
    settleBy: detail.request.collection?.settleBy ?? null,
    overdue: detail.overdue,
    channel: detail.channel?.state ?? null,
    cashReturn: detail.cashReturns.at(-1)?.state ?? null,
    lateSettlement: lateSettlements.some((l) => !l.applied)
      ? 'unapplied'
      : lateSettlements.length > 0
        ? 'applied'
        : null,
    recovery: recovery?.state ?? null,
    openDispute: detail.disputes.some((d) => d.state === 'open'),
  };
}

/** How a restriction clears, per Core's `billing_assistance_restrictions` (`0039_recovery.sql:425-440`). */
export const RESTRICTION_CLEARS = {
  T1: 'settledOrReturned',
  T2: 'returnConfirmedOrSuperseded',
  T3: 'principalRecovered',
} as const;
