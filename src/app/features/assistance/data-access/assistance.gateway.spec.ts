import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, firstValueFrom, of } from 'rxjs';
import { DemoDomain, adapterProviders } from '../../../core/config/app-environment';
import { companyId, organizationId, platformId } from '../../../core/context/scope.model';
import { AppError, adapterUnavailable } from '../../../core/errors/app-error';
import { AssistanceReadContext } from '../domain/assistance-read-context';
import {
  AssistanceCaseDetail,
  AssistanceCaseFilter,
  AssistanceCaseSummary,
  AssistanceDisputeView,
  AssistancePage,
  AssistancePageRequest,
  AssistanceSettlementView,
  AssistanceTimelineEntry,
  FIRST_ASSISTANCE_PAGE,
  LateSettlementDetail,
  RecoveryObligationDetail,
  isAssistanceRequestState,
} from '../domain/assistance-read.model';
import {
  CashReturnObligation,
  LateSettlement,
  RecoveryObligation,
} from '../domain/assistance.model';
import { assistanceReadFailureOf, noContext } from './assistance-read-failure';
import { MOCK_ASSISTANCE_PROVIDERS } from './assistance.mock';
import {
  ASSISTANCE_READ_CONTRACTS,
  AssistanceGateway,
  AssistanceRead,
  AssistanceReadContract,
  UNAVAILABLE_ASSISTANCE_PROVIDERS,
  UnavailableAssistanceGateway,
} from './assistance.gateway';

const CONTEXT: AssistanceReadContext = {
  companyId: companyId('c0000000-0000-4000-8000-000000000001'),
  platformId: null,
};
const ID = 'a0000000-0000-4000-8000-000000000001';

/** Every read, called once with valid arguments. */
const READS: Readonly<Record<AssistanceRead, (g: AssistanceGateway) => Observable<unknown>>> = {
  cases: (g) => g.cases(CONTEXT, {}, FIRST_ASSISTANCE_PAGE),
  caseDetail: (g) => g.caseDetail(CONTEXT, ID),
  timeline: (g) => g.timeline(CONTEXT, ID, FIRST_ASSISTANCE_PAGE),
  settlement: (g) => g.settlement(CONTEXT, ID),
  cashReturns: (g) => g.cashReturns(CONTEXT, ID),
  disputes: (g) => g.disputes(CONTEXT, ID),
  lateSettlements: (g) =>
    g.lateSettlements(CONTEXT, { status: 'unapplied' }, FIRST_ASSISTANCE_PAGE),
  lateSettlement: (g) => g.lateSettlement(CONTEXT, ID),
  recoveryObligations: (g) =>
    g.recoveryObligations(CONTEXT, { state: 'open' }, FIRST_ASSISTANCE_PAGE),
  recoveryObligation: (g) => g.recoveryObligation(CONTEXT, ID),
};

const readNames = (): string[] =>
  Object.getOwnPropertyNames(UnavailableAssistanceGateway.prototype)
    .filter((name) => name !== 'constructor')
    .sort();

describe('UnavailableAssistanceGateway (Assistance A2)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('every read fails as not in this build, and nothing is sent', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const gateway = new UnavailableAssistanceGateway();
    for (const [name, read] of Object.entries(READS)) {
      let caught: unknown = null;
      try {
        await firstValueFrom(read(gateway));
      } catch (error) {
        caught = error;
      }
      expect(caught, name).toEqual(adapterUnavailable());
      expect(assistanceReadFailureOf(caught), name).toEqual({ kind: 'notInBuild' });
    }
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });

  it('is what the unavailable bindings provide', () => {
    TestBed.configureTestingModule({ providers: [...UNAVAILABLE_ASSISTANCE_PROVIDERS] });
    expect(TestBed.inject(AssistanceGateway)).toBeInstanceOf(UnavailableAssistanceGateway);
  });

  it('fits the mock-first binding pattern: unavailable everywhere but a demo build (A3)', async () => {
    const domain: DemoDomain = 'assistance';
    const production = await adapterProviders(
      { production: true, demo: null },
      domain,
      UNAVAILABLE_ASSISTANCE_PROVIDERS,
    );
    expect(production).toEqual([...UNAVAILABLE_ASSISTANCE_PROVIDERS]);
    const demo = await adapterProviders(
      {
        production: false,
        demo: { load: async () => (await import('../../../demo/demo-bindings')).DEMO_BINDINGS },
      },
      domain,
      UNAVAILABLE_ASSISTANCE_PROVIDERS,
    );
    expect(demo).toEqual([...MOCK_ASSISTANCE_PROVIDERS]);
  });
});

