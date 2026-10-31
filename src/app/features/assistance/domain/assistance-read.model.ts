import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import {
  ASSISTANCE_REQUEST_STATES,
  ASSISTANCE_DISPUTE_REASONS,
  ASSISTANCE_DISPUTE_STATES,
  AssistanceCorrection,
  AssistanceDispute,
  AssistanceDisputeReason,
  AssistanceDisputeState,
  AssistanceRequest,
  AssistanceRequestState,
  AssistanceRestriction,
  CASH_RETURN_STATES,
  CashReturnObligation,
  CashReturnState,
  LateApplicationReason,
  LateSettlement,
  Money,
  RecoveryObligation,
  RecoveryObligationState,
  RecoverySurplus,
  SettlementChannel,
  SettlementChannelState,
} from './assistance.model';

/**
 * Organization Assistance & Settlements: the owner's READ models (Assistance A2), built on the A1 domain types. They are what
 * Admin's assistance views need; they are not Core responses. Where Core has a matching owner read at nawara-core `0044b20`
 * (BIL-28, BIL-32, BIL-33) its field names are kept; everything else waits for a Core contract (`ASSISTANCE_READ_CONTRACTS`).
 *
 * Every value is Core's: Admin never computes overdue, restrictions, outstanding or recovered amounts, or eligibility.
 */

// ── Lists: filters and keyset pages ──────────────────────────────────────────────────────────────────────────────────

/**
 * Keyset paging, after Core's only owner list of this area (BIL-33 `GET /billing/admin/reconciliation-cases`: `after` = the
 * last id of the previous page, `limit` 1 to 200, default 100; billing-service `src/reconciliation/reconciliation.service.ts:324`).
 */
export const ASSISTANCE_PAGE_LIMIT = { min: 1, max: 200, default: 100 } as const;

export interface AssistancePageRequest {
  /** The cursor of the previous page (`null`: the first page). Opaque to Admin. */
  readonly after: string | null;
  readonly limit: number;
}

export const FIRST_ASSISTANCE_PAGE: AssistancePageRequest = {
  after: null,
  limit: ASSISTANCE_PAGE_LIMIT.default,
};

/**
 * One page. `next` is the cursor of the following page, `null` only when the source states that nothing follows. Note for a
 * later HTTP adapter: BIL-33 answers `{ items }` with no end marker and drops rows of Platforms the owner may not see AFTER its
 * `LIMIT` (`reconciliation.service.ts:330-335`), so a short or even empty page does not prove the end; no `next` can be derived
 * from it safely: CF-77 (docs/CORE-INTEGRATION.md §9).
 */
export interface AssistancePage<T> {
  readonly items: readonly T[];
  readonly next: string | null;
}

/** The directory's orders, by the beneficiary's consent time (ties by request id, so every order is total and stable). */
export type AssistanceCaseOrder = 'consentNewest' | 'consentOldest';

/** Case directory filters. Absent = no filter. `platformId` must match a Platform-scoped context (`assistance-read-context.ts`). */
export interface AssistanceCaseFilter {
  /** One case by its reference (the request's canonical UUID): an exact match, never a partial search. */
  readonly requestId?: string;
  readonly state?: AssistanceRequestState;
  readonly platformId?: PlatformId;
  readonly organizationId?: OrganizationId;
  /** Core-derived (T1 / T2), never computed by Admin. */
  readonly overdue?: boolean;
  readonly disputed?: boolean;
  /** The settlement channel's state (A6). */
  readonly channel?: SettlementChannelState;
  /** A cash return is owed: open or reported, not yet confirmed (A6; Core's T2 source). */
  readonly cashReturnOwed?: boolean;
  /** A late settlement awaits the owner's decision (A6). */
  readonly lateUnapplied?: boolean;
  /** A recovery obligation is open (A6; Core's T3 source). */
  readonly recoveryOpen?: boolean;
  /** Default `consentNewest`. */
  readonly order?: AssistanceCaseOrder;
}

export type LateSettlementStatus = 'applied' | 'unapplied';

export interface LateSettlementFilter {
  readonly status?: LateSettlementStatus;
  readonly platformId?: PlatformId;
  readonly organizationId?: OrganizationId;
}

export interface RecoveryFilter {
  readonly state?: RecoveryObligationState;
  readonly platformId?: PlatformId;
  readonly organizationId?: OrganizationId;
}

