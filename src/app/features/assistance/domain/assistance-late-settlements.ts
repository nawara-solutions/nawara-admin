import { RECEIPT_OPERATION_PURPOSE } from '../../../core/authorization/purpose-registry';
import { AssistanceCaseDetail, LateSettlementDetail } from './assistance-read.model';
import {
  AssistanceInformationSource,
  CashReturnObligation,
  LateApplicationReason,
  LateSettlementRefusal,
} from './assistance.model';

/**
 * Late assisted settlements and cash returns (Assistance A8): where a late settlement stands on the owner's L-4 decision, its
 * decision history, and what a cash return awaits. A pure reading of Core's records at nawara-core `0044b20` (billing-service
 * `src/late-settlements/late-settlement.service.ts`, `db/migrations/0040_late_settlement_application.sql`, `src/assistance/`);
 * business references: docs/design/assistance-a8-late-settlements.md.
 *
 * Read only. Admin issues no receipt and applies nothing: L-4 is an owner command behind a T3 receipt (F1), not authorized. A
 * late settlement is always a Payment-verified success Core recorded; it is never applied automatically and never by time.
 */

/**
 * Where a late settlement stands on the owner's L-4 decision, read in Core's own refusal order (`precheck`,
 * `late-settlement.service.ts:243-272`; the database re-checks every one):
 * - `applied`: the owner applied it, on the basis `reasonCode` (a decision);
 * - `refused`: Core would refuse an application now, for `reason` (one of its closed refusals);
 * - `attested`: no refusal Admin can see, and the beneficiary attested `cash_not_returned` (Path A's basis exists);
 * - `needsBasis`: no refusal Admin can see, but no attestation: Path A awaits the beneficiary's statement, Path B needs File
 *   evidence, which has no human path (CF-71).
 * Pending is never applied: only `applied` settles anything.
 */
export type LateStanding =
  | { readonly kind: 'applied'; readonly reasonCode: LateApplicationReason }
  | { readonly kind: 'refused'; readonly reason: LateSettlementRefusal }
  | { readonly kind: 'attested' }
  | { readonly kind: 'needsBasis' };

/** What the standing reads from the late settlement's case. */
export type LateStandingCase = Pick<
  AssistanceCaseDetail,
  'cashReturns' | 'disputes' | 'channel'
> & {
  readonly request: Pick<AssistanceCaseDetail['request'], 'state'>;
};

export interface LateStandingResult {
  readonly standing: LateStanding;
  /**
   * Refusals Admin cannot decide from what it reads: a CANCELLED refund case refuses (`refund_exists`) only when its authorization
   * was relayed, which Core checks and Admin does not see. Shown as "Nawara Core decides", never guessed.
   */
  readonly undetermined: readonly LateSettlementRefusal[];
}

export function lateStanding(
  late: Pick<
    LateSettlementDetail,
    'applied' | 'application' | 'attestation' | 'settledAt' | 'refundCases'
  >,
  kase: LateStandingCase,
): LateStandingResult {
  const result = (standing: LateStanding, undetermined: LateSettlementRefusal[] = []) => ({
    standing,
    undetermined,
  });
  if (late.applied && late.application !== null)
    return result({ kind: 'applied', reasonCode: late.application.reasonCode });
  const refused = (reason: LateSettlementRefusal) => result({ kind: 'refused', reason });
  const state = kase.request.state;
  // `settled` is reached only through a purchase (E-12); `returned` only through a confirmed return (J-6).
  if (state === 'settled') return refused('purchase_exists');
  if (kase.cashReturns.some((o) => o.state === 'confirmed_returned'))
    return refused('cash_return_confirmed');
  if (state !== 'cash_collected') return refused('request_not_settleable');
  if (kase.cashReturns.some((o) => o.state === 'return_reported'))
    return refused('cash_return_reported');
  if (kase.disputes.some((d) => d.state === 'open')) return refused('dispute_open');
  // A late success is recorded on a channel that is final; a channel still open or uncertain is another settlement in progress.
  if (kase.channel?.state === 'open' || kase.channel?.state === 'uncertain')
    return refused('settlement_in_progress');
  if (late.refundCases.some((r) => r.status !== 'cancelled')) return refused('refund_exists');
  const undetermined: LateSettlementRefusal[] =
    late.refundCases.length > 0 ? ['refund_exists'] : [];
  if (late.attestation === 'cash_returned') return refused('evidence_contradictory');
  if (late.settledAt === null) return refused('settlement_time_unavailable');
  return result(
    late.attestation === 'cash_not_returned' ? { kind: 'attested' } : { kind: 'needsBasis' },
    undetermined,
  );
}