describe('AssistanceGateway contract (Assistance A2)', () => {
  it('has reads only: no money-changing or decision method', () => {
    expect(readNames()).toEqual(Object.keys(READS).sort());
    for (const name of readNames())
      expect(name).not.toMatch(
        /apply|write|record|resolve|correct|submit|create|update|delete|confirm|refund|pay|settle$|issue|consume/i,
      );
  });

  it('records the Core status of every read; real integration is unavailable for all', () => {
    expect(Object.keys(ASSISTANCE_READ_CONTRACTS).sort()).toEqual(readNames());
    for (const [name, contract] of Object.entries(ASSISTANCE_READ_CONTRACTS)) {
      expect(contract.realIntegration, name).toBe('unavailable');
      expect(contract.blockedBy, name).toContain('D-A4');
      const read = contract.coreRead;
      if (read.core === 'none') {
        expect(contract.blockedBy, name).toContain(read.followUp);
      } else {
        // Every Core route named is an owner READ; none changes anything.
        expect(read.route, name).toMatch(/^GET \/billing\/admin\//);
        expect(contract.blockedBy, name).toContain('development-only');
      }
    }
  });

  it('models the missing Core discovery contracts', () => {
    const byCore = (core: string) =>
      Object.entries(ASSISTANCE_READ_CONTRACTS)
        .filter(([, c]) => c.coreRead.core === core)
        .map(([name]) => name)
        .sort();
    // No owner read of requests, channels, obligations or disputes (CF-70).
    expect(byCore('none')).toEqual(
      ['caseDetail', 'cases', 'cashReturns', 'disputes', 'settlement', 'timeline'].sort(),
    );
    // By id only (BIL-28, BIL-32); their lists are missing (CF-68, CF-69) and only partly surface through BIL-33.
    expect(byCore('byIdOnly')).toEqual(['lateSettlement', 'recoveryObligation']);
    expect(byCore('discoveryVia')).toEqual(['lateSettlements', 'recoveryObligations']);
    expect(ASSISTANCE_READ_CONTRACTS.lateSettlements.blockedBy).toContain('CF-69');
    expect(ASSISTANCE_READ_CONTRACTS.recoveryObligations.blockedBy).toContain('CF-68');
    expect(ASSISTANCE_READ_CONTRACTS.timeline.blockedBy).toContain('CF-71');
  });

  it('is type-compatible with an adapter built on the A1 domain types', async () => {
    const summary: AssistanceCaseSummary = {
      requestId: ID,
      platformId: platformId('p-1'),
      organizationId: organizationId('o-1'),
      productId: 'product-1',
      state: 'cash_collected',
      total: { amount: 1100, currency: 'TND' },
      settleBy: '2026-10-30T12:00:00.000Z',
      overdue: null,
      openDispute: false,
      channel: 'open',
      lateSettlement: null,
      recovery: null,
      cashReturn: null,
    };
    class TypedAdapter extends AssistanceGateway {
      cases(
        context: AssistanceReadContext,
        filter: AssistanceCaseFilter,
        page: AssistancePageRequest,
      ): Observable<AssistancePage<AssistanceCaseSummary>> {
        void context;
        void filter;
        void page;
        return of({ items: [summary], next: null });
      }
      caseDetail(): Observable<AssistanceCaseDetail> {
        return EMPTY;
      }
      timeline(): Observable<AssistancePage<AssistanceTimelineEntry>> {
        return EMPTY;
      }
      settlement(): Observable<AssistanceSettlementView> {
        return EMPTY;
      }
      cashReturns(): Observable<readonly CashReturnObligation[]> {
        return EMPTY;
      }
      disputes(): Observable<AssistanceDisputeView> {
        return EMPTY;
      }
      lateSettlements(): Observable<AssistancePage<LateSettlement>> {
        return EMPTY;
      }
      lateSettlement(): Observable<LateSettlementDetail> {
        return EMPTY;
      }
      recoveryObligations(): Observable<AssistancePage<RecoveryObligation>> {
        return EMPTY;
      }
      recoveryObligation(): Observable<RecoveryObligationDetail> {
        return EMPTY;
      }
    }
    const gateway: AssistanceGateway = new TypedAdapter();
    expect(await firstValueFrom(gateway.cases(CONTEXT, {}, FIRST_ASSISTANCE_PAGE))).toEqual({
      items: [summary],
      next: null,
    });
  });

  it('refuses ill-typed calls at compile time', () => {
    const gateway: AssistanceGateway = new UnavailableAssistanceGateway();
    const wrongContext = { companyId: platformId('p-1'), platformId: null };
    const calls: (() => unknown)[] = [
      // @ts-expect-error a state Core does not have
      () => gateway.cases(CONTEXT, { state: 'paid' }, FIRST_ASSISTANCE_PAGE),
      // @ts-expect-error a read needs its context
      () => gateway.caseDetail(ID),
      // @ts-expect-error a Platform id is not a Company id
      () => gateway.caseDetail(wrongContext, ID),
      // @ts-expect-error a list needs its page request
      () => gateway.lateSettlements(CONTEXT, {}),
      // @ts-expect-error a recovery state Core does not have
      () => gateway.recoveryObligations(CONTEXT, { state: 'written_off' }, FIRST_ASSISTANCE_PAGE),
    ];
    expect(calls).toHaveLength(5);
    // @ts-expect-error no read is available for real integration in A2
    const available: AssistanceReadContract['realIntegration'] = 'available';
    expect(available).toBe('available');
    // @ts-expect-error a report is never a fact: Core is never its actor
    const reporter: Extract<AssistanceTimelineEntry, { source: 'report' }>['by'] = 'core';
    expect(reporter).toBe('core');
  });

  it('checks filter states from untrusted input', () => {
    expect(isAssistanceRequestState('settled')).toBe(true);
    for (const bad of ['paid', 'SETTLED', '', null, 1])
      expect(isAssistanceRequestState(bad)).toBe(false);
  });
});

describe('assistanceReadFailureOf (Assistance A2)', () => {
  it('reads kind and code only, never a message', () => {
    const cases: [AppError, string][] = [
      [adapterUnavailable(), 'notInBuild'],
      [{ kind: 'unavailable', code: 'billing_unavailable', status: 503 }, 'unavailable'],
      [{ kind: 'unauthenticated', status: 401 }, 'signedOut'],
      [{ kind: 'forbidden', code: 'operation_not_permitted', status: 403 }, 'forbidden'],
      [{ kind: 'not_found', status: 404, serverMessage: 'forbidden' }, 'notFound'],
      [
        { kind: 'validation', code: 'invalid_reconciliation_request', messages: [], status: 400 },
        'invalidRequest',
      ],
      [{ kind: 'rate_limited', status: 429 }, 'rateLimited'],
      [{ kind: 'network', status: 0 }, 'network'],
      [{ kind: 'conflict', status: 409 }, 'unexpected'],
      [{ kind: 'unexpected', status: 500 }, 'unexpected'],
    ];
    for (const [error, kind] of cases) expect(assistanceReadFailureOf(error).kind).toBe(kind);
    expect(assistanceReadFailureOf(new Error('boom'))).toEqual({ kind: 'unexpected' });
  });

  it('a local refusal names its reason and is never a request', () => {
    expect(noContext('platformsUnknown')).toEqual({
      kind: 'noContext',
      refusal: 'platformsUnknown',
    });
  });
});
