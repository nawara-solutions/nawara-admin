import {
  CompanyId,
  OrganizationId,
  PlatformId,
  companyId,
  organizationId,
  platformId,
} from '../../../core/context/scope.model';
import {
  AssistanceCorrection,
  AssistanceDispute,
  AssistanceRequest,
  AssistanceRequestState,
  AssistanceTerms,
  CashReturnObligation,
  SettlementChannel,
  SettlementChannelState,
} from '../../../features/assistance/domain/assistance.model';
import {
  AssistanceTimelineEntry,
  LateSettlementDetail,
  RecoveryObligationDetail,
} from '../../../features/assistance/domain/assistance-read.model';
import { DemoWorldTables } from '../records';
import { DEMO_OWNER_USER_ID, DEMO_SCHOOL_PLATFORM_ID } from '../seed';

/**
 * The FICTIONAL Organization Assistance & Settlements cases of the demo world (Assistance A3; development builds only). Not Core
 * data and not a Core contract: deterministic scenarios that follow Core's states, invariants and actors at nawara-core `0044b20`
 * (billing-service migrations 0029–0042, A1 rules), so the owner's views can be built and reviewed.
 *
 * - A pure function of the demo world and `now`: every id, amount, instant and order is the same for the same clock.
 * - Read only: nothing here changes, and nothing ever moves money.
 * - Only the Nawara School Platform has assisted payments enabled in the demo world (Nawara Drive has them disabled), and two of
 *   its Organizations have them disabled: no case belongs to either.
 * - Beneficiaries are active members; the Organization actor is an administrator of the beneficiary's Organization (Core's
 *   live check), never the beneficiary.
 * - Whole-amount collection only (no amount in a report); cash returns owe the frozen total; recovery is the base only.
 * - Restrictions and "overdue" are what Core would derive (T1, T2, T3), computed by the demo adapter, never by a view.
 * - Records of ANOTHER Company are included on purpose, so isolation can be tested: no owner read may ever return them.
 */

/** One case: an assistance request and every record attached to it. */
export interface DemoAssistanceCase {
  readonly companyId: CompanyId;
  readonly request: AssistanceRequest;
  readonly channel: SettlementChannel | null;
  readonly cashReturns: readonly CashReturnObligation[];
  readonly disputes: readonly AssistanceDispute[];
  readonly corrections: readonly AssistanceCorrection[];
  readonly lateSettlements: readonly LateSettlementDetail[];
  readonly recovery: RecoveryObligationDetail | null;
  /** A purchase exists for the request (the settlement or an applied late settlement): Core's E-12 evidence. */
  readonly purchaseExists: boolean;
  readonly timeline: readonly AssistanceTimelineEntry[];
}

const HOUR = 3_600_000;
const SETTLE_WINDOW_HOURS = 72;
/** Core's dispute escalation target: open for more than seven days (`assistance-settlement.view.ts:55`). Closes nothing. */
const ESCALATION_HOURS = 7 * 24;

/** Demo assistance ids: UUID-shaped like Core's, stable, never a seed id of another table. */
export const DEMO_ASSISTANCE_ID_PREFIX = 'a551c0de-0000-4000-8000-';
const id = (n: number): string => `${DEMO_ASSISTANCE_ID_PREFIX}${n.toString(16).padStart(12, '0')}`;

/** Another Company, its Platform and Organization: never visible to the demo owner. */
export const DEMO_FOREIGN_COMPANY_ID: CompanyId = companyId('f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e01');
export const DEMO_FOREIGN_PLATFORM_ID: PlatformId = platformId(
  'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e02',
);
const FOREIGN_ORGANIZATION_ID: OrganizationId = organizationId(
  'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e03',
);

/** The demo premium product and its price (the frozen terms reference the price). */
export const DEMO_ASSISTED_PRODUCT_ID = id(0xf1);
const PRICE_ID = id(0xf2);

