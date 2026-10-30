import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  DemoAssistanceCase,
  demoAssistanceCases,
} from '../../../demo/world/assistance/assistance.seed';
import { DemoWorld } from '../../../demo/world/demo-world';
import { grantsOf, isCompanyPlatform } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  AssistanceReadContext,
  filterInContext,
  recordInContext,
  selectionId,
} from '../domain/assistance-read-context';
import {
  ASSISTANCE_PAGE_LIMIT,
  AssistanceCaseDetail,
  AssistanceCaseFilter,
  AssistanceCaseSummary,
  AssistanceDisputeView,
  AssistancePage,
  AssistancePageRequest,
  AssistanceSettlementView,
  AssistanceTimelineEntry,
  LateSettlementDetail,
  LateSettlementFilter,
  RecoveryFilter,
  RecoveryObligationDetail,
  isAssistanceRequestState,
} from '../domain/assistance-read.model';
import {
  AssistanceRestriction,
  CashReturnObligation,
  LateSettlement,
  RecoveryObligation,
} from '../domain/assistance.model';
import { AssistanceGateway } from './assistance.gateway';

/**
 * Which answer the demo adapter gives (Assistance A3), so every view state can be reviewed. Demo builds use `normal`.
 * - `empty`: the Company has no assistance case at all;
 * - `unavailable`: Billing answers `503` (nothing read).
 * Loading is the adapter's latency (`DEMO_LATENCY_MS`).
 */
export type AssistanceDemoScenario = 'normal' | 'empty' | 'unavailable';

