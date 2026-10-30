import { Provider } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';
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
  LateSettlementDetail,
  LateSettlementFilter,
  RecoveryFilter,
  RecoveryObligationDetail,
} from '../domain/assistance-read.model';
import {
  CashReturnObligation,
  LateSettlement,
  RecoveryObligation,
} from '../domain/assistance.model';

/**
 * Frontend contract of the owner's Organization Assistance & Settlements reads (Assistance A2). READ AND DISCOVERY ONLY: no
 * method changes anything, and owner decisions (corrections, dispute resolutions, L-4, write-offs, external surpluses) are not
 * here; they go through the F1 financial-authorization foundation in later slices.
 *
 * Every method takes the read context (`assistance-read-context.ts`), so no read can leave the owner's Company or the selected
 * Platform. Ids are Core's canonical UUIDs (`selectionId`). Failures are `AppError`s, read through `assistanceReadFailureOf`.
 *
 * Core status: see `ASSISTANCE_READ_CONTRACTS`. No method has an HTTP adapter; every build binds the unavailable adapter until
 * a demo adapter is added (Assistance A3).
 */
export abstract class AssistanceGateway {
  /** The case directory, filtered, one keyset page at a time. */
  abstract cases(
    context: AssistanceReadContext,
    filter: AssistanceCaseFilter,
    page: AssistancePageRequest,
  ): Observable<AssistancePage<AssistanceCaseSummary>>;

