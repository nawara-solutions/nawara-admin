import { OrganizationId, PlatformId } from '../../../core/context/scope.model';

/**
 * Organization Assistance & Settlements: domain types (Assistance A1). Mirrored from nawara-core `0044b20` billing-service
 * (`db/migrations/0029`–`0042`, paths below relative to `apps/billing-service/`). Pure types: no gateway, mock or route yet.
 *
 * Nawara Admin is the Company owner's oversight view. Every state here is Core-owned: Admin reads it and never computes it.
 * The Organization's actor and the beneficiary act in their own applications; the owner's only decisions are timestamp
 * corrections, dispute resolutions, late-settlement applications, write-offs and external surplus records (F1 foundation).
 * Core values are machine values: never translated.
 *
 * OPEN contract questions (not modelled as facts):
 * - whether a surplus can be both refunded (Path A) and repaid externally (Path B): `surplusResolution` reads Path A first;
 * - the Organization actor's exact role (OD-07, V-5): Core checks "an administrator of its Organization", live;
 * - D6 inactivity and inactive-scope discharge (V-4, S5e) are not enforced in Core, so not modelled;
 * - Admin has no owner read or list of any of these records yet (CF-66, CF-68, CF-69, CF-70); File evidence has no human path
 *   (CF-71); no-key receipt outcomes stay blocked (CF-74).
 */

/** `assistance_request.status` (`db/migrations/0031_assistance_resolution.sql:24`). */
export const ASSISTANCE_REQUEST_STATES = [
  'pending',
  'declined',
  'cash_collected',
  'settled',
  'returned',
] as const;
export type AssistanceRequestState = (typeof ASSISTANCE_REQUEST_STATES)[number];

/** `assistance_settlement_channel.status` (`0030_assisted_settlement.sql:126`). */
export const SETTLEMENT_CHANNEL_STATES = ['open', 'uncertain', 'settled', 'closed'] as const;
export type SettlementChannelState = (typeof SETTLEMENT_CHANNEL_STATES)[number];

/** `cash_return_obligation.status` (`0040_late_settlement_application.sql:23`). */
export const CASH_RETURN_STATES = [
  'open',
  'return_reported',
  'confirmed_returned',
  'superseded_by_settlement',
] as const;
export type CashReturnState = (typeof CASH_RETURN_STATES)[number];

/** Why a cash return is owed (`0036_refund_commercial_effects.sql:76`). */
export type CashReturnOrigin = 'deadline' | 'refund_completion';

/** `assistance_dispute.reasonCode` (`0031_assistance_resolution.sql:90`): filed by the beneficiary only. */
export const ASSISTANCE_DISPUTE_REASONS = [
  'cash_not_returned',
  'collection_not_made',
  'collection_time_incorrect',
  'return_time_incorrect',
] as const;
export type AssistanceDisputeReason = (typeof ASSISTANCE_DISPUTE_REASONS)[number];

/** `assistance_dispute.status` and its only outcome (`0031:91-93`). */
export const ASSISTANCE_DISPUTE_STATES = ['open', 'resolved'] as const;
export type AssistanceDisputeState = (typeof ASSISTANCE_DISPUTE_STATES)[number];
export type AssistanceDisputeOutcome = 'timestamp_corrected';

/** The Organization actor's answer to a dispute: evidence only, it changes no state (`0031:216-223`, H-5). */
export const DISPUTE_RESPONSE_POSITIONS = ['accepts', 'contests'] as const;
export type DisputeResponsePosition = (typeof DISPUTE_RESPONSE_POSITIONS)[number];

/** The only correctable fields: Organization-asserted times, never money (`0031:117`, `:140-142`). */
export const CORRECTABLE_FIELDS = ['cashCollectedAt', 'returnedAt'] as const;
export type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];

/** `assistance_correction.reasonCode` (`0031:119`). */
export const CORRECTION_REASONS = ['actor_entry_error', 'evidence_contradicts_report'] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

/** `assistance_late_settlement.reason`: why a verified success arrived after finality (`0030:290`). */
export const LATE_SETTLEMENT_REASONS = [
  'channel_closed',
  'purchase_exists',
  'cash_return_obligation_exists',
  'request_not_settleable',
] as const;
export type LateSettlementReason = (typeof LATE_SETTLEMENT_REASONS)[number];

/** The beneficiary's attestation (`0040:79`). */
export type LateSettlementAttestation = 'cash_not_returned' | 'cash_returned';

/** Billing's closed refusals of an L-4 application (`src/late-settlements/late-settlement.service.ts:28-31`). */
export const LATE_SETTLEMENT_REFUSALS = [
  'purchase_exists',
  'cash_return_confirmed',
  'cash_return_reported',
  'request_not_settleable',
  'dispute_open',
  'settlement_in_progress',
  'refund_exists',
  'evidence_insufficient',
  'evidence_contradictory',
  'settlement_time_unavailable',
  'already_applied',
] as const;
export type LateSettlementRefusal = (typeof LATE_SETTLEMENT_REFUSALS)[number];