/**
 * Dispute discovery filters (A7). Absent = no filter. Core has NO owner list of assistance disputes at `0044b20` (CF-70): this is
 * Admin's requirement, answered only by the demo adapter as a projection of its scoped cases.
 */
export interface AssistanceDisputeFilter {
  readonly state?: AssistanceDisputeState;
  readonly reason?: AssistanceDisputeReason;
  readonly platformId?: PlatformId;
  readonly organizationId?: OrganizationId;
}

const DISPUTE_STATES: ReadonlySet<string> = new Set(ASSISTANCE_DISPUTE_STATES);
const DISPUTE_REASONS: ReadonlySet<string> = new Set(ASSISTANCE_DISPUTE_REASONS);

export const isAssistanceDisputeState = (value: unknown): value is AssistanceDisputeState =>
  typeof value === 'string' && DISPUTE_STATES.has(value);

export const isAssistanceDisputeReason = (value: unknown): value is AssistanceDisputeReason =>
  typeof value === 'string' && DISPUTE_REASONS.has(value);

/**
 * Cash-return discovery filters (A8). Absent = no filter. Core has NO owner read or list of cash-return obligations at `0044b20`
 * (CF-70): Admin's requirement, answered only by the demo adapter as a projection of its scoped cases.
 */
export interface CashReturnFilter {
  readonly state?: CashReturnState;
  /** Only obligations whose request has an open assistance dispute. */
  readonly disputed?: boolean;
  readonly platformId?: PlatformId;
  readonly organizationId?: OrganizationId;
}

const RETURN_STATES: ReadonlySet<string> = new Set(CASH_RETURN_STATES);

export const isCashReturnState = (value: unknown): value is CashReturnState =>
  typeof value === 'string' && RETURN_STATES.has(value);

const STATES: ReadonlySet<string> = new Set(ASSISTANCE_REQUEST_STATES);

/** A filter value that is not one of Core's (from a URL, for example): reported, never sent. */
export const isAssistanceRequestState = (value: unknown): value is AssistanceRequestState =>
  typeof value === 'string' && STATES.has(value);

// ── Views ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** A row of the case directory. */
export interface AssistanceCaseSummary {
  readonly requestId: string;
  readonly platformId: PlatformId;
  readonly organizationId: OrganizationId;
  readonly productId: string;
  readonly state: AssistanceRequestState;
  /** The frozen total (base + the Organization's fee), never recomputed. */
  readonly total: Money;
  /** Core's `settleBy` (`cashCollectedAt` + 72 h), or `null` before collection. */
  readonly settleBy: string | null;
  /** Core-derived; `null` when the source does not state it (never inferred from `settleBy` and a clock). */
  readonly overdue: boolean | null;
  readonly openDispute: boolean;
  /** The settlement channel's state, `null` when the request has none (pending or declined). */
  readonly channel: SettlementChannelState | null;
  /** `unapplied` when a recorded late settlement awaits the owner's decision, `applied` when one was applied, else `null`. */
  readonly lateSettlement: LateSettlementStatus | null;
  /** The recovery obligation's state, `null` when there is none. */
  readonly recovery: RecoveryObligationState | null;
  /** The cash-return obligation's state, `null` when none is owed or was ever owed (A6). */
  readonly cashReturn: CashReturnState | null;
}

/**
 * A row of the dispute overview (A7): one dispute, with its case's directory row for the collection and settlement context. Read
 * from the same records as the case; nothing is added that the case does not hold.
 */
export interface AssistanceDisputeSummary {
  readonly dispute: AssistanceDispute;
  readonly case: AssistanceCaseSummary;
}

/** A row of the cash-return monitor (A8): one obligation (current or history), with its case's directory row. */
export interface AssistanceCashReturnSummary {
  readonly obligation: CashReturnObligation;
  readonly case: AssistanceCaseSummary;
}

/** One case: the request and every record attached to it. */
export interface AssistanceCaseDetail {
  readonly request: AssistanceRequest;
  readonly channel: SettlementChannel | null;
  readonly cashReturns: readonly CashReturnObligation[];
  readonly disputes: readonly AssistanceDispute[];
  readonly corrections: readonly AssistanceCorrection[];
  readonly lateSettlementIds: readonly string[];
  readonly recoveryObligationId: string | null;
  /** Core's restrictions on the Organization (BIL-26), or `null` when not read. They block NEW requests only. */
  readonly restrictions: readonly AssistanceRestriction[] | null;
  readonly overdue: boolean | null;
}

