import {
  ASSISTANCE_REQUEST_STATES,
  AssistanceCorrection,
  AssistanceDispute,
  AssistanceDisputeReason,
  AssistanceInformationSource,
  AssistanceRequestState,
  AssistanceTerms,
  CashCollectionReport,
  CashReturnObligation,
  CashReturnState,
  CorrectableField,
  RecoverySurplus,
  SettlementChannelState,
} from './assistance.model';

/**
 * Deterministic mirrors of Core's Assistance invariants (Assistance A1), at nawara-core `0044b20` billing-service
 * `db/migrations/`. They explain and check what Core already enforces; Core stays the authority and decides every
 * transition. Nothing here moves money, applies a late settlement, or computes overdue, restrictions or outstanding amounts.
 */

/**
 * Why a change is refused, for explanation only. A reason without a prefix is Core's own constraint (or unique index) name at
 * `0044b20`, listed in `CORE_CONSTRAINTS`; a `local:` reason names a Core rule that Core enforces elsewhere (route authority,
 * service checks) or that this module states, and is never presented as a Core code.
 */
export type Verdict =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

/** Core constraint and index names used verbatim above (billing-service db/migrations at 0044b20). */
export const CORE_CONSTRAINTS: ReadonlySet<string> = new Set([
  'assistance_request_not_pending',
  'assistance_request_settled_by_purchase',
  'assistance_request_returned_by_confirmation',
  'assistance_request_amounts',
  'assistance_request_cash_time_order',
  'assistance_request_settle_by',
  'assistance_request_reporter_not_beneficiary',
  'assistance_request_collection_immutable',
  'assistance_settlement_channel_transition',
  'assistance_settlement_channel_closed_final',
  'assistance_settlement_channel_settled_purchase',
  'cash_return_obligation_time_order',
  'cash_return_obligation_reporter_not_beneficiary',
  'late_settlement_application_basis',
  'assistance_dispute_open_unique',
  'assistance_dispute_not_permitted',
  'assistance_dispute_resolution_shape',
  'assistance_correction_not_permitted',
  'assistance_correction_changes',
]);

const allow: Verdict = { allowed: true };
const refuse = (reason: string): Verdict => ({ allowed: false, reason });

// ── Assistance request lifecycle (0031_assistance_resolution.sql:36-75) ──────────────────────────────────────────────

/** The request transitions Core allows: pending → declined | cash_collected; cash_collected → settled | returned. */
export const REQUEST_TRANSITIONS: Readonly<
  Record<AssistanceRequestState, readonly AssistanceRequestState[]>
> = {
  pending: ['declined', 'cash_collected'],
  cash_collected: ['settled', 'returned'],
  declined: [],
  settled: [],
  returned: [],
};

/** What Core requires as evidence for the two guarded transitions. */
export interface RequestTransitionEvidence {
  /** A purchase exists for the request: only the purchase path settles it (E-12). */
  readonly purchaseExists: boolean;
  /** Its cash-return obligation is `confirmed_returned`: only the beneficiary's confirmation returns it (J-6). */
  readonly cashReturnConfirmed: boolean;
}

export function requestTransition(
  from: AssistanceRequestState,
  to: AssistanceRequestState,
  evidence: RequestTransitionEvidence,
): Verdict {
  if (!REQUEST_TRANSITIONS[from].includes(to)) return refuse('assistance_request_not_pending');
  if (to === 'settled' && !evidence.purchaseExists)
    return refuse('assistance_request_settled_by_purchase');
  if (to === 'returned' && !evidence.cashReturnConfirmed)
    return refuse('assistance_request_returned_by_confirmation');
  return allow;
}

export const isFinalRequestState = (state: AssistanceRequestState): boolean =>
  REQUEST_TRANSITIONS[state].length === 0;

/** Every state, for exhaustive tables. */
export const requestStates = (): readonly AssistanceRequestState[] => ASSISTANCE_REQUEST_STATES;

