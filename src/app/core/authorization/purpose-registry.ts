/**
 * Core's owner step-up purposes and how each one is authorized (F1-S1; docs/design/f1-financial-authorization.md §3, §6.1).
 *
 * Source, verbatim: nawara-core `0044b20`, auth-service `src/owner/step-up.service.ts:23-100` (`STEP_UP_METHODS`): 32
 * purposes. One is deliberately left out, with its reason in `EXCLUDED_CORE_PURPOSES`. Each entry's transport, delivery and
 * recipient come from the route that consumes it (cited per entry; paths relative to `nawara-core/apps/`). Machine values:
 * never translated.
 *
 * Headless and typed only: nothing here obtains, stores or sends a proof, and no current caller reads it yet.
 */

/** The re-verification methods Core accepts for a purpose. `secret_key` never satisfies a factor-only purpose. */
export type StepUpFactor = 'totp' | 'webauthn' | 'secret_key';

/**
 * How Core checks the proof: inside Auth's own route (`authLocal`); by another service, through
 * `POST /auth/step-up/verify` with the owner's own bearer (`serviceVerified`); or by Auth issuing a single-use authorization
 * receipt that a financial service consumes later (`receipt`; the generic verify refuses these purposes without consuming them).
 */
export type AuthorizationTransport = 'authLocal' | 'serviceVerified' | 'receipt';

/** Where the step-up token travels: the `x-step-up-token` header, or a `stepUpToken` field of the JSON body. Not interchangeable. */
export type ProofDelivery = 'header' | 'body';

/** The Core service whose route receives the step-up token. */
export type ProofRecipient = 'auth' | 'organization' | 'release' | 'audit' | 'billing';

interface PurposeRule {
  readonly transport: AuthorizationTransport;
  readonly factors: readonly StepUpFactor[];
  readonly delivery: ProofDelivery;
  readonly recipient: ProofRecipient;
}

const FACTOR_ONLY = ['totp', 'webauthn'] as const;
const ANY_FACTOR = ['totp', 'webauthn', 'secret_key'] as const;

const AUTH_HEADER = { transport: 'authLocal', delivery: 'header', recipient: 'auth' } as const;
const RECEIPT = { transport: 'receipt', delivery: 'body', recipient: 'auth' } as const;

/**
 * Every included Core purpose, once. Factors: `step-up.service.ts` at the cited line. Delivery: the consuming controller.
 * Receipt purposes are presented to Auth's `POST /auth/admin/authorization-receipts` as body `stepUpToken`
 * (`auth-service/src/receipts/dto.ts:109-114`), never to the financial route itself.
 */