/** Who stated an item of the history. `core`: Billing itself (a sweep, a deadline). */
export type AssistanceTimelineActor = 'beneficiary' | 'organization_actor' | 'owner' | 'core';

interface TimelineBase {
  readonly id: string;
  /** The time the item is about (for a report: the time the reporter asserts). */
  readonly at: string;
  /** When Core recorded it. */
  readonly recordedAt: string;
}

/**
 * One item of a case's history, by where it comes from (A1 `AssistanceInformationSource`): a provider-verified FACT, a
 * REPORT someone asserts, an owner DECISION, or a state Core DERIVED. A report is never shown as a fact.
 */
export type AssistanceTimelineEntry = TimelineBase &
  (
    | {
        readonly source: 'fact';
        readonly by: 'core';
        readonly kind:
          | 'settlementSucceeded'
          | 'settlementFailed'
          | 'lateSuccess'
          | 'refundCompleted'
          | 'chargebackFinal'
          | 'recoveryPayment';
      }
    | {
        readonly source: 'report';
        readonly by: 'beneficiary' | 'organization_actor';
        readonly kind:
          | 'consent'
          | 'declined'
          | 'cashCollected'
          | 'cashReturnReported'
          | 'cashReturnConfirmed'
          | 'disputeOpened'
          | 'disputeResponse'
          | 'lateAttestation';
      }
    | {
        readonly source: 'decision';
        readonly by: 'owner';
        readonly kind:
          | 'correction'
          | 'disputeResolved'
          | 'lateSettlementApplied'
          | 'writeOff'
          | 'surplusExternal';
      }
    | {
        readonly source: 'derived';
        readonly by: 'core';
        readonly kind: 'cashReturnOwed' | 'channelUncertain' | 'channelClosed' | 'recoveryOpened';
      }
  );

/** The settlement side of a case: its channel and the late successes recorded after finality. */
export interface AssistanceSettlementView {
  readonly channel: SettlementChannel | null;
  readonly lateSettlements: readonly LateSettlement[];
}

/** The disputes of a case and the owner's corrections (append-only; times only, never money). */
export interface AssistanceDisputeView {
  readonly disputes: readonly AssistanceDispute[];
  readonly corrections: readonly AssistanceCorrection[];
}

/** A late settlement with its decision and evidence state: the fields of Core's BIL-32 owner read (`late-settlement.service.ts:150-174`). */
export interface LateSettlementDetail extends LateSettlement {
  readonly platformId: PlatformId;
  readonly organizationId: OrganizationId;
  readonly recordedAt: string;
  /** The original instant of the late success, or `null` when Core cannot state it. */
  readonly settledAt: string | null;
  readonly attestedAt: string | null;
  readonly application: {
    /** The basis the owner applied it on (BIL-32 read, `late-settlement.service.ts:166-169`). */
    readonly reasonCode: LateApplicationReason;
    readonly appliedAt: string;
    readonly appliedBy: string;
    readonly receiptId: string;
    readonly purchaseId: string | null;
    readonly supersededObligationId: string | null;
  } | null;
  /** File evidence references only: Admin has no human File path (CF-71). */
  readonly evidence: readonly { readonly grantId: string; readonly verifiedAt: string }[];
  readonly refundCases: readonly { readonly id: string; readonly status: string }[];
}

/** Core's surplus states (`recovery.service.ts:270-272`). */
export type RecoverySurplusStatus =
  'owed_to_organization' | 'external_execution_evidenced' | 'resolved';

export interface RecoverySurplusView extends RecoverySurplus {
  readonly status: RecoverySurplusStatus;
}

/** A recovery obligation as Core's BIL-28 owner read states it (`recovery.controller.ts:40-57`): base only, never a fee. */
export interface RecoveryObligationDetail extends RecoveryObligation {
  readonly platformId: PlatformId;
  readonly disputeId: string;
  /** Core's values (`baseAmount - recovered`, never below 0): never recomputed. */
  readonly recovered: Money;
  readonly outstanding: Money;
  readonly openedAt: string;
  readonly recoveredAt: string | null;
  readonly payments: readonly {
    readonly id: string;
    readonly amount: number;
    readonly principalAmount: number;
    readonly surplusAmount: number;
    readonly recordedAt: string;
  }[];
  readonly surpluses: readonly RecoverySurplusView[];
}
