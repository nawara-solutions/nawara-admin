import {
  ASSISTANCE_STEP_UP_PURPOSE,
  RECEIPT_OPERATION_PURPOSE,
  ReceiptPurpose,
  ServiceVerifiedPurpose,
} from './purpose-registry';

/**
 * Core's financial operations that concern Admin users, and what each requires (F1-S2b;
 * docs/design/f1-financial-authorization.md §4, §5). Verified against nawara-core `0044b20`; evidence paths are relative to
 * `nawara-core/apps/` and cite the route's controller line, or the guard and service that decide the authority.
 *
 * Headless and typed only: nothing here calls Core, and no current caller reads it. Core authorizes every request; this table
 * describes what Core will ask for, never what it has granted.
 */

/** The Core revision every entry was verified against. */
export const FINANCIAL_AUTHORITY_BASELINE = {
  repository: 'nawara-solutions/nawara-core',
  revision: '0044b20',
} as const;

/**
 * Where an operation can run. There is deliberately NO production state: no financial operation was verified as operational.
 * - `developmentOnly`: the route is mounted in every build of its service, but the service (Billing) is not deployed;
 * - `simulationOnly`: the module mounts nothing in production; it exists only in development and simulation;
 * - `unavailable`: no human-facing route exists, or a prerequisite has no human path, or Core has not decided the contract.
 */
export type FinancialAvailability = 'developmentOnly' | 'simulationOnly' | 'unavailable';

/** The Core follow-ups and open Core decisions an operation is missing or blocked by (docs/CORE-INTEGRATION.md §9). */
export type CoreFollowUp =
  | 'CF-65'
  | 'CF-66'
  | 'CF-67'
  | 'CF-68'
  | 'CF-69'
  | 'CF-70'
  | 'CF-71'
  | 'CF-72'
  | 'CF-74'
  | 'OD-05'
  | 'BIL-35';

/** What Core requires beyond the bearer: nothing, a service-verified step-up, or a single-use receipt (F1-S1 registry). */
export type FinancialAuthorization =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'serviceVerifiedStepUp';
      readonly purpose: ServiceVerifiedPurpose &
        (typeof ASSISTANCE_STEP_UP_PURPOSE)[keyof typeof ASSISTANCE_STEP_UP_PURPOSE];
    }
  | { readonly kind: 'receipt'; readonly purpose: ReceiptPurpose };

/**
 * The checks only Core can make, always pending in the browser:
 * - `liveAuthority`: Auth confirms, on that request, who the person is and that their Company or assignment still holds;
 * - `platformAccess`: Auth confirms live access to the Platform concerned (an owner of its Company, or an assigned operator);
 * - `resourceOwnership`: the case, hold, obligation, proposal, dispute or fact belongs to the person's Company and Platform;
 * - `liveDelegation`: an operator holds an active owner delegation for the Platform (never inferred from the assignment);
 * - `authorizationProof`: the step-up or receipt is valid, unexpired, unused and bound to exactly this operation;
 * - `financialInvariants`: eligibility, amounts, finality and every database invariant Core enforces.
 */
export type PendingCoreCheck =
  | 'liveAuthority'
  | 'platformAccess'
  | 'resourceOwnership'
  | 'liveDelegation'
  | 'authorizationProof'
  | 'financialInvariants';

/** The authority Core verifies for the actor; the frontend can only mirror the first part of it. */
export type AuthorityBasis =
  /** An Owner (live `/auth/grants`); the resource's Company and Platform are checked by Core per request. */
  | 'companyOwner'
  /** An Owner of the Platform's Company (live `/auth/platform-access`). */
  | 'platformOwner'
  /** An operator assigned to the Platform (live `/auth/platform-access`) AND holding an active owner delegation. */
  | 'assignedOperatorWithDelegation';

export interface CoreEvidence {
  readonly revision: typeof FINANCIAL_AUTHORITY_BASELINE.revision;
  /** The Core route, or `null` when none exists. */
  readonly route: string | null;
  readonly evidence: string;
}