// ── Frozen terms and whole-amount collection (0029_assistance_request.sql:33-49; 0031:49-53) ──────────────────────────

/** The frozen terms are well formed: base > 0, fee ≥ 0, total = base + fee, safe integers, an ISO 4217 code. */
export function validTerms(terms: AssistanceTerms): Verdict {
  const integers = [terms.baseAmount, terms.feeAmount, terms.totalAmount].every(
    Number.isSafeInteger,
  );
  if (!integers || terms.baseAmount <= 0 || terms.feeAmount < 0)
    return refuse('assistance_request_amounts');
  if (terms.totalAmount !== terms.baseAmount + terms.feeAmount)
    return refuse('assistance_request_amounts');
  if (!/^[A-Z]{3}$/.test(terms.currency)) return refuse('local:currency_format');
  return allow;
}

/** Terms never change once frozen: any difference is refused. */
export function termsUnchanged(before: AssistanceTerms, after: AssistanceTerms): Verdict {
  const same =
    before.priceId === after.priceId &&
    before.currency === after.currency &&
    before.baseAmount === after.baseAmount &&
    before.feeAmount === after.feeAmount &&
    before.totalAmount === after.totalAmount;
  return same ? allow : refuse('local:terms_immutable');
}

const HOURS_72 = 72 * 60 * 60 * 1000;

/**
 * A cash-collection report is well formed: `consentAt ≤ cashCollectedAt ≤ reportedAt`, `settleBy` exactly
 * `cashCollectedAt + 72h`, and the reporter is not the beneficiary. It always covers the whole frozen total.
 */
export function validCollectionReport(
  report: CashCollectionReport,
  consentAt: string,
  beneficiaryUserId: string,
): Verdict {
  const consent = Date.parse(consentAt);
  const collected = Date.parse(report.cashCollectedAt);
  const reported = Date.parse(report.reportedAt);
  if (!(consent <= collected && collected <= reported))
    return refuse('assistance_request_cash_time_order');
  if (Date.parse(report.settleBy) !== collected + HOURS_72)
    return refuse('assistance_request_settle_by');
  if (report.reportedBy === beneficiaryUserId)
    return refuse('assistance_request_reporter_not_beneficiary');
  return allow;
}

/** The collection evidence never changes once recorded (`0031:47-50`): corrections append instead. */
export function collectionUnchanged(
  before: CashCollectionReport,
  after: CashCollectionReport,
): Verdict {
  const same =
    before.cashCollectedAt === after.cashCollectedAt &&
    before.reportedAt === after.reportedAt &&
    before.reportedBy === after.reportedBy &&
    before.settleBy === after.settleBy;
  return same ? allow : refuse('assistance_request_collection_immutable');
}

// ── Settlement channel (0030_assisted_settlement.sql:155-166) ─────────────────────────────────────────────────────────

export interface ChannelTransitionEvidence {
  /** The channel's payment request ended unsuccessfully (failed, cancelled, expired or rejected). */
  readonly paymentFinalUnsuccessful: boolean;
  /** The channel's invoice has its purchase. */
  readonly purchaseExists: boolean;
}

/** open ↔ uncertain while in flight; closed and settled are final; settled only from open or uncertain, with a purchase. */
export function channelTransition(
  from: SettlementChannelState,
  to: SettlementChannelState,
  evidence: ChannelTransitionEvidence,
): Verdict {
  if (from === to) return refuse('assistance_settlement_channel_transition');
  if (from === 'closed' || from === 'settled')
    return refuse('assistance_settlement_channel_transition');
  if (to === 'closed' && !evidence.paymentFinalUnsuccessful)
    return refuse('assistance_settlement_channel_closed_final');
  if (to === 'settled' && !evidence.purchaseExists)
    return refuse('assistance_settlement_channel_settled_purchase');
  return allow;
}

// ── Cash return (0030:311-332; 0031:244-300; 0040:1-30) ───────────────────────────────────────────────────────────────

