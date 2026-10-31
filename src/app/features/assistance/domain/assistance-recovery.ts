import { RECEIPT_OPERATION_PURPOSE } from '../../../core/authorization/purpose-registry';
import { RecoveryObligationDetail, RecoverySurplusView } from './assistance-read.model';
import { AssistanceInformationSource } from './assistance.model';

/**
 * Recovery obligations and surpluses (Assistance A9): how an obligation stands, its history, and where each surplus owed to the
 * Organization is on Core's two resolution paths. A pure reading of Core's BIL-28 owner read at nawara-core `0044b20`
 * (billing-service `db/migrations/0039_recovery.sql`, `0042_reconciliation.sql`, `src/recovery/`); business references:
 * docs/design/assistance-a9-recovery.md.
 *
 * Read only, and no arithmetic: `recovered` and `outstanding` are Core's values, shown as Core states them. Nothing here collects,
 * allocates, refunds, records or writes anything off. A surplus is owed to the Organization: never revenue, never offset.
 */

/**
 * Where a surplus is (`recovery.service.ts:271`, R-3):
 * - `owed`: owed to the Organization, no resolution yet;
 * - `externalRecorded`: Path B, the owner recorded a repayment made outside Core (receipt + File evidence). NOT a provider fact:
 *   still unresolved until the receiving Organization confirms;
 * - `confirmed`: Path B, the receiving Organization's administrator confirmed it (resolved);
 * - `refunded`: Path A, the completed refund of an entirely-surplus payment resolved it.
 */
export type SurplusStage = 'owed' | 'externalRecorded' | 'confirmed' | 'refunded';

export function surplusStage(
  s: Pick<RecoverySurplusView, 'refundCaseId' | 'externalRecordedAt' | 'confirmedAt'>,
): SurplusStage {
  if (s.refundCaseId !== null) return 'refunded';
  if (s.confirmedAt !== null) return 'confirmed';
  if (s.externalRecordedAt !== null) return 'externalRecorded';
  return 'owed';
}

/** Where each surplus stage comes from: an owner's record is a decision, the Organization's confirmation a report. */
export const SURPLUS_STAGE_SOURCE = {
  owed: 'fact',
  externalRecorded: 'decision',
  confirmed: 'report',
  refunded: 'fact',
} as const satisfies Readonly<Record<SurplusStage, AssistanceInformationSource>>;

/** A surplus is resolved only by a completed refund or the Organization's confirmation: never by the owner's record alone. */
export const surplusResolved = (stage: SurplusStage): boolean =>
  stage === 'confirmed' || stage === 'refunded';

export interface RecoveryStanding {
  readonly state: RecoveryObligationDetail['state'];
  /** An active settlement channel: the Organization is paying. An attempt, never a recovery until Payment verifies it. */
  readonly paymentInProgress: boolean;
  /** Surpluses still owed to the Organization (owed, or recorded and awaiting its confirmation). */
  readonly surplusesUnresolved: number;
  /** Core's T3 on the Organization: while the obligation is open (FC-9). A surplus never re-opens it (R-5). */
  readonly restrictsOrganization: boolean;
}

export function recoveryStanding(
  o: Pick<RecoveryObligationDetail, 'state' | 'channels' | 'surpluses'>,
): RecoveryStanding {
  return {
    state: o.state,
    paymentInProgress: o.channels.some((c) => c.active),
    surplusesUnresolved: o.surpluses.filter((s) => !surplusResolved(surplusStage(s))).length,
    restrictsOrganization: o.state === 'open',
  };
}

/** One step of an obligation's history, with where it comes from. */
export interface RecoveryHistoryEntry {
  readonly kind:
    | 'opened'
    | 'channel'
    | 'payment'
    | 'recovered'
    | 'surplus'
    | 'surplusExternal'
    | 'surplusConfirmed';
  readonly at: string;
  readonly source: AssistanceInformationSource;
  /** The record the step is about (a channel, payment or surplus id), `null` for the obligation itself. */
  readonly ref: string | null;
}

const KIND_ORDER: readonly RecoveryHistoryEntry['kind'][] = [
  'opened',
  'channel',
  'payment',
  'surplus',
  'recovered',
  'surplusExternal',
  'surplusConfirmed',
];

/**
 * An obligation's history, oldest first: Core opened it from a verified full final loss; each settlement channel (an attempt);
 * each Payment-verified recovery payment (a fact); each surplus recorded with its payment; the recovery; the owner's external
 * records (decisions) and the Organization's confirmations (reports). Only times Core states; a refund's own time is not in the
 * owner read, so a refunded surplus shows its stage, not a date.
 */
export function recoveryHistory(o: RecoveryObligationDetail): readonly RecoveryHistoryEntry[] {
  const entries: RecoveryHistoryEntry[] = [
    { kind: 'opened', at: o.openedAt, source: 'derived', ref: null },
    ...o.channels.map((c) => ({
      kind: 'channel' as const,
      at: c.createdAt,
      source: 'report' as const,
      ref: c.id,
    })),
    ...o.payments.map((p) => ({
      kind: 'payment' as const,
      at: p.recordedAt,
      source: 'fact' as const,
      ref: p.id,
    })),
    ...o.surpluses.map((s) => ({
      kind: 'surplus' as const,
      at: s.recordedAt,
      source: 'fact' as const,
      ref: s.id,
    })),
    ...o.surpluses.flatMap((s) =>
      s.externalRecordedAt === null
        ? []
        : [
            {
              kind: 'surplusExternal' as const,
              at: s.externalRecordedAt,
              source: 'decision' as const,
              ref: s.id,
            },
          ],
    ),
    ...o.surpluses.flatMap((s) =>
      s.confirmedAt === null
        ? []
        : [
            {
              kind: 'surplusConfirmed' as const,
              at: s.confirmedAt,
              source: 'report' as const,
              ref: s.id,
            },
          ],
    ),
  ];
  if (o.recoveredAt !== null)
    entries.push({ kind: 'recovered', at: o.recoveredAt, source: 'derived', ref: null });
  return entries.sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind),
  );
}

/**
 * The actions on recovery and surplus, who Core lets take them, and none of them in Admin (A9 is read only):
 * - the Organization's administrator starts a settlement (BIL-29) and confirms an external surplus repayment (BIL-31);
 * - the owner records an external surplus repayment (BIL-30, T3 receipt `recovery_surplus_external` + File evidence: CF-71),
 *   refunds an entirely-surplus payment (Path A, T3 receipt `refund`), or writes the obligation off (BIL-34, T3 receipt
 *   `recovery_write_off`: accounting only, the obligation and T3 stay).
 */
export const RECOVERY_AUTHORITY = {
  surplusExternal: { operation: 'recovery_surplus_external', register: 'BIL-30' },
  surplusRefund: { operation: 'refund', register: 'BIL-23' },
  writeOff: { operation: 'recovery_write_off', register: 'BIL-34' },
} as const satisfies Readonly<
  Record<string, { operation: keyof typeof RECEIPT_OPERATION_PURPOSE; register: string }>
>;