  /** One case: its request and every record attached to it. */
  abstract caseDetail(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<AssistanceCaseDetail>;

  /** A case's history: facts, reports, decisions and derived states, oldest first. */
  abstract timeline(
    context: AssistanceReadContext,
    requestId: string,
    page: AssistancePageRequest,
  ): Observable<AssistancePage<AssistanceTimelineEntry>>;

  /** A case's settlement channel and its late settlements. */
  abstract settlement(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<AssistanceSettlementView>;

  /** A case's cash-return obligations (deadline and refund-completion origins). */
  abstract cashReturns(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<readonly CashReturnObligation[]>;

  /** A case's disputes and the owner's corrections. */
  abstract disputes(
    context: AssistanceReadContext,
    requestId: string,
  ): Observable<AssistanceDisputeView>;

  /** Discovery of late settlements (applied or not). */
  abstract lateSettlements(
    context: AssistanceReadContext,
    filter: LateSettlementFilter,
    page: AssistancePageRequest,
  ): Observable<AssistancePage<LateSettlement>>;

  /** One late settlement with its decision and evidence state. */
  abstract lateSettlement(
    context: AssistanceReadContext,
    lateSettlementId: string,
  ): Observable<LateSettlementDetail>;

  /** Discovery of recovery obligations. */
  abstract recoveryObligations(
    context: AssistanceReadContext,
    filter: RecoveryFilter,
    page: AssistancePageRequest,
  ): Observable<AssistancePage<RecoveryObligation>>;

  /** One recovery obligation with its payments and surpluses. */
  abstract recoveryObligation(
    context: AssistanceReadContext,
    obligationId: string,
  ): Observable<RecoveryObligationDetail>;
}

export type AssistanceRead = keyof AssistanceGateway;

/**
 * What Core offers each read at nawara-core `0044b20` (billing-service), and why Admin cannot integrate it for real yet.
 * - `none`: no owner route at all;
 * - `byIdOnly`: an owner read by id exists, but no owner list to discover the ids (they surface only through BIL-33);
 * - `discoveryVia`: no own list; only SOME records surface as BIL-33 reconciliation cases: an UNAPPLIED late settlement
 *   (`late_assisted_settlement`), and an obligation only through a surplus (`recovery_surplus`, the surplus id), never all of them.
 *
 * Real integration is `unavailable` for EVERY read: the missing contracts below, Core's Billing owner routes being development
 * and simulation only (each refuses in production), and the open browser session decision (D-A4).
 */
export type AssistanceCoreRead =
  | { readonly core: 'none'; readonly followUp: 'CF-70' }
  | {
      readonly core: 'byIdOnly';
      readonly route: string;
      readonly register: 'BIL-28' | 'BIL-32';
      readonly followUp: 'CF-68' | 'CF-69';
    }
  | {
      readonly core: 'discoveryVia';
      readonly route: string;
      readonly register: 'BIL-33';
      readonly followUp: 'CF-68' | 'CF-69';
    };

export interface AssistanceReadContract {
  readonly coreRead: AssistanceCoreRead;
  readonly realIntegration: 'unavailable';
  readonly blockedBy: readonly string[];
}

const NO_OWNER_READ: AssistanceReadContract = {
  coreRead: { core: 'none', followUp: 'CF-70' },
  realIntegration: 'unavailable',
  blockedBy: ['CF-70', 'D-A4'],
};

export const ASSISTANCE_READ_CONTRACTS: Readonly<Record<AssistanceRead, AssistanceReadContract>> = {
  // The request read is for its beneficiary or its Organization's administrator only (`src/assistance/assistance.controller.ts:181`).
  cases: NO_OWNER_READ,
  caseDetail: NO_OWNER_READ,
  // History also needs File evidence, which has no human path (CF-71).
  timeline: { ...NO_OWNER_READ, blockedBy: ['CF-70', 'CF-71', 'D-A4'] },
  settlement: NO_OWNER_READ,
  cashReturns: NO_OWNER_READ,
  disputes: NO_OWNER_READ,
  lateSettlements: {
    coreRead: {
      core: 'discoveryVia',
      route: 'GET /billing/admin/reconciliation-cases?type=late_assisted_settlement',
      register: 'BIL-33',
      followUp: 'CF-69',
    },
    realIntegration: 'unavailable',
    blockedBy: ['CF-69', 'D-A4', 'development-only'],
  },
  lateSettlement: {
    coreRead: {
      core: 'byIdOnly',
      route: 'GET /billing/admin/late-settlements/:id',
      register: 'BIL-32',
      followUp: 'CF-69',
    },
    realIntegration: 'unavailable',
    blockedBy: ['D-A4', 'development-only'],
  },
  recoveryObligations: {
    coreRead: {
      core: 'discoveryVia',
      route: 'GET /billing/admin/reconciliation-cases?type=recovery_surplus',
      register: 'BIL-33',
      followUp: 'CF-68',
    },
    realIntegration: 'unavailable',
    blockedBy: ['CF-68', 'D-A4', 'development-only'],
  },
  recoveryObligation: {
    coreRead: {
      core: 'byIdOnly',
      route: 'GET /billing/admin/recovery-obligations/:id',
      register: 'BIL-28',
      followUp: 'CF-68',
    },
    realIntegration: 'unavailable',
    blockedBy: ['D-A4', 'development-only'],
  },
};

/** Every non-demo build: nothing to call, so every read is unavailable (never demo records, never a request). */
export class UnavailableAssistanceGateway extends AssistanceGateway {
  cases(): Observable<AssistancePage<AssistanceCaseSummary>> {
    return throwError(adapterUnavailable);
  }
  caseDetail(): Observable<AssistanceCaseDetail> {
    return throwError(adapterUnavailable);
  }
  timeline(): Observable<AssistancePage<AssistanceTimelineEntry>> {
    return throwError(adapterUnavailable);
  }
  settlement(): Observable<AssistanceSettlementView> {
    return throwError(adapterUnavailable);
  }
  cashReturns(): Observable<readonly CashReturnObligation[]> {
    return throwError(adapterUnavailable);
  }
  disputes(): Observable<AssistanceDisputeView> {
    return throwError(adapterUnavailable);
  }
  lateSettlements(): Observable<AssistancePage<LateSettlement>> {
    return throwError(adapterUnavailable);
  }
  lateSettlement(): Observable<LateSettlementDetail> {
    return throwError(adapterUnavailable);
  }
  recoveryObligations(): Observable<AssistancePage<RecoveryObligation>> {
    return throwError(adapterUnavailable);
  }
  recoveryObligation(): Observable<RecoveryObligationDetail> {
    return throwError(adapterUnavailable);
  }
}

/** The `unavailable` bindings a later route loader passes to `adapterProviders` (core/config/app-environment.ts). */
export const UNAVAILABLE_ASSISTANCE_PROVIDERS: readonly Provider[] = [
  { provide: AssistanceGateway, useClass: UnavailableAssistanceGateway },
];