export type CashReturnActor = 'organizationActor' | 'beneficiary' | 'lateSettlementApplication';

export interface CashReturnTransitionContext {
  readonly actor: CashReturnActor;
  /** An assistance dispute of the request is open: confirmation waits (J-4). */
  readonly disputeOpen: boolean;
}

/**
 * open → return_reported (the Organization actor); return_reported → confirmed_returned (the beneficiary, no open dispute);
 * open → superseded_by_settlement (only a `deadline` obligation, only by an L-4 application). The others are final.
 */
export function cashReturnTransition(
  obligation: Pick<CashReturnObligation, 'state' | 'origin'>,
  to: CashReturnState,
  context: CashReturnTransitionContext,
): Verdict {
  const from = obligation.state;
  if (from === 'open' && to === 'return_reported')
    return context.actor === 'organizationActor'
      ? allow
      : refuse('local:return_reported_by_organization');
  if (from === 'return_reported' && to === 'confirmed_returned') {
    if (context.actor !== 'beneficiary') return refuse('local:return_confirmed_by_beneficiary');
    return context.disputeOpen ? refuse('local:return_confirmation_waits_for_dispute') : allow;
  }
  if (from === 'open' && to === 'superseded_by_settlement') {
    if (context.actor !== 'lateSettlementApplication')
      return refuse('local:superseded_only_by_application');
    return obligation.origin === 'deadline' ? allow : refuse('late_settlement_application_basis');
  }
  return refuse('local:cash_return_final_or_unsupported');
}

/** A reported return keeps `cashCollectedAt ≤ returnedAt ≤ returnReportedAt` and is not reported by the beneficiary. */
export function validReturnReport(
  obligation: Pick<CashReturnObligation, 'cashCollectedAt' | 'returnReport'>,
  beneficiaryUserId: string,
): Verdict {
  const report = obligation.returnReport;
  if (report === null) return allow;
  const collected = Date.parse(obligation.cashCollectedAt);
  const returned = Date.parse(report.returnedAt);
  if (!(collected <= returned && returned <= Date.parse(report.returnReportedAt)))
    return refuse('cash_return_obligation_time_order');
  if (report.returnReportedBy === beneficiaryUserId)
    return refuse('cash_return_obligation_reporter_not_beneficiary');
  return allow;
}

// ── Disputes and owner corrections (0031:76-200) ──────────────────────────────────────────────────────────────────────

const DISPUTABLE_REQUEST_STATES: readonly AssistanceRequestState[] = [
  'cash_collected',
  'settled',
  'returned',
];

/** A beneficiary may open a dispute only about evidence that exists, and only one at a time. */
export function canOpenDispute(
  request: { readonly state: AssistanceRequestState },
  reason: AssistanceDisputeReason,
  facts: {
    readonly obligationExists: boolean;
    readonly returnReported: boolean;
    readonly openDispute: boolean;
  },
): Verdict {
  if (facts.openDispute) return refuse('assistance_dispute_open_unique');
  if (!DISPUTABLE_REQUEST_STATES.includes(request.state))
    return refuse('assistance_dispute_not_permitted');
  if (reason === 'cash_not_returned' && !facts.obligationExists)
    return refuse('assistance_dispute_not_permitted');
  if (reason === 'return_time_incorrect' && !facts.returnReported)
    return refuse('assistance_dispute_not_permitted');
  return allow;
}

/**
 * The reasons an owner can resolve: only by correcting a time (`timestamp_corrected`). `cash_not_returned` and
 * `collection_not_made` have no resolution in Core (S5 record §3, J-1): they stay open.
 */
export const RESOLVABLE_DISPUTE_REASONS: Readonly<
  Record<AssistanceDisputeReason, CorrectableField | null>
> = {
  collection_time_incorrect: 'cashCollectedAt',
  return_time_incorrect: 'returnedAt',
  cash_not_returned: null,
  collection_not_made: null,
};