export const PURPOSE_RULES = {
  // Auth-local, header `x-step-up-token` (auth-service).
  'platform_assignment.grant': { ...AUTH_HEADER, factors: ANY_FACTOR }, // :24; platform/platform.controller.ts:57-59
  'platform_assignment.revoke': { ...AUTH_HEADER, factors: ANY_FACTOR }, // :25; platform/platform.controller.ts:67-69
  'operator.create': { ...AUTH_HEADER, factors: ANY_FACTOR }, // :30; operator/operator.controller.ts:57-59
  'owner.secret_key.rotate': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :31; owner/owner.controller.ts:189-191
  'owner.factor.enroll': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :32; owner/owner.controller.ts:123-144
  'owner.factor.remove': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :33; owner/owner.controller.ts:152-154
  'owner.password.change': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :34; owner/owner.controller.ts:205-207
  'join_code.create': { ...AUTH_HEADER, factors: ANY_FACTOR }, // :36; membership/organization.controller.ts:12, :49
  'join_code.revoke': { ...AUTH_HEADER, factors: ANY_FACTOR }, // :37; membership/organization.controller.ts:12, :65
  'organization.admin.grant': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :39; membership/organization.controller.ts:12, :109
  'organization.admin.revoke': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :40; membership/organization.controller.ts:12, :118
  'admin_invitation.create': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :42; membership/organization.controller.ts:12, :130
  'admin_invitation.revoke': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :43; membership/organization.controller.ts:12, :146
  'account.suspend': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :45; members/member-security.controller.ts:38-43
  'account.restore': { ...AUTH_HEADER, factors: FACTOR_ONLY }, // :46; members/member-security.controller.ts:52-57

  // Service-verified: the receiving service calls `POST /auth/step-up/verify` (auth-service auth/auth.controller.ts:107-116).
  'platform.create': {
    transport: 'serviceVerified',
    factors: ANY_FACTOR,
    delivery: 'header',
    recipient: 'organization',
  }, // :26; organization-service/src/admin/admin.controller.ts:22, :91
  'organization.create': {
    transport: 'serviceVerified',
    factors: ANY_FACTOR,
    delivery: 'header',
    recipient: 'organization',
  }, // :29; organization-service/src/admin/admin.controller.ts:22, :149
  'release.withdraw': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'header',
    recipient: 'release',
  }, // :50; release-service/src/admin/admin.controller.ts:9, :88
  'compatibility_policy.change': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'header',
    recipient: 'release',
  }, // :51; release-service/src/admin/admin.controller.ts:9, :114
  'audit.legal_hold.place': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'body',
    recipient: 'audit',
  }, // :63; audit-service/src/legal-hold/legal-hold.service.ts:52-60 (body `stepUpToken`)
  'audit.legal_hold.release': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'body',
    recipient: 'audit',
  }, // :64; audit-service/src/legal-hold/legal-hold.service.ts:83-89 (body `stepUpToken`)
  'billing.assistance.correct': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'header',
    recipient: 'billing',
  }, // :69; billing-service/src/assistance/assistance.controller.ts:377, :413
  'billing.assistance.dispute.resolve': {
    transport: 'serviceVerified',
    factors: FACTOR_ONLY,
    delivery: 'header',
    recipient: 'billing',
  }, // :70; billing-service/src/assistance/assistance.controller.ts:377, :439

  // Receipt-bound (auth-service receipts/receipt-binding.ts:158-162, `RECEIPT_PURPOSES`).
  'refund.authorize': { ...RECEIPT, factors: FACTOR_ONLY }, // :59; receipt operation `refund`
  'payment.dispute.decide': { ...RECEIPT, factors: FACTOR_ONLY }, // :75; `dispute_decision`
  'billing.fraud_hold.place': { ...RECEIPT, factors: FACTOR_ONLY }, // :80; `fraud_hold_place`
  'billing.fraud_hold.release': { ...RECEIPT, factors: FACTOR_ONLY }, // :81; `fraud_hold_release`
  'billing.recovery_surplus.record_external': { ...RECEIPT, factors: FACTOR_ONLY }, // :86; `recovery_surplus_external`
  'billing.late_settlement.apply': { ...RECEIPT, factors: FACTOR_ONLY }, // :91; `late_settlement_apply`
  'payment.provider_fact.associate': { ...RECEIPT, factors: FACTOR_ONLY }, // :97; `provider_fact_associate`
  'billing.recovery.write_off': { ...RECEIPT, factors: FACTOR_ONLY }, // :98; `recovery_write_off`
} as const satisfies Readonly<Record<string, PurposeRule>>;

/**
 * Core purposes deliberately not represented, each with its reason. `hierarchy.reference.repair` (`step-up.service.ts:55`,
 * Auth-local, factor only) belongs to the ADR-0061 reference repair, whose activation is MOVE V3 in Core's roadmap; Admin
 * offers no repair, so it has no purpose to type.
 */
export const EXCLUDED_CORE_PURPOSES = {
  'hierarchy.reference.repair':
    'ADR-0061 hierarchy reference repair: activation is MOVE V3 (Core roadmap); no Admin capability',
} as const;

