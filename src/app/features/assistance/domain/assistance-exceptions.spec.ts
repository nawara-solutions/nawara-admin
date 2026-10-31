import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID, demoWorldSeed } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { MockAssistanceGateway, demoRestrictionsOf } from '../data-access/assistance.mock';
import {
  ASSISTANCE_EXCEPTIONS,
  AssistanceException,
  EXCEPTION_FILTER,
  EXCEPTION_RESTRICTION,
  EXCEPTION_SOURCE,
  assistanceExceptions,
  isAssistanceException,
} from './assistance-exceptions';
import { AssistanceReadContext } from './assistance-read-context';
import { AssistanceCaseSummary } from './assistance-read.model';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ALL = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = ALL.filter((c) => c.companyId === DEMO_COMPANY_ID);
const COMPANY: AssistanceReadContext = { companyId: DEMO_COMPANY_ID, platformId: null };

function gateway(): MockAssistanceGateway {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: DEMO_OWNER_ID, email: null, phone: null, adminTier: 'owner' },
    businessIdentityId: DEMO_OWNER_ID,
  });
  return TestBed.runInInjectionContext(() => new MockAssistanceGateway());
}

async function rows(g: MockAssistanceGateway): Promise<readonly AssistanceCaseSummary[]> {
  return (await firstValueFrom(g.cases(COMPANY, {}, { after: null, limit: 200 }))).items;
}

describe('Assistance exceptions (A7)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('categorizes every demo case from Core’s values only', async () => {
    const byCase = new Map(
      (await rows(gateway())).map((r) => [r.requestId, assistanceExceptions(r)]),
    );
    const expected: Readonly<Record<number, readonly AssistanceException[]>> = {
      1: [],
      2: [],
      3: [],
      4: ['collectionReportedNotSettled', 'openDispute'],
      5: [],
      6: ['collectionReportedNotSettled', 'uncertainSettlement'],
      7: [],
      8: [
        'collectionReportedNotSettled',
        'overdueSettlement',
        'openDispute',
        'cashReturn',
        'lateSettlementReview',
      ],
      9: [],
      10: ['collectionReportedNotSettled', 'overdueSettlement', 'openDispute', 'cashReturn'],
      11: [
        'collectionReportedNotSettled',
        'overdueSettlement',
        'cashReturn',
        'lateSettlementReview',
      ],
      12: [],
      13: ['recoveryRestriction'],
      14: [],
    };
    expect(Object.keys(expected)).toHaveLength(OWN.length);
    for (const [n, exceptions] of Object.entries(expected))
      expect([n, byCase.get(OWN[Number(n) - 1]!.request.id)]).toEqual([n, exceptions]);
  });

  it('each category lists exactly its cases through the existing directory filter', async () => {
    const g = gateway();
    const all = await rows(g);
    for (const exception of ASSISTANCE_EXCEPTIONS) {
      const filtered = await firstValueFrom(
        g.cases(COMPANY, EXCEPTION_FILTER[exception], { after: null, limit: 200 }),
      );
      expect([exception, filtered.items.map((r) => r.requestId).sort()]).toEqual([
        exception,
        all
          .filter((r) => assistanceExceptions(r).includes(exception))
          .map((r) => r.requestId)
          .sort(),
      ]);
    }
  });

  it('a reported collection is never a verified fact: settled and returned cases are never "reported, not settled"', async () => {
    expect(EXCEPTION_SOURCE.collectionReportedNotSettled).toBe('report');
    for (const r of await rows(gateway())) {
      const reported = assistanceExceptions(r).includes('collectionReportedNotSettled');
      expect(reported).toBe(r.state === 'cash_collected');
      if (r.state === 'settled' || r.state === 'returned') expect(reported).toBe(false);
    }
  });

  it('the exceptions that feed T1, T2 and T3 agree with Core’s restrictions of each Organization', async () => {
    for (const r of await rows(gateway())) {
      const fed = assistanceExceptions(r)
        .map((e) => EXCEPTION_RESTRICTION[e])
        .filter((t) => t !== null);
      const restrictions = demoRestrictionsOf(ALL, r.organizationId, NOW);
      for (const t of fed) expect(restrictions).toContain(t);
    }
    expect(EXCEPTION_RESTRICTION).toMatchObject({
      overdueSettlement: 'T1',
      cashReturn: 'T2',
      recoveryRestriction: 'T3',
      openDispute: null,
    });
  });

  it('checks a category from untrusted input', () => {
    expect(isAssistanceException('openDispute')).toBe(true);
    for (const bad of ['refund', 'OPENDISPUTE', '', null, 3])
      expect(isAssistanceException(bad)).toBe(false);
  });
});