/** A resolution is valid only as `timestamp_corrected` through a correction of the disputed field. */
export function validDisputeResolution(
  dispute: Pick<AssistanceDispute, 'reason' | 'state'>,
  correction: Pick<AssistanceCorrection, 'field'> | null,
): Verdict {
  if (dispute.state !== 'open') return refuse('local:dispute_already_resolved');
  const field = RESOLVABLE_DISPUTE_REASONS[dispute.reason];
  if (field === null) return refuse('local:dispute_reason_not_resolvable');
  if (correction === null || correction.field !== field)
    return refuse('assistance_dispute_resolution_shape');
  return allow;
}

/** An owner correction changes one asserted time, to a different value, on a request that has it. Never money. */
export function canCorrect(
  request: { readonly state: AssistanceRequestState },
  field: CorrectableField,
  facts: { readonly returnReported: boolean },
  correctedValue: string,
  currentValue: string,
): Verdict {
  if (!DISPUTABLE_REQUEST_STATES.includes(request.state))
    return refuse('assistance_correction_not_permitted');
  if (field === 'returnedAt' && !facts.returnReported)
    return refuse('assistance_correction_not_permitted');
  if (Date.parse(correctedValue) === Date.parse(currentValue))
    return refuse('assistance_correction_changes');
  return allow;
}

/** The effective value of an asserted time: the latest correction of that field (by sequence), else the original. */
export function effectiveTime(
  original: string,
  field: CorrectableField,
  corrections: readonly Pick<AssistanceCorrection, 'field' | 'sequence' | 'correctedValue'>[],
): string {
  const latest = corrections
    .filter((correction) => correction.field === field)
    .reduce<{ sequence: number; value: string } | null>(
      (best, correction) =>
        best === null || correction.sequence > best.sequence
          ? { sequence: correction.sequence, value: correction.correctedValue }
          : best,
      null,
    );
  return latest?.value ?? original;
}

// ── Recovery and surplus (0039_recovery.sql) ──────────────────────────────────────────────────────────────────────────

/** A recovery obligation is for the request's BASE amount only, in its currency (B10, D5). */
export function validRecoveryBase(
  base: { amount: number; currency: string },
  terms: AssistanceTerms,
): Verdict {
  return base.amount === terms.baseAmount && base.currency === terms.currency
    ? allow
    : refuse('local:recovery_base_only');
}

/** A surplus's resolution, as Core records it: owed, refunded (Path A) or repaid outside Core (Path B), then confirmed. */
export type SurplusResolution = 'owed' | 'refunded' | 'externalRecorded' | 'externalConfirmed';

export function surplusResolution(
  surplus: Pick<RecoverySurplus, 'refunded' | 'external'>,
): SurplusResolution {
  if (surplus.refunded) return 'refunded';
  if (surplus.external === null) return 'owed';
  return surplus.external.confirmed ? 'externalConfirmed' : 'externalRecorded';
}

// ── Facts, reports, decisions (Assistance plan §1) ────────────────────────────────────────────────────────────────────

/** Where each item of a case history comes from. A report is never presented as a verified fact. */
export const INFORMATION_SOURCE = {
  paymentSucceeded: 'fact',
  paymentFailed: 'fact',
  lateSuccess: 'fact',
  refundCompleted: 'fact',
  chargeback: 'fact',
  purchaseCreated: 'fact',
  consent: 'report',
  cashCollected: 'report',
  cashReturnReported: 'report',
  cashReturnConfirmed: 'report',
  lateSettlementAttested: 'report',
  disputeOpened: 'report',
  disputeResponse: 'report',
  ownerCorrection: 'decision',
  disputeResolved: 'decision',
  lateSettlementApplied: 'decision',
  recoveryWrittenOff: 'decision',
  surplusExternalRecorded: 'decision',
  overdue: 'derived',
  restriction: 'derived',
  outstanding: 'derived',
} as const satisfies Readonly<Record<string, AssistanceInformationSource>>;

export type AssistanceHistoryItem = keyof typeof INFORMATION_SOURCE;