export const ASSISTANCE_DEMO_SCENARIO = new InjectionToken<AssistanceDemoScenario>(
  'ASSISTANCE_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'operation_not_permitted', status: 403 };
const INVALID: AppError = {
  kind: 'validation',
  code: 'invalid_assistance_request',
  messages: [],
  status: 400,
};

/**
 * What Core derives for an Organization (billing-service `0039_recovery.sql`, `billing_assistance_restrictions`), at `now`:
 * T1 a collected request past its `settleBy`; T2 an open or reported cash return; T3 an open recovery obligation. In order.
 */
export function demoRestrictionsOf(
  cases: readonly DemoAssistanceCase[],
  organizationId: string,
  now: number,
): readonly AssistanceRestriction[] {
  const mine = cases.filter((c) => c.request.organizationId === organizationId);
  const kinds: AssistanceRestriction[] = [];
  if (mine.some((c) => overdue(c, now))) kinds.push('T1');
  if (
    mine.some((c) => c.cashReturns.some((o) => o.state === 'open' || o.state === 'return_reported'))
  )
    kinds.push('T2');
  if (mine.some((c) => c.recovery?.state === 'open')) kinds.push('T3');
  return kinds;
}

/** Core's T1 source: a collected request whose `settleBy` has passed. */
const overdue = (c: DemoAssistanceCase, now: number): boolean =>
  c.request.state === 'cash_collected' &&
  c.request.collection !== null &&
  now > Date.parse(c.request.collection.settleBy);

/** One keyset page of an already ordered list: `after` is the last id of the previous page; an unknown cursor is refused. */
function page<T>(
  items: readonly T[],
  idOf: (item: T) => string,
  request: AssistancePageRequest,
): AssistancePage<T> | null {
  const { limit, after } = request;
  if (
    !Number.isInteger(limit) ||
    limit < ASSISTANCE_PAGE_LIMIT.min ||
    limit > ASSISTANCE_PAGE_LIMIT.max
  )
    return null;
  let start = 0;
  if (after !== null) {
    const index = items.findIndex((item) => idOf(item) === after);
    if (index < 0) return null;
    start = index + 1;
  }
  const slice = items.slice(start, start + limit);
  const more = start + limit < items.length;
  return { items: slice, next: more ? idOf(slice[slice.length - 1]!) : null };
}

const byNewest = (a: string, b: string): number => b.localeCompare(a);

/**
 * Demo adapter (demo builds only) of the owner's Assistance reads, over the deterministic cases of
 * `demo/world/assistance/assistance.seed.ts`. SIMULATED: the lists and the request reads model Admin's requirement (CF-68,
 * CF-69, CF-70), not a Core route; nothing here is a Core answer.
 *
 * - The Company owner only: no session `401`, anyone else `403` (an operator included).
 * - Another Company, a Platform outside the Company, and a record of another Company or Platform: the collapsed `404`.
 * - A filter that would widen a Platform scope, an unknown state, a limit outside 1–200 or an unknown cursor: `400`.
 * - Read only: it never changes a case and never moves money.
 */
export class MockAssistanceGateway extends AssistanceGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ASSISTANCE_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  cases(
    context: AssistanceReadContext,
    filter: AssistanceCaseFilter,
    request: AssistancePageRequest,
  ): Observable<AssistancePage<AssistanceCaseSummary>> {
    return this.read(context, (cases, now) => {
      if (!filterInContext(context, filter)) return INVALID;
      if (filter.state !== undefined && !isAssistanceRequestState(filter.state)) return INVALID;
      const rows = cases
        .filter(
          (c) =>
            (filter.state === undefined || c.request.state === filter.state) &&
            (filter.platformId === undefined || c.request.platformId === filter.platformId) &&
            (filter.organizationId === undefined ||
              c.request.organizationId === filter.organizationId) &&
            (filter.overdue === undefined || overdue(c, now) === filter.overdue) &&
            (filter.disputed === undefined ||
              c.disputes.some((d) => d.state === 'open') === filter.disputed),
        )
        .sort(
          (a, b) =>
            byNewest(a.request.consentAt, b.request.consentAt) ||
            a.request.id.localeCompare(b.request.id),
        )
        .map((c) => summaryOf(c, now));
      return page(rows, (r) => r.requestId, request) ?? INVALID;
    });
  }

  caseDetail(context: AssistanceReadContext, requestId: string): Observable<AssistanceCaseDetail> {
    return this.read(context, (cases, now) => {
      const c = this.caseOf(cases, requestId);
      if (c === null) return NOT_FOUND;
      return {
        request: c.request,
        channel: c.channel,
        cashReturns: c.cashReturns,
        disputes: c.disputes,
        corrections: c.corrections,
        lateSettlementIds: c.lateSettlements.map((l) => l.id),
        recoveryObligationId: c.recovery?.id ?? null,
        restrictions: demoRestrictionsOf(cases, c.request.organizationId, now),
        overdue: overdue(c, now),
      };
    });
  }

  timeline(
    context: AssistanceReadContext,
    requestId: string,
    request: AssistancePageRequest,
  ): Observable<AssistancePage<AssistanceTimelineEntry>> {
    return this.read(context, (cases) => {
      const c = this.caseOf(cases, requestId);
      if (c === null) return NOT_FOUND;
      const entries = [...c.timeline].sort(
        (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
      );
      return page(entries, (e) => e.id, request) ?? INVALID;
    });
  }

  settlement(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<AssistanceSettlementView> {
    return this.read(context, (cases) => {
      const c = this.caseOf(cases, requestId);
      if (c === null) return NOT_FOUND;
      return { channel: c.channel, lateSettlements: c.lateSettlements.map(lateSummaryOf) };
    });
  }

  cashReturns(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<readonly CashReturnObligation[]> {
    return this.read(context, (cases) => this.caseOf(cases, requestId)?.cashReturns ?? NOT_FOUND);
  }

  disputes(context: AssistanceReadContext, requestId: string): Observable<AssistanceDisputeView> {
    return this.read(context, (cases) => {
      const c = this.caseOf(cases, requestId);
      if (c === null) return NOT_FOUND;
      return { disputes: c.disputes, corrections: c.corrections };
    });
  }

  lateSettlements(
    context: AssistanceReadContext,
    filter: LateSettlementFilter,
    request: AssistancePageRequest,
  ): Observable<AssistancePage<LateSettlement>> {
    return this.read(context, (cases) => {
      if (!filterInContext(context, filter)) return INVALID;
      const rows = cases
        .flatMap((c) => c.lateSettlements)
        .filter(
          (l) =>
            (filter.status === undefined || (filter.status === 'applied') === l.applied) &&
            (filter.platformId === undefined || l.platformId === filter.platformId) &&
            (filter.organizationId === undefined || l.organizationId === filter.organizationId),
        )
        .sort((a, b) => byNewest(a.recordedAt, b.recordedAt) || a.id.localeCompare(b.id))
        .map(lateSummaryOf);
      return page(rows, (l) => l.id, request) ?? INVALID;
    });
  }

  lateSettlement(
    context: AssistanceReadContext,
    lateSettlementId: string,
  ): Observable<LateSettlementDetail> {
    return this.read(context, (cases) => {
      const id = selectionId({ kind: 'lateSettlement', lateSettlementId });
      return cases.flatMap((c) => c.lateSettlements).find((l) => l.id === id) ?? NOT_FOUND;
    });
  }

  recoveryObligations(
    context: AssistanceReadContext,
    filter: RecoveryFilter,
    request: AssistancePageRequest,
  ): Observable<AssistancePage<RecoveryObligation>> {
    return this.read(context, (cases) => {
      if (!filterInContext(context, filter)) return INVALID;
      const rows = cases
        .flatMap((c) => (c.recovery === null ? [] : [c.recovery]))
        .filter(
          (o) =>
            (filter.state === undefined || o.state === filter.state) &&
            (filter.platformId === undefined || o.platformId === filter.platformId) &&
            (filter.organizationId === undefined || o.organizationId === filter.organizationId),
        )
        .sort((a, b) => byNewest(a.openedAt, b.openedAt) || a.id.localeCompare(b.id))
        .map(recoverySummaryOf);
      return page(rows, (o) => o.id, request) ?? INVALID;
    });
  }

  recoveryObligation(
    context: AssistanceReadContext,
    obligationId: string,
  ): Observable<RecoveryObligationDetail> {
    return this.read(context, (cases) => {
      const id = selectionId({ kind: 'recoveryObligation', obligationId });
      return cases.find((c) => c.recovery !== null && c.recovery.id === id)?.recovery ?? NOT_FOUND;
    });
  }

  /** A case of the visible set, by its request id (a non-UUID is never matched). */
  private caseOf(
    cases: readonly DemoAssistanceCase[],
    requestId: string,
  ): DemoAssistanceCase | null {
    const id = selectionId({ kind: 'case', requestId });
    return cases.find((c) => c.request.id === id) ?? null;
  }

  /**
   * The checks every read makes, then the answer. `answer` receives only the cases the context may see: the owner's Company,
   * and the context's Platform when it has one. An `AppError` answer is delivered as a failure.
   */
  private read<T>(
    context: AssistanceReadContext,
    answer: (cases: readonly DemoAssistanceCase[], now: number) => T | AppError,
  ): Observable<T> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail(FORBIDDEN);
      if (context.companyId !== world.company.id) return this.fail(NOT_FOUND);
      if (context.platformId !== null && !isCompanyPlatform(world, context.platformId))
        return this.fail(NOT_FOUND);
      if (this.scenario === 'unavailable')
        return this.fail({ kind: 'unavailable', code: 'billing_unavailable', status: 503 });
      const now = this.now();
      const visible =
        this.scenario === 'empty'
          ? []
          : demoAssistanceCases(world, now).filter(
              (c) => c.companyId === world.company.id && recordInContext(context, c.request),
            );
      const result = answer(visible, now);
      return isError(result) ? this.fail(result) : of(result).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

const isError = (value: unknown): value is AppError =>
  value === NOT_FOUND || value === FORBIDDEN || value === INVALID;

function summaryOf(c: DemoAssistanceCase, now: number): AssistanceCaseSummary {
  const r = c.request;
  return {
    requestId: r.id,
    platformId: r.platformId,
    organizationId: r.organizationId,
    productId: r.productId,
    state: r.state,
    total: { amount: r.terms.totalAmount, currency: r.terms.currency },
    settleBy: r.collection?.settleBy ?? null,
    overdue: overdue(c, now),
    openDispute: c.disputes.some((d) => d.state === 'open'),
  };
}

const lateSummaryOf = (l: LateSettlementDetail): LateSettlement => ({
  id: l.id,
  assistanceRequestId: l.assistanceRequestId,
  reason: l.reason,
  attestation: l.attestation,
  applied: l.applied,
});

const recoverySummaryOf = (o: RecoveryObligationDetail): RecoveryObligation => ({
  id: o.id,
  assistanceRequestId: o.assistanceRequestId,
  organizationId: o.organizationId,
  base: o.base,
  state: o.state,
});

export const MOCK_ASSISTANCE_PROVIDERS: readonly Provider[] = [
  { provide: AssistanceGateway, useClass: MockAssistanceGateway },
];