/** `recovery_obligation.status` (`0039_recovery.sql:34`). */
export type RecoveryObligationState = 'open' | 'recovered';

/** Restrictions Core derives (never stored; block NEW requests only). D6 inactivity is not enforced at `0044b20` (V-4). */
export type AssistanceRestriction = 'T1' | 'T2' | 'T3';

/** An amount in minor units with its ISO 4217 currency. */
export interface Money {
  readonly amount: number;
  readonly currency: string;
}

/** The terms frozen at consent: `totalAmount = baseAmount + feeAmount` (`0029_assistance_request.sql:20-49`). */
export interface AssistanceTerms {
  readonly priceId: string;
  readonly currency: string;
  readonly baseAmount: number;
  readonly feeAmount: number;
  readonly totalAmount: number;
}

/**
 * The Organization actor's report that the WHOLE total was collected in cash. There is no partial collection and no amount in
 * the report: the obligation is always the frozen total (`0029:33-48`). `cashCollectedAt` is asserted by the Organization;
 * `reportedAt` is Core's time; `settleBy` is exactly `cashCollectedAt + 72h`; the reporter is never the beneficiary.
 */
export interface CashCollectionReport {
  readonly cashCollectedAt: string;
  readonly reportedAt: string;
  readonly reportedBy: string;
  readonly settleBy: string;
}

export interface AssistanceRequest {
  readonly id: string;
  readonly beneficiaryUserId: string;
  readonly organizationId: OrganizationId;
  readonly platformId: PlatformId;
  readonly productId: string;
  readonly state: AssistanceRequestState;
  readonly terms: AssistanceTerms;
  readonly consentAt: string;
  readonly declined: {
    readonly at: string;
    readonly byRole: 'beneficiary' | 'organization_actor';
  } | null;
  readonly collection: CashCollectionReport | null;
}

export interface SettlementChannel {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly state: SettlementChannelState;
}

export interface CashReturnObligation {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly origin: CashReturnOrigin;
  readonly state: CashReturnState;
  /** The frozen total, the Organization's fee included (`0030:316`). */
  readonly amount: Money;
  readonly cashCollectedAt: string;
  readonly returnReport: {
    readonly returnedAt: string;
    readonly returnReportedAt: string;
    readonly returnReportedBy: string;
  } | null;
  readonly confirmedAt: string | null;
}

/**
 * A beneficiary's dispute of the cash evidence, as Core represents it (`src/assistance/assistance-settlement.view.ts:38-57`; no
 * actor id is exposed). It changes no financial fact: it never blocks a verified settlement or the obligation sweep.
 */
export interface AssistanceDispute {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly reason: AssistanceDisputeReason;
  readonly state: AssistanceDisputeState;
  /** Core's time (`clock_timestamp()` after the request lock, `0031:194`); there is no filing cutoff. */
  readonly openedAt: string;
  /** Core-derived: open for more than seven days. An escalation target only: it closes and starts nothing. */
  readonly escalationDue: boolean;
  /** The Organization actor's one answer, or `null` (never the beneficiary). */
  readonly response: {
    readonly position: DisputeResponsePosition;
    readonly respondedAt: string;
  } | null;
  readonly resolution: {
    readonly outcome: AssistanceDisputeOutcome;
    readonly correctionId: string;
    readonly resolvedAt: string;
  } | null;
}

/** An owner's append-only correction of one Organization-asserted time. It carries no amount, ever. */
export interface AssistanceCorrection {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly sequence: number;
  readonly field: CorrectableField;
  readonly correctedValue: string;
  readonly supersededValue: string;
  readonly reason: CorrectionReason;
  /** Core's time of the append (`0031:153`); a resolution rests only on a correction appended after the dispute opened. */
  readonly correctedAt: string;
}

/** A verified success recorded after finality: never applied automatically (S0 §3.4 L-1 to L-6). */
export interface LateSettlement {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly reason: LateSettlementReason;
  readonly attestation: LateSettlementAttestation | null;
  /** Set only by an owner's L-4 application (receipt-authorized), never by Admin or by time. */
  readonly applied: boolean;
}

/** A recovery obligation: the BASE amount of an assisted purchase lost to a full final chargeback (`0039:20-45`). */
export interface RecoveryObligation {
  readonly id: string;
  readonly assistanceRequestId: string;
  readonly organizationId: OrganizationId;
  readonly base: Money;
  readonly state: RecoveryObligationState;
}

/** A surplus owed to the Organization: never revenue, loss or access, no expiry (`0039:253-290`). */
export interface RecoverySurplus {
  readonly id: string;
  readonly obligationId: string;
  readonly organizationId: OrganizationId;
  readonly amount: Money;
  /** Path A: refunded through a completed refund case. */
  readonly refunded: boolean;
  /** Path B: the owner's record of a repayment outside Core (receipt + File evidence), then the Organization's confirmation. */
  readonly external: { readonly confirmed: boolean } | null;
}

/** Where an item of the case history comes from (docs: Assistance plan §1, "facts versus reports"). */
export type AssistanceInformationSource = 'fact' | 'report' | 'decision' | 'derived';
