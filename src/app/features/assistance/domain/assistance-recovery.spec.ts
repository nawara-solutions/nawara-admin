import {
  RECEIPT_OPERATION_PURPOSE,
  purposeRule,
} from '../../../core/authorization/purpose-registry';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, demoWorldSeed } from '../../../demo/world/seed';
import {
  RECOVERY_AUTHORITY,
  SURPLUS_STAGE_SOURCE,
  recoveryHistory,
  recoveryStanding,
  surplusResolved,
  surplusStage,
} from './assistance-recovery';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const OWN = demoAssistanceCases(demoWorldSeed(NOW), NOW).filter(
  (c) => c.companyId === DEMO_COMPANY_ID,
);
const recoveryOf = (n: number) => OWN[n - 1]!.recovery!;

const none = { refundCaseId: null, externalRecordedAt: null, confirmedAt: null };

describe('Recovery and surplus (A9): surplus stages on Core’s two paths', () => {
  it('reads each stage from Core’s records, never from the owner’s record alone', () => {
    expect(surplusStage(none)).toBe('owed');
    expect(surplusStage({ ...none, externalRecordedAt: '2026-10-29T10:00:00.000Z' })).toBe(
      'externalRecorded',
    );
    expect(
      surplusStage({
        ...none,
        externalRecordedAt: '2026-10-29T10:00:00.000Z',
        confirmedAt: '2026-10-29T12:00:00.000Z',
      }),
    ).toBe('confirmed');
    expect(surplusStage({ ...none, refundCaseId: 'rc-1' })).toBe('refunded');
    // Resolved only by the Organization's confirmation (Path B) or a completed refund (Path A).
    expect(
      ['owed', 'externalRecorded', 'confirmed', 'refunded'].map((s) => [
        s,
        surplusResolved(s as never),
      ]),
    ).toEqual([
      ['owed', false],
      ['externalRecorded', false],
      ['confirmed', true],
      ['refunded', true],
    ]);
    // An owner's record is a decision, the Organization's confirmation a report: never a provider fact.
    expect(SURPLUS_STAGE_SOURCE).toEqual({
      owed: 'fact',
      externalRecorded: 'decision',
      confirmed: 'report',
      refunded: 'fact',
    });
  });

  it('the demo surpluses: one owed, one recorded outside Nawara Core and awaiting the Organization', () => {
    expect(recoveryOf(14).surpluses.map(surplusStage)).toEqual(['owed', 'externalRecorded']);
  });
});

describe('Recovery and surplus (A9): obligation standing', () => {
  it('an open obligation with a payment in progress is NOT recovered: an attempt is never a recovery', () => {
    expect(recoveryStanding(recoveryOf(13))).toEqual({
      state: 'open',
      paymentInProgress: true,
      surplusesUnresolved: 0,
      restrictsOrganization: true,
    });
    // Core's own values stay as stated: the in-progress channel changes neither recovered nor outstanding.
    expect([recoveryOf(13).recovered.amount, recoveryOf(13).outstanding.amount]).toEqual([
      15_000, 30_000,
    ]);
  });

  it('a fully recovered obligation ends T3, and its surpluses stay owed to the Organization', () => {
    expect(recoveryStanding(recoveryOf(14))).toEqual({
      state: 'recovered',
      paymentInProgress: false,
      surplusesUnresolved: 2,
      restrictsOrganization: false,
    });
    expect(recoveryOf(14).outstanding.amount).toBe(0);
  });

  it('tells the history oldest first, facts, the Organization’s actions and the owner’s decisions kept apart', () => {
    const history = recoveryHistory(recoveryOf(14));
    expect(history.map((e) => [e.kind, e.source])).toEqual([
      ['opened', 'derived'],
      ['channel', 'report'],
      ['channel', 'report'],
      ['payment', 'fact'],
      ['payment', 'fact'],
      ['surplus', 'fact'],
      ['recovered', 'derived'],
      ['payment', 'fact'],
      ['surplus', 'fact'],
      ['surplusExternal', 'decision'],
    ]);
    const times = history.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    // An open obligation has no recovered step.
    expect(recoveryHistory(recoveryOf(13)).map((e) => e.kind)).not.toContain('recovered');
  });

  it('every owner action on recovery is a T3 receipt operation, none offered in Admin', () => {
    for (const { operation } of Object.values(RECOVERY_AUTHORITY))
      expect(purposeRule(RECEIPT_OPERATION_PURPOSE[operation]).transport).toBe('receipt');
  });
});