/** An operation an Admin user may attempt (in development or simulation only). */
export interface AttemptableFinancialOperation {
  readonly availability: 'developmentOnly' | 'simulationOnly';
  /** Core's register id (docs/architecture/core-v2-d-a2-contract-register.md), or the decision record for unregistered routes. */
  readonly register: string;
  readonly actor: 'owner' | 'operator';
  /** What the frontend can mirror: the actor's Company, or a Platform of it (assignment for an operator). */
  readonly scope: 'company' | 'platform';
  readonly authority: AuthorityBasis;
  readonly authorization: FinancialAuthorization;
  readonly pendingCoreChecks: readonly PendingCoreCheck[];
  /** Known prerequisites still missing even though the route exists (shown, never worked around). */
  readonly blockedBy: readonly CoreFollowUp[];
  readonly core: CoreEvidence;
}

/** An operation no Admin user can perform today, kept so the UI can say why. */
export interface UnavailableFinancialOperation {
  readonly availability: 'unavailable';
  readonly register: string | null;
  readonly reason: 'noHumanRoute' | 'noHumanPrerequisite' | 'coreDecisionOpen';
  /** At least one follow-up. */
  readonly missing: readonly [CoreFollowUp, ...CoreFollowUp[]];
  /** What Core would require if it became available (documentation; never a basis for an attempt). */
  readonly authorization: FinancialAuthorization;
  readonly core: CoreEvidence;
}

export type FinancialOperationRule = AttemptableFinancialOperation | UnavailableFinancialOperation;

const core = (route: string | null, evidence: string): CoreEvidence => ({
  revision: FINANCIAL_AUTHORITY_BASELINE.revision,
  route,
  evidence,
});

const NONE: FinancialAuthorization = { kind: 'none' };
const receipt = (purpose: ReceiptPurpose): FinancialAuthorization => ({ kind: 'receipt', purpose });

const OWNER_READ: readonly PendingCoreCheck[] = ['liveAuthority', 'resourceOwnership'];
const OWNER_COMMAND: readonly PendingCoreCheck[] = [
  'liveAuthority',
  'resourceOwnership',
  'financialInvariants',
];
const OWNER_AUTHORIZED: readonly PendingCoreCheck[] = [
  'liveAuthority',
  'resourceOwnership',
  'authorizationProof',
  'financialInvariants',
];
const PLATFORM_OWNER: readonly PendingCoreCheck[] = ['liveAuthority', 'platformAccess'];

/** The Platform module: mounted in every build, Billing not deployed (billing-service/src/platforms/platforms.module.ts:21). */
const PLATFORM_MODULE = 'developmentOnly';
/** S5/S6 modules: nothing mounted in production (docs/CORE-INTEGRATION.md §11.3). */
const REFUSED_IN_PRODUCTION = 'simulationOnly';