/** TND in millimes (minor units): 45.000 TND + a 1.500 TND Organization fee. */
const STANDARD: AssistanceTerms = {
  priceId: PRICE_ID,
  currency: 'TND',
  baseAmount: 45_000,
  feeAmount: 1_500,
  totalAmount: 46_500,
};
/** An Organization that charges no fee: total = base. */
const NO_FEE: AssistanceTerms = {
  priceId: PRICE_ID,
  currency: 'TND',
  baseAmount: 30_000,
  feeAmount: 0,
  totalAmount: 30_000,
};

const seedOrganizationId = (n: number): OrganizationId =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${n.toString().padStart(2, '0')}`);

/** An Organization's administrator and one of its active non-administrator members, from the demo world. */
function peopleOf(
  world: DemoWorldTables,
  n: number,
  member: number,
): {
  readonly organizationId: OrganizationId;
  readonly actor: string;
  readonly beneficiary: string;
} {
  const organization = world.organizations.find((o) => o.id === seedOrganizationId(n));
  if (organization === undefined) throw new Error(`demo Organization ${n} is missing`);
  const active = world.memberships.filter(
    (m) => m.organizationId === organization.id && m.status === 'active',
  );
  const actor = active.find((m) => m.isOrganizationAdmin)?.userId;
  const beneficiary = active.filter((m) => !m.isOrganizationAdmin)[member]?.userId;
  if (actor === undefined || beneficiary === undefined)
    throw new Error(`demo Organization ${n} has no administrator or member ${member}`);
  return { organizationId: organization.id, actor, beneficiary };
}

/** A timeline entry as written in the seed: its id is assigned, and `recordedAt` defaults to `at`. */
type TimelineInput = AssistanceTimelineEntry extends infer E
  ? E extends AssistanceTimelineEntry
    ? Omit<E, 'id' | 'recordedAt'> & { readonly recordedAt?: string }
    : never
  : never;

/** The pieces every case needs, from a few numbers. */
interface CaseBase {
  readonly n: number;
  readonly companyId: CompanyId;
  readonly platformId: PlatformId;
  readonly organizationId: OrganizationId;
  readonly beneficiary: string;
  readonly actor: string;
  readonly terms: AssistanceTerms;
  readonly consentAt: string;
}

export function demoAssistanceCases(
  world: DemoWorldTables,
  now: number,
): readonly DemoAssistanceCase[] {
  const at = (hours: number): string => new Date(now + hours * HOUR).toISOString();
  const settleBy = (collectedHours: number): string => at(collectedHours + SETTLE_WINDOW_HOURS);

  const base = (
    n: number,
    organization: number,
    member: number,
    consentHours: number,
    terms: AssistanceTerms = STANDARD,
  ): CaseBase => {
    const people = peopleOf(world, organization, member);
    return {
      n,
      companyId: world.company.id,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
      organizationId: people.organizationId,
      beneficiary: people.beneficiary,
      actor: people.actor,
      terms,
      consentAt: at(consentHours),
    };
  };

  const request = (
    b: CaseBase,
    state: AssistanceRequestState,
    extra: {
      readonly declined?: AssistanceRequest['declined'];
      readonly collected?: { readonly at: number; readonly reported: number };
    } = {},
  ): AssistanceRequest => ({
    id: id(0x100 + b.n),
    beneficiaryUserId: b.beneficiary,
    organizationId: b.organizationId,
    platformId: b.platformId,
    productId: DEMO_ASSISTED_PRODUCT_ID,
    state,
    terms: b.terms,
    consentAt: b.consentAt,
    declined: extra.declined ?? null,
    collection:
      extra.collected === undefined
        ? null
        : {
            cashCollectedAt: at(extra.collected.at),
            reportedAt: at(extra.collected.reported),
            reportedBy: b.actor,
            settleBy: settleBy(extra.collected.at),
          },
  });

  const channel = (b: CaseBase, state: SettlementChannelState): SettlementChannel => ({
    id: id(0x200 + b.n),
    assistanceRequestId: id(0x100 + b.n),
    state,
  });

  /** A case's history, oldest first; ids numbered in that order. */
  const timeline = (
    b: CaseBase,
    entries: readonly TimelineInput[],
  ): readonly AssistanceTimelineEntry[] =>
    entries.map((e, k) => ({
      ...e,
      id: id(0x1000 + b.n * 0x40 + k),
      recordedAt: e.recordedAt ?? e.at,
    }));

  const consent = (b: CaseBase) =>
    ({ source: 'report', kind: 'consent', by: 'beneficiary', at: b.consentAt }) as const;
  /** The Organization actor's report (asserted time) and Core's recording of it. */
  const collected = (r: AssistanceRequest) => {
    if (r.collection === null) throw new Error(`demo request ${r.id} has no collection`);
    return {
      source: 'report',
      kind: 'cashCollected',
      by: 'organization_actor',
      at: r.collection.cashCollectedAt,
      recordedAt: r.collection.reportedAt,
    } as const;
  };

  const kase = (
    b: CaseBase,
    r: AssistanceRequest,
    parts: Partial<Omit<DemoAssistanceCase, 'companyId' | 'request'>>,
  ): DemoAssistanceCase => ({
    companyId: b.companyId,
    request: r,
    channel: parts.channel ?? null,
    cashReturns: parts.cashReturns ?? [],
    disputes: parts.disputes ?? [],
    corrections: parts.corrections ?? [],
    lateSettlements: parts.lateSettlements ?? [],
    recovery: parts.recovery ?? null,
    purchaseExists: parts.purchaseExists ?? false,
    timeline: parts.timeline ?? [],
  });

  const money = (b: CaseBase, amount: number) => ({ amount, currency: b.terms.currency });

  /** An open dispute as Core represents it; `escalationDue` is what Core derives at `now` (open for more than seven days). */
  const openDispute = (
    b: CaseBase,
    r: AssistanceRequest,
    reason: AssistanceDispute['reason'],
    openedHours: number,
    response: AssistanceDispute['response'] = null,
  ): AssistanceDispute => ({
    id: id(0x400 + b.n),
    assistanceRequestId: r.id,
    reason,
    state: 'open',
    openedAt: at(openedHours),
    escalationDue: -openedHours > ESCALATION_HOURS,
    response,
    resolution: null,
  });

  // ── 1. Pending: consent given, nothing collected yet ───────────────────────────────────────────────────────────────
  const b1 = base(1, 1, 0, -2);
  const r1 = request(b1, 'pending');

  // ── 2–3. Declined, by the beneficiary and by the Organization actor (final) ────────────────────────────────────────
  const b2 = base(2, 1, 1, -30);
  const r2 = request(b2, 'declined', { declined: { at: at(-28), byRole: 'beneficiary' } });
  const b3 = base(3, 2, 0, -50, NO_FEE);
  const r3 = request(b3, 'declined', { declined: { at: at(-49), byRole: 'organization_actor' } });

  // ── 4. Whole amount collected, channel open, inside the 72-hour window; the beneficiary disputes the collection itself
  //       (`collection_not_made`: no resolution exists in Core, J-1) ──────────────────────────────────────────────────
  const b4 = base(4, 2, 1, -20);
  const r4 = request(b4, 'cash_collected', { collected: { at: -18, reported: -17 } });

  // ── 5. Settled through the channel (a purchase exists) ─────────────────────────────────────────────────────────────
  const b5 = base(5, 3, 0, -200);
  const r5 = request(b5, 'settled', { collected: { at: -190, reported: -189 } });

  // ── 6. Settlement uncertain: the channel's payment is in flight with no final answer ──────────────────────────────
  const b6 = base(6, 3, 1, -40);
  const r6 = request(b6, 'cash_collected', { collected: { at: -38, reported: -37 } });

  // ── 7. Cash returned: deadline passed, the Organization reported the return, the beneficiary confirmed ────────────
  const b7 = base(7, 5, 0, -300);
  const r7 = request(b7, 'returned', { collected: { at: -296, reported: -295 } });

  // ── 8. Cash return overdue, with an open `cash_not_returned` dispute (no resolution exists in Core, J-1); a late verified success
  //       with the beneficiary's attestation, held by that dispute (A8) ────────────────────────────────────────────────────
  const b8 = base(8, 5, 1, -150);
  const r8 = request(b8, 'cash_collected', { collected: { at: -148, reported: -147 } });

  // ── 9. Collection-time dispute resolved by an owner correction (`timestamp_corrected`; times only, never money) ──
  const b9 = base(9, 6, 0, -100, NO_FEE);
  const r9 = request(b9, 'settled', { collected: { at: -90, reported: -89 } });

  // ── 10. Return-time dispute open on a reported return (confirmation waits, J-4) ────────────────────────────────────
  const b10 = base(10, 6, 1, -260);
  const r10 = request(b10, 'cash_collected', { collected: { at: -255, reported: -254 } });

  // ── 11. Late settlement recorded, NOT applied, and without attestation or evidence (L-4 would be refused) ─────────
  const b11 = base(11, 7, 0, -120);
  const r11 = request(b11, 'cash_collected', { collected: { at: -118, reported: -117 } });

  // ── 12. Late settlement applied by the owner (L-4): the deadline obligation superseded, the request settled ──────
  const b12 = base(12, 7, 1, -220);
  const r12 = request(b12, 'settled', { collected: { at: -216, reported: -215 } });

  // ── 13. Recovery obligation open after a full final chargeback: base only, partly recovered (T3) ─────────────────
  const b13 = base(13, 9, 0, -400);
  const r13 = request(b13, 'settled', { collected: { at: -396, reported: -395 } });

  // ── 14. Recovery recovered with a surplus owed to the Organization (no external repayment: CF-71) ─────────────────
  const b14 = base(14, 9, 1, -500, NO_FEE);
  const r14 = request(b14, 'settled', { collected: { at: -496, reported: -495 } });

  const cases: DemoAssistanceCase[] = [
    kase(b1, r1, { timeline: timeline(b1, [consent(b1)]) }),
    kase(b2, r2, {
      timeline: timeline(b2, [
        consent(b2),
        { source: 'report', kind: 'declined', by: 'beneficiary', at: at(-28) },
      ]),
    }),
    kase(b3, r3, {
      timeline: timeline(b3, [
        consent(b3),
        { source: 'report', kind: 'declined', by: 'organization_actor', at: at(-49) },
      ]),
    }),
    kase(b4, r4, {
      channel: channel(b4, 'open'),
      disputes: [openDispute(b4, r4, 'collection_not_made', -5)],
      timeline: timeline(b4, [
        consent(b4),
        collected(r4),
        { source: 'report', kind: 'disputeOpened', by: 'beneficiary', at: at(-5) },
      ]),
    }),
    kase(b5, r5, {
      channel: channel(b5, 'settled'),
      purchaseExists: true,
      timeline: timeline(b5, [
        consent(b5),
        collected(r5),
        { source: 'fact', kind: 'settlementSucceeded', by: 'core', at: at(-160) },
      ]),
    }),
    kase(b6, r6, {
      channel: channel(b6, 'uncertain'),
      timeline: timeline(b6, [
        consent(b6),
        collected(r6),
        { source: 'derived', kind: 'channelUncertain', by: 'core', at: at(-6) },
      ]),
    }),
    kase(b7, r7, {
      channel: channel(b7, 'closed'),
      cashReturns: [
        {
          id: id(0x300 + 7),
          assistanceRequestId: r7.id,
          origin: 'deadline',
          state: 'confirmed_returned',
          amount: money(b7, b7.terms.totalAmount),
          cashCollectedAt: at(-296),
          openedAt: at(-224),
          returnReport: {
            returnedAt: at(-220),
            returnReportedAt: at(-219),
            returnReportedBy: b7.actor,
          },
          confirmedAt: at(-200),
          supersededAt: null,
        },
      ],
      timeline: timeline(b7, [
        consent(b7),
        collected(r7),
        { source: 'fact', kind: 'settlementFailed', by: 'core', at: at(-230) },
        { source: 'derived', kind: 'channelClosed', by: 'core', at: at(-230) },
        { source: 'derived', kind: 'cashReturnOwed', by: 'core', at: at(-224) },
        {
          source: 'report',
          kind: 'cashReturnReported',
          by: 'organization_actor',
          at: at(-220),
          recordedAt: at(-219),
        },
        { source: 'report', kind: 'cashReturnConfirmed', by: 'beneficiary', at: at(-200) },
      ]),
    }),
    kase(b8, r8, {
      channel: channel(b8, 'closed'),
      cashReturns: [
        {
          id: id(0x300 + 8),
          assistanceRequestId: r8.id,
          origin: 'deadline',
          state: 'open',
          amount: money(b8, b8.terms.totalAmount),
          cashCollectedAt: at(-148),
          openedAt: at(-76),
          returnReport: null,
          confirmedAt: null,
          supersededAt: null,
        },
      ],
      disputes: [openDispute(b8, r8, 'cash_not_returned', -30)],
      // A verified success arrived after the channel closed (L-1), and the beneficiary attests the cash was not returned (Path A):
      // the owner's L-4 would be refused while the dispute is open (`dispute_open`). Never applied automatically (A8).
      lateSettlements: [
        {
          id: id(0x600 + 8),
          assistanceRequestId: r8.id,
          reason: 'channel_closed',
          attestation: 'cash_not_returned',
          applied: false,
          platformId: b8.platformId,
          organizationId: b8.organizationId,
          recordedAt: at(-19),
          settledAt: at(-20),
          attestedAt: at(-15),
          application: null,
          evidence: [],
          refundCases: [],
        },
      ],
      timeline: timeline(b8, [
        consent(b8),
        collected(r8),
        { source: 'fact', kind: 'settlementFailed', by: 'core', at: at(-100) },
        { source: 'derived', kind: 'channelClosed', by: 'core', at: at(-100) },
        { source: 'derived', kind: 'cashReturnOwed', by: 'core', at: at(-76) },
        { source: 'report', kind: 'disputeOpened', by: 'beneficiary', at: at(-30) },
        { source: 'fact', kind: 'lateSuccess', by: 'core', at: at(-20), recordedAt: at(-19) },
        { source: 'report', kind: 'lateAttestation', by: 'beneficiary', at: at(-15) },
      ]),
    }),
    kase(b9, r9, {
      channel: channel(b9, 'settled'),
      purchaseExists: true,
      corrections: [
        {
          id: id(0x500 + 9),
          assistanceRequestId: r9.id,
          sequence: 1,
          field: 'cashCollectedAt',
          correctedValue: at(-92),
          supersededValue: at(-90),
          reason: 'evidence_contradicts_report',
          correctedAt: at(-40),
        },
      ],
      disputes: [
        {
          id: id(0x400 + 9),
          assistanceRequestId: r9.id,
          reason: 'collection_time_incorrect',
          state: 'resolved',
          openedAt: at(-60),
          escalationDue: false,
          response: { position: 'contests', respondedAt: at(-58) },
          resolution: {
            outcome: 'timestamp_corrected',
            correctionId: id(0x500 + 9),
            resolvedAt: at(-40),
          },
        },
      ],
      timeline: timeline(b9, [
        consent(b9),
        collected(r9),
        { source: 'fact', kind: 'settlementSucceeded', by: 'core', at: at(-70) },
        { source: 'report', kind: 'disputeOpened', by: 'beneficiary', at: at(-60) },
        { source: 'report', kind: 'disputeResponse', by: 'organization_actor', at: at(-58) },
        { source: 'decision', kind: 'correction', by: 'owner', at: at(-40) },
        { source: 'decision', kind: 'disputeResolved', by: 'owner', at: at(-40) },
      ]),
    }),
    kase(b10, r10, {
      channel: channel(b10, 'closed'),
      cashReturns: [
        {
          id: id(0x300 + 10),
          assistanceRequestId: r10.id,
          origin: 'deadline',
          state: 'return_reported',
          amount: money(b10, b10.terms.totalAmount),
          cashCollectedAt: at(-255),
          openedAt: at(-183),
          returnReport: {
            returnedAt: at(-170),
            returnReportedAt: at(-168),
            returnReportedBy: b10.actor,
          },
          confirmedAt: null,
          supersededAt: null,
        },
      ],
      disputes: [openDispute(b10, r10, 'return_time_incorrect', -150)],
      timeline: timeline(b10, [
        consent(b10),
        collected(r10),
        { source: 'fact', kind: 'settlementFailed', by: 'core', at: at(-200) },
        { source: 'derived', kind: 'channelClosed', by: 'core', at: at(-200) },
        { source: 'derived', kind: 'cashReturnOwed', by: 'core', at: at(-183) },
        {
          source: 'report',
          kind: 'cashReturnReported',
          by: 'organization_actor',
          at: at(-170),
          recordedAt: at(-168),
        },
        { source: 'report', kind: 'disputeOpened', by: 'beneficiary', at: at(-150) },
      ]),
    }),
    kase(b11, r11, {
      channel: channel(b11, 'closed'),
      cashReturns: [
        {
          id: id(0x300 + 11),
          assistanceRequestId: r11.id,
          origin: 'deadline',
          state: 'open',
          amount: money(b11, b11.terms.totalAmount),
          cashCollectedAt: at(-118),
          openedAt: at(-46),
          returnReport: null,
          confirmedAt: null,
          supersededAt: null,
        },
      ],
      lateSettlements: [
        {
          id: id(0x600 + 11),
          assistanceRequestId: r11.id,
          reason: 'channel_closed',
          attestation: null,
          applied: false,
          platformId: b11.platformId,
          organizationId: b11.organizationId,
          recordedAt: at(-10),
          settledAt: at(-12),
          attestedAt: null,
          application: null,
          evidence: [],
          refundCases: [],
        },
      ],
      timeline: timeline(b11, [
        consent(b11),
        collected(r11),
        { source: 'fact', kind: 'settlementFailed', by: 'core', at: at(-60) },
        { source: 'derived', kind: 'channelClosed', by: 'core', at: at(-60) },
        { source: 'derived', kind: 'cashReturnOwed', by: 'core', at: at(-46) },
        { source: 'fact', kind: 'lateSuccess', by: 'core', at: at(-12), recordedAt: at(-10) },
      ]),
    }),
    kase(b12, r12, {
      channel: channel(b12, 'closed'),
      purchaseExists: true,
      cashReturns: [
        {
          id: id(0x300 + 12),
          assistanceRequestId: r12.id,
          origin: 'deadline',
          state: 'superseded_by_settlement',
          amount: money(b12, b12.terms.totalAmount),
          cashCollectedAt: at(-216),
          openedAt: at(-144),
          returnReport: null,
          confirmedAt: null,
          supersededAt: at(-30),
        },
      ],
      lateSettlements: [
        {
          id: id(0x600 + 12),
          assistanceRequestId: r12.id,
          reason: 'channel_closed',
          attestation: 'cash_not_returned',
          applied: true,
          platformId: b12.platformId,
          organizationId: b12.organizationId,
          recordedAt: at(-98),
          settledAt: at(-100),
          attestedAt: at(-95),
          application: {
            reasonCode: 'cash_not_returned_attested',
            appliedAt: at(-30),
            appliedBy: DEMO_OWNER_USER_ID,
            receiptId: id(0xb00 + 12),
            purchaseId: id(0xc00 + 12),
            supersededObligationId: id(0x300 + 12),
          },
          evidence: [],
          refundCases: [],
        },
      ],
      timeline: timeline(b12, [
        consent(b12),
        collected(r12),
        { source: 'fact', kind: 'settlementFailed', by: 'core', at: at(-150) },
        { source: 'derived', kind: 'channelClosed', by: 'core', at: at(-150) },
        { source: 'derived', kind: 'cashReturnOwed', by: 'core', at: at(-144) },
        { source: 'fact', kind: 'lateSuccess', by: 'core', at: at(-100), recordedAt: at(-98) },
        { source: 'report', kind: 'lateAttestation', by: 'beneficiary', at: at(-95) },
        { source: 'decision', kind: 'lateSettlementApplied', by: 'owner', at: at(-30) },
      ]),
    }),
    kase(b13, r13, {
      channel: channel(b13, 'settled'),
      purchaseExists: true,
      recovery: {
        id: id(0x700 + 13),
        assistanceRequestId: r13.id,
        organizationId: b13.organizationId,
        base: money(b13, b13.terms.baseAmount),
        state: 'open',
        platformId: b13.platformId,
        disputeId: id(0xa00 + 13),
        recovered: money(b13, 15_000),
        outstanding: money(b13, 30_000),
        openedAt: at(-100),
        recoveredAt: null,
        payments: [
          {
            id: id(0x880 + 13),
            amount: 15_000,
            principalAmount: 15_000,
            surplusAmount: 0,
            recordedAt: at(-50),
          },
        ],
        surpluses: [],
      },
      timeline: timeline(b13, [
        consent(b13),
        collected(r13),
        { source: 'fact', kind: 'settlementSucceeded', by: 'core', at: at(-380) },
        { source: 'fact', kind: 'chargebackFinal', by: 'core', at: at(-100) },
        { source: 'derived', kind: 'recoveryOpened', by: 'core', at: at(-100) },
        { source: 'fact', kind: 'recoveryPayment', by: 'core', at: at(-50) },
      ]),
    }),
    kase(b14, r14, {
      channel: channel(b14, 'settled'),
      purchaseExists: true,
      recovery: {
        id: id(0x700 + 14),
        assistanceRequestId: r14.id,
        organizationId: b14.organizationId,
        base: money(b14, b14.terms.baseAmount),
        state: 'recovered',
        platformId: b14.platformId,
        disputeId: id(0xa00 + 14),
        recovered: money(b14, 30_000),
        outstanding: money(b14, 0),
        openedAt: at(-300),
        recoveredAt: at(-120),
        payments: [
          {
            id: id(0x880 + 14),
            amount: 20_000,
            principalAmount: 20_000,
            surplusAmount: 0,
            recordedAt: at(-200),
          },
          {
            id: id(0x8a0 + 14),
            amount: 12_000,
            principalAmount: 10_000,
            surplusAmount: 2_000,
            recordedAt: at(-120),
          },
        ],
        surpluses: [
          {
            id: id(0x800 + 14),
            obligationId: id(0x700 + 14),
            organizationId: b14.organizationId,
            amount: money(b14, 2_000),
            refunded: false,
            external: null,
            status: 'owed_to_organization',
          },
        ],
      },
      timeline: timeline(b14, [
        consent(b14),
        collected(r14),
        { source: 'fact', kind: 'settlementSucceeded', by: 'core', at: at(-480) },
        { source: 'fact', kind: 'chargebackFinal', by: 'core', at: at(-300) },
        { source: 'derived', kind: 'recoveryOpened', by: 'core', at: at(-300) },
        { source: 'fact', kind: 'recoveryPayment', by: 'core', at: at(-200) },
        { source: 'fact', kind: 'recoveryPayment', by: 'core', at: at(-120) },
      ]),
    }),
  ];

  return [...cases, ...foreignCases(at)];
}

/**
 * Another Company's cases, shaped exactly like the demo Company's (an unapplied late settlement with an open dispute; an open
 * recovery), so that a read
 * leaking across Companies would show. Their ids are as valid as any other: only scope keeps them out.
 */
function foreignCases(at: (hours: number) => string): readonly DemoAssistanceCase[] {
  const actor = 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e10';
  const beneficiary = 'f0e1d2c3-b4a5-4697-8879-6a5b4c3d2e11';
  const currency = STANDARD.currency;
  const request = (n: number, state: AssistanceRequestState, collectedHours: number) => ({
    id: id(0xf00 + n),
    beneficiaryUserId: beneficiary,
    organizationId: FOREIGN_ORGANIZATION_ID,
    platformId: DEMO_FOREIGN_PLATFORM_ID,
    productId: DEMO_ASSISTED_PRODUCT_ID,
    state,
    terms: STANDARD,
    consentAt: at(collectedHours - 2),
    declined: null,
    collection: {
      cashCollectedAt: at(collectedHours),
      reportedAt: at(collectedHours + 1),
      reportedBy: actor,
      settleBy: at(collectedHours + SETTLE_WINDOW_HOURS),
    },
  });
  const late = request(1, 'cash_collected', -88);
  const recovered = request(2, 'settled', -300);
  return [
    {
      companyId: DEMO_FOREIGN_COMPANY_ID,
      request: late,
      channel: { id: id(0xf11), assistanceRequestId: late.id, state: 'closed' },
      cashReturns: [
        {
          id: id(0xf12),
          assistanceRequestId: late.id,
          origin: 'deadline',
          state: 'open',
          amount: { amount: STANDARD.totalAmount, currency },
          cashCollectedAt: at(-88),
          openedAt: at(-16),
          returnReport: null,
          confirmedAt: null,
          supersededAt: null,
        },
      ],
      // An open dispute too, so a dispute read leaking across Companies would show (A7).
      disputes: [
        {
          id: id(0xf14),
          assistanceRequestId: late.id,
          reason: 'cash_not_returned',
          state: 'open',
          openedAt: at(-4),
          escalationDue: false,
          response: null,
          resolution: null,
        },
      ],
      corrections: [],
      lateSettlements: [
        {
          id: id(0xf13),
          assistanceRequestId: late.id,
          reason: 'channel_closed',
          attestation: 'cash_not_returned',
          applied: false,
          platformId: DEMO_FOREIGN_PLATFORM_ID,
          organizationId: FOREIGN_ORGANIZATION_ID,
          recordedAt: at(-6),
          settledAt: at(-7),
          attestedAt: at(-5),
          application: null,
          evidence: [],
          refundCases: [],
        },
      ],
      recovery: null,
      purchaseExists: false,
      timeline: [],
    },
    {
      companyId: DEMO_FOREIGN_COMPANY_ID,
      request: recovered,
      channel: { id: id(0xf21), assistanceRequestId: recovered.id, state: 'settled' },
      cashReturns: [],
      disputes: [],
      corrections: [],
      lateSettlements: [],
      recovery: {
        id: id(0xf23),
        assistanceRequestId: recovered.id,
        organizationId: FOREIGN_ORGANIZATION_ID,
        base: { amount: STANDARD.baseAmount, currency },
        state: 'open',
        platformId: DEMO_FOREIGN_PLATFORM_ID,
        disputeId: id(0xf24),
        recovered: { amount: 0, currency },
        outstanding: { amount: STANDARD.baseAmount, currency },
        openedAt: at(-10),
        recoveredAt: null,
        payments: [],
        surpluses: [],
      },
      purchaseExists: true,
      timeline: [],
    },
  ];
}
