import {
  ASSISTANCE_DISPUTE_REASONS,
  ASSISTANCE_REQUEST_STATES,
  CASH_RETURN_STATES,
  LATE_SETTLEMENT_REASONS,
  SETTLEMENT_CHANNEL_STATES,
} from '../../../features/assistance/domain/assistance.model';
import {
  INFORMATION_SOURCE,
  canCorrect,
  canOpenDispute,
  cashReturnTransition,
  channelTransition,
  requestTransition,
  surplusResolution,
  validCollectionReport,
  validDisputeResolution,
  validRecoveryBase,
  validReturnReport,
  validTerms,
} from '../../../features/assistance/domain/assistance.rules';
import {
  DEMO_COMPANY_ID,
  DEMO_OWNER_USER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../seed';
import { assistedPaymentsOf, isCompanyPlatform } from '../selectors';
import {
  DEMO_ASSISTANCE_ID_PREFIX,
  DEMO_FOREIGN_COMPANY_ID,
  DemoAssistanceCase,
  demoAssistanceCases,
} from './assistance.seed';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const WORLD = demoWorldSeed(NOW);
const ALL = demoAssistanceCases(WORLD, NOW);
const OWN = ALL.filter((c) => c.companyId === DEMO_COMPANY_ID);
const FOREIGN = ALL.filter((c) => c.companyId !== DEMO_COMPANY_ID);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const allowed = { allowed: true };

/** Every id a case carries, for uniqueness and shape. */
const idsOf = (c: DemoAssistanceCase): string[] => [
  c.request.id,
  ...(c.channel ? [c.channel.id] : []),
  ...c.cashReturns.map((o) => o.id),
  ...c.disputes.map((d) => d.id),
  ...c.corrections.map((x) => x.id),
  ...c.lateSettlements.map((l) => l.id),
  ...(c.recovery ? [c.recovery.id, ...c.recovery.payments.map((p) => p.id)] : []),
  ...(c.recovery?.surpluses.map((s) => s.id) ?? []),
  ...c.timeline.map((e) => e.id),
];

describe('Demo assistance cases (A3): deterministic and complete', () => {
  it('are a pure function of the world and the clock', () => {
    expect(demoAssistanceCases(demoWorldSeed(NOW), NOW)).toEqual(ALL);
    const later = demoAssistanceCases(demoWorldSeed(NOW + 3_600_000), NOW + 3_600_000);
    expect(later.map((c) => c.request.id)).toEqual(ALL.map((c) => c.request.id));
    expect(Date.parse(later[0]!.request.consentAt) - Date.parse(ALL[0]!.request.consentAt)).toBe(
      3_600_000,
    );
  });

  it('use unique, UUID-shaped demo ids', () => {
    const ids = ALL.flatMap(idsOf);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(UUID);
    for (const c of OWN) expect(c.request.id.startsWith(DEMO_ASSISTANCE_ID_PREFIX)).toBe(true);
  });

  it('cover every request, channel, cash-return state and dispute reason', () => {
    expect(new Set(OWN.map((c) => c.request.state))).toEqual(new Set(ASSISTANCE_REQUEST_STATES));
    expect(new Set(OWN.flatMap((c) => (c.channel ? [c.channel.state] : [])))).toEqual(
      new Set(SETTLEMENT_CHANNEL_STATES),
    );
    expect(new Set(OWN.flatMap((c) => c.cashReturns.map((o) => o.state)))).toEqual(
      new Set(CASH_RETURN_STATES),
    );
    expect(new Set(OWN.flatMap((c) => c.disputes.map((d) => d.reason)))).toEqual(
      new Set(ASSISTANCE_DISPUTE_REASONS),
    );
    expect(OWN.some((c) => c.corrections.length > 0)).toBe(true);
    expect(OWN.flatMap((c) => c.lateSettlements.map((l) => l.applied)).sort()).toEqual([
      false,
      true,
    ]);
    expect(OWN.flatMap((c) => (c.recovery ? [c.recovery.state] : [])).sort()).toEqual([
      'open',
      'recovered',
    ]);
    expect(OWN.some((c) => c.recovery?.surpluses.length)).toBe(true);
  });
});

describe('Demo assistance cases (A3): actors and scope', () => {
  it("belong to the demo Company's School Organizations with assisted payments enabled", () => {
    for (const c of OWN) {
      expect(c.request.platformId).toBe(DEMO_SCHOOL_PLATFORM_ID);
      const organization = WORLD.organizations.find((o) => o.id === c.request.organizationId)!;
      expect(organization.platformId).toBe(c.request.platformId);
      expect(assistedPaymentsOf(WORLD, organization)?.effective).toBe('enabled');
    }
  });

  it('the beneficiary is an active member; the reporter an administrator, never the beneficiary', () => {
    const active = (org: string, user: string) =>
      WORLD.memberships.find(
        (m) => m.organizationId === org && m.userId === user && m.status === 'active',
      );
    for (const c of OWN) {
      const r = c.request;
      expect(active(r.organizationId, r.beneficiaryUserId)?.isOrganizationAdmin).toBe(false);
      const reporters = [
        r.collection?.reportedBy,
        ...c.cashReturns.map((o) => o.returnReport?.returnReportedBy),
      ].filter((x): x is string => x !== undefined);
      for (const reporter of reporters) {
        expect(reporter).not.toBe(r.beneficiaryUserId);
        expect(active(r.organizationId, reporter)?.isOrganizationAdmin).toBe(true);
      }
    }
  });

  it("another Company's cases are outside the demo Company and its Platforms", () => {
    expect(FOREIGN.length).toBeGreaterThan(0);
    for (const c of FOREIGN) {
      expect(c.companyId).toBe(DEMO_FOREIGN_COMPANY_ID);
      expect(isCompanyPlatform(WORLD, c.request.platformId)).toBe(false);
    }
  });
});

describe('Demo assistance cases (A3): every record satisfies the A1 invariants', () => {
  for (const c of ALL)
    describe(`case ${c.request.id.slice(-4)} (${c.request.state})`, () => {
      const r = c.request;
      const obligation = c.cashReturns[0];
      const appliedLate = c.lateSettlements.find((l) => l.applied);

      it('has frozen, well-formed terms and a whole-amount collection report', () => {
        expect(validTerms(r.terms)).toEqual(allowed);
        if (r.collection === null) return;
        expect(validCollectionReport(r.collection, r.consentAt, r.beneficiaryUserId)).toEqual(
          allowed,
        );
        // No amount in the report: the obligation is always the frozen total.
        expect(Object.keys(r.collection).sort()).toEqual(
          ['cashCollectedAt', 'reportedAt', 'reportedBy', 'settleBy'].sort(),
        );
      });

      it('is in a state Core reaches, with its evidence', () => {
        switch (r.state) {
          case 'pending':
            expect([r.collection, r.declined, c.channel]).toEqual([null, null, null]);
            break;
          case 'declined':
            expect(requestTransition('pending', 'declined', NO_EVIDENCE)).toEqual(allowed);
            expect(r.declined).not.toBeNull();
            expect(r.collection).toBeNull();
            break;
          case 'cash_collected':
            expect(r.collection).not.toBeNull();
            expect(c.purchaseExists).toBe(false);
            // Refused transitions: no purchase, no confirmed return.
            expect(requestTransition('cash_collected', 'settled', NO_EVIDENCE)).toEqual({
              allowed: false,
              reason: 'assistance_request_settled_by_purchase',
            });
            expect(requestTransition('cash_collected', 'returned', NO_EVIDENCE).allowed).toBe(
              false,
            );
            break;
          case 'settled':
            expect(c.purchaseExists).toBe(true);
            expect(
              requestTransition('cash_collected', 'settled', {
                ...NO_EVIDENCE,
                purchaseExists: true,
              }),
            ).toEqual(allowed);
            expect(c.channel?.state === 'settled' || appliedLate !== undefined).toBe(true);
            break;
          case 'returned':
            expect(obligation?.state).toBe('confirmed_returned');
            expect(
              requestTransition('cash_collected', 'returned', {
                ...NO_EVIDENCE,
                cashReturnConfirmed: true,
              }),
            ).toEqual(allowed);
            break;
        }
        if (r.state !== 'pending' && r.state !== 'declined') expect(c.channel).not.toBeNull();
      });

      it('has a settlement channel reached through allowed transitions', () => {
        const channel = c.channel;
        if (channel === null || channel.state === 'open') return;
        const evidence = {
          paymentFinalUnsuccessful: channel.state === 'closed',
          purchaseExists: channel.state === 'settled',
        };
        expect(channelTransition('open', channel.state, evidence)).toEqual(allowed);
        if (channel.state === 'settled') expect(c.purchaseExists).toBe(true);
        // A final channel never moves again.
        if (channel.state === 'closed' || channel.state === 'settled')
          for (const to of SETTLEMENT_CHANNEL_STATES)
            expect(channelTransition(channel.state, to, evidence).allowed).toBe(false);
      });

      it('owes the frozen total in cash, only after the deadline, reported by the Organization', () => {
        for (const o of c.cashReturns) {
          expect(o.amount).toEqual({ amount: r.terms.totalAmount, currency: r.terms.currency });
          expect(o.cashCollectedAt).toBe(r.collection?.cashCollectedAt);
          expect(o.origin).toBe('deadline');
          expect(NOW).toBeGreaterThan(Date.parse(r.collection!.settleBy));
          expect(validReturnReport(o, r.beneficiaryUserId)).toEqual(allowed);
          expect(o.returnReport !== null).toBe(
            o.state === 'return_reported' || o.state === 'confirmed_returned',
          );
          expect(o.confirmedAt !== null).toBe(o.state === 'confirmed_returned');
          if (o.state === 'superseded_by_settlement') {
            expect(appliedLate?.application?.supersededObligationId).toBe(o.id);
            expect(
              cashReturnTransition({ state: 'open', origin: o.origin }, o.state, {
                actor: 'lateSettlementApplication',
                disputeOpen: false,
              }),
            ).toEqual(allowed);
          }
        }
      });

      it('has disputes Core admits, resolved only by a correction of the disputed time', () => {
        expect(c.disputes.filter((d) => d.state === 'open').length).toBeLessThanOrEqual(1);
        const returnReported = obligation?.returnReport != null;
        for (const d of c.disputes) {
          const facts = {
            obligationExists: obligation !== undefined,
            returnReported,
            openDispute: false,
          };
          expect(canOpenDispute(r, d.reason, facts)).toEqual(allowed);
          if (d.state === 'resolved') {
            expect(d.resolution?.outcome).toBe('timestamp_corrected');
            const correction =
              c.corrections.find((x) => x.id === d.resolution?.correctionId) ?? null;
            expect(validDisputeResolution({ ...d, state: 'open' }, correction)).toEqual(allowed);
          } else {
            expect(d.resolution).toBeNull();
          }
          if (d.reason === 'cash_not_returned' || d.reason === 'collection_not_made')
            expect(validDisputeResolution({ ...d, state: 'open' }, null)).toEqual({
              allowed: false,
              reason: 'local:dispute_reason_not_resolvable',
            });
        }
        // An open dispute holds the beneficiary's confirmation of a reported return (J-4).
        if (obligation?.state === 'return_reported' && c.disputes.some((d) => d.state === 'open'))
          expect(
            cashReturnTransition(obligation, 'confirmed_returned', {
              actor: 'beneficiary',
              disputeOpen: true,
            }).allowed,
          ).toBe(false);
      });

      it('has owner corrections of asserted times only, never of money', () => {
        c.corrections.forEach((x, i) => {
          expect(x.sequence).toBe(i + 1);
          expect(Object.keys(x)).not.toContain('amount');
          const original =
            x.field === 'cashCollectedAt'
              ? r.collection?.cashCollectedAt
              : obligation?.returnReport?.returnedAt;
          expect(x.supersededValue).toBe(original);
          expect(
            canCorrect(
              r,
              x.field,
              { returnReported: obligation?.returnReport != null },
              x.correctedValue,
              x.supersededValue,
            ),
          ).toEqual(allowed);
        });
      });

      it('dates disputes, answers, resolutions and corrections as Core does (A7)', () => {
        const at = (iso: string | undefined) => Date.parse(iso ?? '');
        for (const d of c.disputes) {
          // Opened after the cash evidence it disputes was recorded; no filing cutoff.
          expect(at(d.openedAt)).toBeGreaterThanOrEqual(at(r.collection?.reportedAt));
          if (d.reason === 'return_time_incorrect')
            expect(at(d.openedAt)).toBeGreaterThanOrEqual(
              at(obligation?.returnReport?.returnReportedAt),
            );
          // Core derives escalation: open for more than seven days. It closes nothing.
          expect(d.escalationDue).toBe(
            d.state === 'open' && NOW - at(d.openedAt) > 7 * 24 * 3_600_000,
          );
          if (d.response !== null)
            expect(at(d.response.respondedAt)).toBeGreaterThanOrEqual(at(d.openedAt));
          if (d.resolution !== null) {
            const correction = c.corrections.find((x) => x.id === d.resolution?.correctionId);
            expect(at(correction?.correctedAt)).toBeGreaterThanOrEqual(at(d.openedAt));
            expect(at(d.resolution.resolvedAt)).toBeGreaterThanOrEqual(at(correction?.correctedAt));
          }
          if (c.timeline.length > 0) {
            expect(c.timeline).toContainEqual(
              expect.objectContaining({ kind: 'disputeOpened', at: d.openedAt }),
            );
            if (d.response !== null)
              expect(c.timeline).toContainEqual(
                expect.objectContaining({ kind: 'disputeResponse', at: d.response.respondedAt }),
              );
          }
        }
        for (const x of c.corrections) expect(at(x.correctedAt)).toBeLessThanOrEqual(NOW);
      });

      it('has late settlements that are never applied automatically', () => {
        for (const l of c.lateSettlements) {
          expect(LATE_SETTLEMENT_REASONS).toContain(l.reason);
          expect(l.applied).toBe(l.application !== null);
          if (l.application !== null) {
            // L-4: by the owner, with the beneficiary's attestation or evidence; the request settled by its purchase.
            expect(l.application.appliedBy).toBe(DEMO_OWNER_USER_ID);
            expect(l.attestation === 'cash_not_returned' || l.evidence.length > 0).toBe(true);
            expect(r.state).toBe('settled');
            expect(l.application.purchaseId).not.toBeNull();
          }
        }
      });

      it('recovers the base only, with Core-consistent recovered and outstanding amounts', () => {
        const o = c.recovery;
        if (o === null) return;
        expect(r.state).toBe('settled');
        expect(validRecoveryBase(o.base, r.terms)).toEqual(allowed);
        const principal = o.payments.reduce((sum, p) => sum + p.principalAmount, 0);
        expect(o.recovered.amount).toBe(principal);
        expect(o.outstanding.amount).toBe(Math.max(0, o.base.amount - principal));
        expect(o.state === 'recovered').toBe(o.outstanding.amount === 0);
        expect(o.recoveredAt !== null).toBe(o.state === 'recovered');
        for (const p of o.payments) expect(p.amount).toBe(p.principalAmount + p.surplusAmount);
        const surplus = o.payments.reduce((sum, p) => sum + p.surplusAmount, 0);
        expect(o.surpluses.reduce((sum, s) => sum + s.amount.amount, 0)).toBe(surplus);
        for (const s of o.surpluses) {
          expect(s.organizationId).toBe(r.organizationId);
          expect(surplusResolution(s)).toBe('owed');
          expect(s.status).toBe('owed_to_organization');
        }
      });

      it('tells a stable history in order, with reports never presented as facts', () => {
        const times = c.timeline.map((e) => Date.parse(e.at));
        expect(times).toEqual([...times].sort((a, b) => a - b));
        for (const e of c.timeline) {
          const expected = (INFORMATION_SOURCE as Readonly<Record<string, string>>)[e.kind];
          if (expected !== undefined) expect(e.source).toBe(expected);
          if (e.source === 'report') expect(['beneficiary', 'organization_actor']).toContain(e.by);
          expect(Date.parse(e.recordedAt)).toBeGreaterThanOrEqual(Date.parse(e.at));
        }
        if (c.timeline.length > 0)
          expect(c.timeline[0]).toMatchObject({ kind: 'consent', at: r.consentAt });
        const collected = c.timeline.find((e) => e.kind === 'cashCollected');
        if (collected)
          expect([collected.at, collected.recordedAt]).toEqual([
            r.collection?.cashCollectedAt,
            r.collection?.reportedAt,
          ]);
      });
    });
});

const NO_EVIDENCE = { purchaseExists: false, cashReturnConfirmed: false };