/** One step of a late settlement's history, with where it comes from. */
export interface LateHistoryEntry {
  readonly kind: 'lateSuccess' | 'recorded' | 'attested' | 'applied';
  readonly at: string;
  readonly source: AssistanceInformationSource;
}

/**
 * A late settlement's history, oldest first: Payment's verified success (its original instant, when Core can state it), Core's
 * recording of it, the beneficiary's attestation (a statement), and the owner's application (a decision). Nothing is inferred:
 * an unknown instant is left out, never invented.
 */
export function lateHistory(
  late: Pick<LateSettlementDetail, 'settledAt' | 'recordedAt' | 'attestedAt' | 'application'>,
): readonly LateHistoryEntry[] {
  const entries: LateHistoryEntry[] = [];
  if (late.settledAt !== null)
    entries.push({ kind: 'lateSuccess', at: late.settledAt, source: 'fact' });
  entries.push({ kind: 'recorded', at: late.recordedAt, source: 'fact' });
  if (late.attestedAt !== null)
    entries.push({ kind: 'attested', at: late.attestedAt, source: 'report' });
  if (late.application !== null)
    entries.push({ kind: 'applied', at: late.application.appliedAt, source: 'decision' });
  const order = ['lateSuccess', 'recorded', 'attested', 'applied'];
  return entries.sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || order.indexOf(a.kind) - order.indexOf(b.kind),
  );
}

/**
 * The obligation an L-4 application would supersede: the request's LIVE obligation, only when it is `open` and of `deadline` origin
 * (`0040:6-13`, `late_settlement_application_basis`). A reported return is never superseded (Core refuses the application).
 */
export const supersedable = (
  cashReturns: readonly Pick<CashReturnObligation, 'id' | 'state' | 'origin'>[],
): string | null =>
  cashReturns.find((o) => o.state === 'open' && o.origin === 'deadline')?.id ?? null;

/**
 * What a cash return awaits, from Core's state: the Organization's report (`open`), the beneficiary's confirmation
 * (`return_reported`: a REPORT, not a completion), or nothing (`confirmed_returned`, `superseded_by_settlement`). A confirmation is
 * held while an assistance dispute of the request is open (J-4).
 */
export type CashReturnAwaiting = 'organizationReport' | 'beneficiaryConfirmation' | null;

export function cashReturnStanding(
  obligation: Pick<CashReturnObligation, 'state'>,
  openDispute: boolean,
): {
  readonly awaiting: CashReturnAwaiting;
  /** Only a beneficiary's confirmation or an applied late settlement discharges the obligation. */
  readonly discharged: boolean;
  readonly confirmationHeld: boolean;
} {
  const awaiting: CashReturnAwaiting =
    obligation.state === 'open'
      ? 'organizationReport'
      : obligation.state === 'return_reported'
        ? 'beneficiaryConfirmation'
        : null;
  return {
    awaiting,
    discharged:
      obligation.state === 'confirmed_returned' || obligation.state === 'superseded_by_settlement',
    confirmationHeld: obligation.state === 'return_reported' && openDispute,
  };
}

/**
 * Core's authority for L-4, as a FUTURE capability: the Company owner of the late settlement's Platform (live), with an Auth
 * authorization RECEIPT of operation `late_settlement_apply` (T3; its factor step-up purpose, `RECEIPT_OPERATION_PURPOSE.late_settlement_apply`, is consumed at
 * issuance), bound to this Company, late settlement, request, beneficiary and reason code (`late-settlement.service.ts:312-316`).
 * Admin issues no receipt and offers no application (F1 not authorized).
 */
export const LATE_APPLICATION_AUTHORITY = {
  operation: 'late_settlement_apply',
  purpose: RECEIPT_OPERATION_PURPOSE.late_settlement_apply,
  register: 'BIL-32',
  route: 'POST /billing/admin/late-settlements/:id/application',
} as const;