/** The Core revision this registry was verified against, and how many purposes Core declares there. */
export const PURPOSE_REGISTRY_BASELINE = {
  repository: 'nawara-solutions/nawara-core',
  revision: '0044b20',
  source: 'apps/auth-service/src/owner/step-up.service.ts:23-100',
  corePurposeCount: 32,
} as const;

export type CorePurpose = keyof typeof PURPOSE_RULES;
export type ExcludedCorePurpose = keyof typeof EXCLUDED_CORE_PURPOSES;

type RuleOf<P extends CorePurpose> = (typeof PURPOSE_RULES)[P];

/** The purposes whose rule has `transport` T. */
export type PurposeWithTransport<T extends AuthorizationTransport> = {
  [P in CorePurpose]: RuleOf<P>['transport'] extends T ? P : never;
}[CorePurpose];

/** The purposes whose step-up token travels as D. */
export type PurposeWithDelivery<D extends ProofDelivery> = {
  [P in CorePurpose]: RuleOf<P>['delivery'] extends D ? P : never;
}[CorePurpose];

export type AuthLocalPurpose = PurposeWithTransport<'authLocal'>;
export type ServiceVerifiedPurpose = PurposeWithTransport<'serviceVerified'>;
export type ReceiptPurpose = PurposeWithTransport<'receipt'>;

/** The purposes whose own Core route reads `x-step-up-token` (Auth-local and most service-verified). */
export type HeaderPurpose = PurposeWithDelivery<'header'> &
  (AuthLocalPurpose | ServiceVerifiedPurpose);
/** Service-verified purposes whose route reads a body `stepUpToken` (Audit legal holds). */
export type BodyServiceVerifiedPurpose = PurposeWithDelivery<'body'> & ServiceVerifiedPurpose;

/** The purposes that accept the secret key (all others are factor only). */
export type SecretKeyPurpose = {
  [P in CorePurpose]: 'secret_key' extends RuleOf<P>['factors'][number] ? P : never;
}[CorePurpose];

export const isCorePurpose = (value: string): value is CorePurpose =>
  Object.hasOwn(PURPOSE_RULES, value);

export const purposeRule = <P extends CorePurpose>(purpose: P): RuleOf<P> => PURPOSE_RULES[purpose];

/** Whether Core accepts this factor for the purpose. */
export const allowsFactor = (purpose: CorePurpose, factor: StepUpFactor): boolean =>
  (PURPOSE_RULES[purpose].factors as readonly StepUpFactor[]).includes(factor);

/**
 * Core's receipt operations and the one step-up purpose each issuance consumes (auth-service
 * `src/receipts/receipt-binding.ts:158-162`, `RECEIPT_PURPOSES`, at `0044b20`). Machine values.
 */
export const RECEIPT_OPERATION_PURPOSE = {
  refund: 'refund.authorize',
  dispute_decision: 'payment.dispute.decide',
  fraud_hold_place: 'billing.fraud_hold.place',
  fraud_hold_release: 'billing.fraud_hold.release',
  recovery_surplus_external: 'billing.recovery_surplus.record_external',
  late_settlement_apply: 'billing.late_settlement.apply',
  provider_fact_associate: 'payment.provider_fact.associate',
  recovery_write_off: 'billing.recovery.write_off',
} as const satisfies Readonly<Record<string, ReceiptPurpose>>;

export type ReceiptOperation = keyof typeof RECEIPT_OPERATION_PURPOSE;

/**
 * The two financial service-verified purposes: Billing's assistance correction and dispute resolution, each verified through
 * `POST /auth/step-up/verify` (billing-service `src/assistance/assistance.controller.ts:377`, `:413`, `:439`).
 */
export const ASSISTANCE_STEP_UP_PURPOSE = {
  correct: 'billing.assistance.correct',
  disputeResolve: 'billing.assistance.dispute.resolve',
} as const satisfies Readonly<Record<string, ServiceVerifiedPurpose>>;