export const FINANCIAL_OPERATIONS = {
  // ── Billing configuration, catalog and pricing (S3d, S3g) ─────────────────────────────────────────────────────────
  'platformBilling.read': {
    availability: PLATFORM_MODULE,
    register: 'BIL-01',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: PLATFORM_OWNER,
    blockedBy: [],
    core: core(
      'GET /billing/admin/platforms/:platformId',
      'billing-service/src/platforms/billing-platforms.controller.ts:74; platforms/owner.guard.ts:14-18',
    ),
  },
  'platformBilling.configure': {
    availability: PLATFORM_MODULE,
    register: 'BIL-01',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: [...PLATFORM_OWNER, 'financialInvariants'],
    blockedBy: [],
    core: core(
      'POST /billing/admin/platforms/:platformId',
      'billing-service/src/platforms/billing-platforms.controller.ts:46; platforms/owner.guard.ts:14-18',
    ),
  },
  'catalog.read': {
    availability: PLATFORM_MODULE,
    register: 'BIL-02',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: PLATFORM_OWNER,
    blockedBy: [],
    core: core(
      'GET /billing/admin/platforms/:platformId/products',
      'billing-service/src/catalog/owner-catalog.controller.ts:148',
    ),
  },
  'catalog.manageProducts': {
    availability: PLATFORM_MODULE,
    register: 'BIL-02',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: [...PLATFORM_OWNER, 'financialInvariants'],
    blockedBy: ['OD-05'],
    core: core(
      'POST /billing/admin/platforms/:platformId/products (and …/:productId/archive)',
      'billing-service/src/catalog/owner-catalog.controller.ts:59, :110',
    ),
  },
  'catalog.managePrices': {
    availability: PLATFORM_MODULE,
    register: 'BIL-03',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: [...PLATFORM_OWNER, 'financialInvariants'],
    blockedBy: ['OD-05'],
    core: core(
      'POST /billing/admin/platforms/:platformId/products/:productId/prices (and …/prices/:priceId/retire)',
      'billing-service/src/catalog/owner-catalog.controller.ts:82, :129',
    ),
  },

  // ── Fees (S3f) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  'fees.setCaps': {
    availability: PLATFORM_MODULE,
    register: 'BIL-04',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: [...PLATFORM_OWNER, 'financialInvariants'],
    blockedBy: [],
    core: core(
      'PUT /billing/admin/platforms/:platformId/fee-caps',
      'billing-service/src/fees/fees.controller.ts:40; fees/fee-actor.guard.ts:21-68',
    ),
  },
  'fees.manageDelegations': {
    availability: PLATFORM_MODULE,
    register: 'BIL-05',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: [...PLATFORM_OWNER, 'resourceOwnership', 'financialInvariants'],
    blockedBy: [],
    core: core(
      'POST /billing/admin/platforms/:platformId/fee-delegations (and …/:delegationId/revoke)',
      'billing-service/src/fees/fees.controller.ts:57, :74; fees/fee.service.ts:57 (the operator must be assigned)',
    ),
  },
  // Approve and reject name a proposal, not a Platform: Core checks the Owner (guard) and then live access to the
  // proposal's own Platform (fees/fee.service.ts:105-107). The frontend can only mirror "an Owner of this Company".
  'fees.decideProposal': {
    availability: PLATFORM_MODULE,
    register: 'BIL-07',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: [
      'liveAuthority',
      'platformAccess',
      'resourceOwnership',
      'financialInvariants',
    ],
    blockedBy: [],
    core: core(
      'POST /billing/admin/fee-proposals/:id/approve | /reject',
      'billing-service/src/fees/fees.controller.ts:89, :106; fees/fee.service.ts:105-107',
    ),
  },
  // An operator proposes only with an active owner delegation, which Core checks and the browser cannot read (CF-72).
  'fees.propose': {
    availability: PLATFORM_MODULE,
    register: 'BIL-06',
    actor: 'operator',
    scope: 'platform',
    authority: 'assignedOperatorWithDelegation',
    authorization: NONE,
    pendingCoreChecks: ['liveAuthority', 'platformAccess', 'liveDelegation', 'financialInvariants'],
    blockedBy: ['CF-72'],
    core: core(
      'POST /billing/platforms/:platformId/fee-proposals (and …/:id/withdraw)',
      'billing-service/src/fees/fees.controller.ts:132, :149; fees/fee-actor.guard.ts:21-68; fees/fee.service.ts:76',
    ),
  },
  'fees.read': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-72'],
    authorization: NONE,
    core: core(
      null,
      'billing-service/src/fees/fees.controller.ts:40-149 (commands only; no read of caps, delegations or proposals)',
    ),
  },

  // ── Invoice and payment discovery ─────────────────────────────────────────────────────────────────────────────────
  'invoices.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-66'],
    authorization: NONE,
    core: core(
      null,
      "billing-service/src/invoices/invoices.controller.ts:77 (lists only the caller's own invoices as payer or producer)",
    ),
  },
  'payments.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-66'],
    authorization: NONE,
    core: core(
      null,
      'payment-service/src/payments/payments.controller.ts:52 (one payment by id; no owner list)',
    ),
  },

  // ── Assistance oversight (S5c) ────────────────────────────────────────────────────────────────────────────────────
  'assistance.correct': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-19',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: { kind: 'serviceVerifiedStepUp', purpose: ASSISTANCE_STEP_UP_PURPOSE.correct },
    pendingCoreChecks: [...OWNER_AUTHORIZED, 'platformAccess'],
    blockedBy: ['CF-70'],
    core: core(
      'POST /billing/admin/assistance-requests/:id/corrections',
      'billing-service/src/assistance/assistance.controller.ts:394; assistance/assistance-owner.guard.ts:14-50',
    ),
  },
  'assistance.resolveDispute': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-22',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: {
      kind: 'serviceVerifiedStepUp',
      purpose: ASSISTANCE_STEP_UP_PURPOSE.disputeResolve,
    },
    pendingCoreChecks: [...OWNER_AUTHORIZED, 'platformAccess'],
    blockedBy: ['CF-70'],
    core: core(
      'POST /billing/admin/assistance-disputes/:id/resolution',
      'billing-service/src/assistance/assistance.controller.ts:421; assistance/assistance-owner.guard.ts:14-50',
    ),
  },
  'assistance.read': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-70'],
    authorization: NONE,
    core: core(
      null,
      'billing-service/src/assistance/assistance.controller.ts:181 (beneficiary or Organization administrator only)',
    ),
  },
  'restrictions.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-26',
    actor: 'owner',
    scope: 'platform',
    authority: 'platformOwner',
    authorization: NONE,
    pendingCoreChecks: ['liveAuthority', 'platformAccess', 'resourceOwnership'],
    blockedBy: [],
    core: core(
      'GET /billing/organizations/:organizationId/restrictions',
      'billing-service/src/assistance/assistance.controller.ts:469; assistance/restriction-reader.guard.ts (the human is decided per request)',
    ),
  },

  // ── Refunds (S6a–S6d, R6H-5) ──────────────────────────────────────────────────────────────────────────────────────
  'refundCase.open': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-23',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_COMMAND,
    blockedBy: ['CF-66'],
    core: core(
      'POST /billing/admin/refund-cases',
      'billing-service/src/refunds/refund-case.controller.ts:66; refunds/refund-owner.guard.ts:20-57',
    ),
  },
  'refundCase.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-25',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/refund-cases/:id',
      'billing-service/src/refunds/refund-case.controller.ts:88',
    ),
  },
  'refundCase.cancel': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-23',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_COMMAND,
    blockedBy: [],
    core: core(
      'POST /billing/admin/refund-cases/:id/cancel',
      'billing-service/src/refunds/refund-case.controller.ts:128',
    ),
  },
  'refund.authorize': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-24',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.refund),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: [],
    core: core(
      'POST /billing/admin/refund-cases/:id/authorizations',
      'billing-service/src/refunds/refund-case.controller.ts:102; refunds/refund-authorization.service.ts:28-36',
    ),
  },
  'refundCase.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-65'],
    authorization: NONE,
    core: core(
      null,
      'billing-service/src/refunds/refund-case.controller.ts:66-128 (no list route)',
    ),
  },

  // ── Payment disputes (S6e-D) ──────────────────────────────────────────────────────────────────────────────────────
  'dispute.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'PAY-09',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /payment/admin/disputes (and …/:id)',
      'payment-service/src/disputes/disputes.controller.ts:48, :65; disputes/owner-company.authority.ts:18-51',
    ),
  },
  'dispute.decide': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'PAY-11',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.dispute_decision),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: [],
    core: core(
      'POST /payment/admin/disputes/:id/decision',
      'payment-service/src/disputes/disputes.controller.ts:105',
    ),
  },
  'dispute.addEvidence': {
    availability: 'unavailable',
    register: 'PAY-10',
    reason: 'noHumanPrerequisite',
    missing: ['CF-71'],
    authorization: NONE,
    core: core(
      'POST /payment/admin/disputes/:id/evidence',
      'payment-service/src/disputes/disputes.controller.ts:85 (needs a File evidence grant); file-service/src/grants/grant.controller.ts:41-42 (service tokens only)',
    ),
  },

  // ── Fraud holds (S6e-H) ───────────────────────────────────────────────────────────────────────────────────────────
  'fraudHold.place': {
    availability: 'unavailable',
    register: 'BIL-27',
    reason: 'noHumanPrerequisite',
    missing: ['CF-71', 'CF-67', 'CF-74'],
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.fraud_hold_place),
    core: core(
      'POST /billing/admin/fraud-holds',
      'billing-service/src/fraud-holds/fraud-hold.controller.ts:24 (1 to 5 File evidence grants); file-service/src/grants/grant.controller.ts:41-42',
    ),
  },
  'fraudHold.release': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-27',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.fraud_hold_release),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: ['CF-74'],
    core: core(
      'POST /billing/admin/fraud-holds/:id/release',
      'billing-service/src/fraud-holds/fraud-hold.controller.ts:47',
    ),
  },
  'fraudHold.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-27',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/fraud-holds/:id',
      'billing-service/src/fraud-holds/fraud-hold.controller.ts:62',
    ),
  },
  'fraudHold.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-67'],
    authorization: NONE,
    core: core(
      null,
      'billing-service/src/fraud-holds/fraud-hold.controller.ts:24-62 (no list route)',
    ),
  },

  // ── Recovery and surplus (S6f, S6h-B) ─────────────────────────────────────────────────────────────────────────────
  'recovery.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-28',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/recovery-obligations/:id',
      'billing-service/src/recovery/recovery.controller.ts:149',
    ),
  },
  'recovery.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-68'],
    authorization: NONE,
    core: core(null, 'billing-service/src/recovery/recovery.controller.ts:149 (read by id only)'),
  },
  'surplus.recordExternalRepayment': {
    availability: 'unavailable',
    register: 'BIL-30',
    reason: 'noHumanPrerequisite',
    missing: ['CF-71', 'CF-74'],
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.recovery_surplus_external),
    core: core(
      'POST /billing/admin/recovery-surpluses/:id/resolution',
      'billing-service/src/recovery/recovery.controller.ts:163; recovery/recovery.service.ts:277-285 (a File surplus_evidence grant)',
    ),
  },
  'recovery.writeOff': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-34',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.recovery_write_off),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: ['CF-74'],
    core: core(
      'POST /billing/admin/recovery-obligations/:id/write-off',
      'billing-service/src/reconciliation/reconciliation.controller.ts:89',
    ),
  },

  // ── Late assisted settlement (S6g) ────────────────────────────────────────────────────────────────────────────────
  'lateSettlement.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-32',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/late-settlements/:id',
      'billing-service/src/late-settlements/late-settlement.controller.ts:105',
    ),
  },
  'lateSettlement.apply': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-32',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.late_settlement_apply),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: [],
    core: core(
      'POST /billing/admin/late-settlements/:id/application',
      'billing-service/src/late-settlements/late-settlement.controller.ts:119',
    ),
  },
  'lateSettlement.list': {
    availability: 'unavailable',
    register: null,
    reason: 'noHumanRoute',
    missing: ['CF-69'],
    authorization: NONE,
    core: core(
      null,
      'billing-service/src/late-settlements/late-settlement.controller.ts:105 (read by id only)',
    ),
  },

  // ── Reconciliation, provider facts, balances and losses (S6h) ─────────────────────────────────────────────────────
  'reconciliationCase.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-33',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/reconciliation-cases (and …/:id)',
      'billing-service/src/reconciliation/reconciliation.controller.ts:28, :44',
    ),
  },
  'reconciliationCase.acknowledge': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-33',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_COMMAND,
    blockedBy: [],
    core: core(
      'POST /billing/admin/reconciliation-cases/:id/acknowledgement',
      'billing-service/src/reconciliation/reconciliation.controller.ts:56',
    ),
  },
  'reconciliationItems.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'PAY-12',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /payment/admin/reconciliation-items',
      'payment-service/src/reconciliation/reconciliation.controller.ts:35',
    ),
  },
  'balances.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'R6H-12',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /payment/admin/balances (and …/payments/:paymentId/balance)',
      'payment-service/src/reconciliation/reconciliation.controller.ts:55, :64',
    ),
  },
  'providerFact.associate': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'PAY-13',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: receipt(RECEIPT_OPERATION_PURPOSE.provider_fact_associate),
    pendingCoreChecks: OWNER_AUTHORIZED,
    blockedBy: [],
    core: core(
      'POST /payment/admin/provider-facts/:id/associations',
      'payment-service/src/reconciliation/reconciliation.controller.ts:73',
    ),
  },
  'financialLoss.read': {
    availability: REFUSED_IN_PRODUCTION,
    register: 'BIL-34',
    actor: 'owner',
    scope: 'company',
    authority: 'companyOwner',
    authorization: NONE,
    pendingCoreChecks: OWNER_READ,
    blockedBy: [],
    core: core(
      'GET /billing/admin/financial-losses',
      'billing-service/src/reconciliation/reconciliation.controller.ts:79',
    ),
  },
  'legalRemedy.record': {
    availability: 'unavailable',
    register: 'BIL-35',
    reason: 'coreDecisionOpen',
    missing: ['BIL-35'],
    authorization: NONE,
    core: core(null, 'docs/architecture/core-v2-d-a2-contract-register.md (BIL-35 OPEN)'),
  },
} as const satisfies Readonly<Record<string, FinancialOperationRule>>;

export type FinancialOperation = keyof typeof FINANCIAL_OPERATIONS;
