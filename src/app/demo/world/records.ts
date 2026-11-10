import {
  CompanyId,
  OrganizationId,
  PlatformId,
  PlatformProduct,
} from '../../core/context/scope.model';

/**
 * The canonical records of the demo world (development builds only): the simulated Core's PERSISTENT business and
 * administrative data, one record per entity, every displayed figure derived from them (selectors.ts). Not Core data and
 * not a Core contract; the shapes are the demo's own, chosen so the P2.5+ mocks can share them.
 *
 * Not here: credentials, sign-in scenarios and the active session (core/auth: auth.fixtures, DemoAuthState).
 */

/** A Company owner or Platform operator as a business identity (the user id Core's `/auth/me` would carry). */
export type AdminIdentityId = string & { readonly __adminIdentity: true };
export const adminIdentityId = (value: string): AdminIdentityId => value as AdminIdentityId;

export interface CompanyRecord {
  readonly id: CompanyId;
  readonly name: string;
  /** The one owner of the Company (Core: one owner per Company). */
  readonly ownerId: AdminIdentityId;
}

export interface PlatformRecord {
  readonly id: PlatformId;
  readonly companyId: CompanyId;
  readonly name: string;
  /** Core's optional public slug: a machine value, never translated. */
  readonly key: string | null;
  readonly product: PlatformProduct | null;
}

export interface OrganizationRecord {
  readonly id: OrganizationId;
  readonly platformId: PlatformId;
  /** User data: never translated. */
  readonly name: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly createdAt: string;
  /** The Organization's assisted-payments override: inherit the Platform's setting, or disabled. */
  readonly assistedPayments: 'inherit' | 'disabled';
  /**
   * Core's optional Organization metadata (organization-service `organization-input.ts`): free text, `null` when absent.
   * `type` is opaque: Core never validates or interprets it, and neither does the demo.
   */
  readonly taxCode: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly type: string | null;
  /** UTC instant of the last change (Core's `updatedAt`): the creation instant until a metadata edit changes something. */
  readonly updatedAt: string;
}

/**
 * A member's Auth identity (`user`, kind `member`), as far as Core's Organization membership list exposes it (P5-S0):
 * an id, an email or a phone, and whether the contact is verified. No name exists. Never an owner or an operator.
 */
export interface MemberIdentityRecord {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly contactVerified: boolean;
}

/** Core's membership states (ADR-0030): pending → active | rejected; active → revoked. `rejected` and `revoked` are final. */
export type MembershipStatus = 'pending' | 'active' | 'rejected' | 'revoked';

/**
 * One user's membership of one Organization (`organization_membership`, ADR-0028/0030; one per user and Organization).
 * The organization-admin privilege is its own flag, set only while active; membership alone grants no authority.
 * Counts are derived from these records: active memberships are "memberships", pending ones "requests".
 */
export interface MembershipRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: string;
  readonly status: MembershipStatus;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly rejectedAt: string | null;
  readonly revokedAt: string | null;
  readonly isOrganizationAdmin: boolean;
  /** Opaque, platform-defined label from the join code or the admin invitation. */
  readonly audience: string;
}

/** The Company's administrative staff: its owner and its Platform operators. Never an Organization member. */
export interface AdminIdentityRecord {
  readonly id: AdminIdentityId;
  readonly kind: 'owner' | 'operator';
}

/**
 * A Platform operator's account (Auth `user` of kind `operator` with its `operator` row; P6-S0, Core `750eb21`): one
 * email OR one phone (never a name, never a password), whether the contact is confirmed (`contactVerifiedAt`), and
 * whether the owner has blocked the account (`user.isActive = false`). An operator belongs to exactly one Company.
 * Core has NO read that exposes these fields to the owner (CF-03): the directory built on them is provisional.
 *
 * Not here: working codes, confirmation codes and their attempts (sign-in state, `DemoAuthState`).
 */
export interface OperatorProfileRecord {
  readonly id: AdminIdentityId;
  readonly email: string | null;
  readonly phone: string | null;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly createdAt: string;
  readonly contactConfirmedAt: string | null;
  readonly blocked: boolean;
}

/**
 * One Platform assignment of an operator (Auth `platform_assignment`, append-only; P6-S0): granted by the Company owner,
 * removed by marking it (`revokedAt`, `revokedBy`), never deleted; a re-grant is a new record. At most one ACTIVE
 * assignment per operator and Platform. Only active ones grant Platform authority; `active` is derived
 * (`revokedAt === null`), as Core's `pa_active_iff_not_revoked` keeps them equal.
 */
export interface PlatformAssignmentRecord {
  readonly id: string;
  readonly operatorId: AdminIdentityId;
  readonly platformId: PlatformId;
  /** The granting and removing owner's user id (Core derives both from the session, never from a request). */
  readonly assignedBy: AdminIdentityId;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly assignedAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: AdminIdentityId | null;
}

/**
 * Billing's STORED subscription status (nawara-core `f62b96b`, identical at `8d89bed`: billing-service
 * `src/domain/state-machines.ts` `SUBSCRIPTION_STATUSES`; migration 0013 `subscription_status_valid`). There is no
 * `cancelled` or `terminated` status: cancellation is the `cancelAtPeriodEnd` field and an administrative termination is
 * `expired` with `effectiveTerminationAt`. The stored status may lag the clock (Core has no status sweeper), so no
 * entitlement or Admin view state is ever derived from it, except that `pending` has no period. Not an Admin view state.
 */
export type SubscriptionStatusFact = 'pending' | 'active' | 'grace' | 'expired';

/**
 * The one subscription of an Organization (Billing), as the facts Core keeps on its `subscription` row (nawara-core
 * `f62b96b` billing-service `src/subscriptions/subscription.types.ts`, migrations 0013 and 0024), with Core's own field
 * names. At most one per Organization (`subscription_organization_unique`). An Organization without a record has never
 * had a subscription; an `expired` record keeps its LAST period and is never the absence of a record.
 *
 * Invariants (Core's database checks; asserted by `subscription-facts.spec.ts`):
 * - `pending`: no period, no grace, no termination, not cancelling (`subscription_pending_shape`);
 * - otherwise `currentPeriodStart < currentPeriodEnd` (`subscription_active_has_period`, `subscription_period_order`);
 * - `graceUntil` is exactly `currentPeriodEnd` + 24 hours (0024, the fixed Organization grace);
 * - `effectiveTerminationAt`, when set, is no later than `graceUntil`: it only shortens access
 *   (`subscription_termination_shape`).
 *
 * PROVISIONAL mock facts: Core has no human read of a subscription (CF-36, CF-37), and these records never imply a Core
 * settlement, invoice or payment. Deliberately absent (no Admin read contract carries them): Core's `id`, `productId`,
 * `priceId`, `billingAnchorAt` and `revision`. Read only: no demo command creates, renews, extends or ends one.
 */
export interface OrganizationSubscriptionRecord {
  readonly organizationId: OrganizationId;
  readonly status: SubscriptionStatusFact;
  /** UTC instants, ISO 8601 with `Z`; `null` exactly while `pending`. The period is half-open: `[start, end)`. */
  readonly currentPeriodStart: string | null;
  readonly currentPeriodEnd: string | null;
  /** UTC instant: `currentPeriodEnd` + 24 hours; `null` exactly while `pending`. */
  readonly graceUntil: string | null;
  /** What happens at the next boundary; it never shortens access already paid for (Core `domain/entitlement.ts`). */
  readonly cancelAtPeriodEnd: boolean;
  /** UTC instant of an administrative termination, no later than `graceUntil`; otherwise `null`. */
  readonly effectiveTerminationAt: string | null;
}

/** An organization-admin invitation awaiting acceptance (Auth). */
/**
 * An organization-admin invitation (Auth `organization_admin_invitation`, ADR-0029; verified in P3b-S3-0). It holds
 * what Core's list returns and nothing more: NEVER the code (Core keeps only its HMAC; the demo keeps nothing) and NEVER
 * the contact (Core keeps only an HMAC; the demo keeps only whether one was given). The status is derived
 * (`invitationStatusOf`), never stored.
 */
export interface AdminInvitationRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  /** Opaque, platform-defined audience label (`^(?!admin$)[a-z][a-z0-9_-]{0,31}$`). */
  readonly invitationType: string;
  readonly contactBound: boolean;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly expiresAt: string;
  readonly createdAt: string;
  /** The creating user's id (Core's `createdBy`): the owner's session user, or an organization admin's. */
  readonly createdBy: string;
  readonly consumedAt: string | null;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
}

// ── Billing and Payment facts (WP-3.2) ──────────────────────────────────────────────────────────────────────────────
// Mirrored from nawara-core `8d89bed` with Core's own field names, and ONLY the fields Admin's projections need: no amount,
// currency, due date, fee, balance, provider reference or raw provider payload is kept (none is shown, and none would be
// truthful demo data). Each layer is its own record; none is derived from another, and no status implies another layer's.
// Paths: `billing-service/db/migrations/…`, `payment-service/db/migrations/…`.

/** Billing's invoice states (`billing 0003_invoice.sql:68`). */
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void';

/** A Billing invoice: the obligation, and its Organization context (`invoice."organizationId"`, `0003:16`). */
export interface InvoiceRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly status: InvoiceStatus;
}

/** Billing's payment-request states (`billing 0006_payment_request.sql:29`). */
export type PaymentRequestStatus =
  'created' | 'sending' | 'requested' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'rejected';

/**
 * Billing's request to Payment for one invoice (`0006:5-34`). `paymentId` is null until Payment acknowledges it (`created`,
 * `sending`, `rejected`) and always set once acknowledged (`requested`, `paid`, `failed`, `expired`) (`0006:31-33`). Its status
 * is Billing's view of the request, NOT a financial outcome: a `failed` request does not prove no money was captured.
 */
export interface PaymentRequestRecord {
  readonly id: string;
  readonly invoiceId: string;
  readonly status: PaymentRequestStatus;
  readonly paymentId: string | null;
}

/** Payment's payment states (`payment 0012_payment_closing_finality.sql:72`). */
export type PaymentStatus =
  'created' | 'pending' | 'closing' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

/** Payment's own payment for one payment request (`payment 0002_payment.sql:4-27`, `"paymentRequestId"`). */
export interface PaymentRecord {
  readonly id: string;
  readonly paymentRequestId: string;
  readonly status: PaymentStatus;
}

/** Attempt states (`payment 0003_payment_attempt.sql:21`); `unknown` is Core's own state for an unresolved attempt. */
export type PaymentAttemptStatus =
  'initiated' | 'submitted' | 'succeeded' | 'failed' | 'expired' | 'unknown';

/** One provider attempt of a payment; a payment may have several, numbered from 1 (`0003:3-24`). */
export interface PaymentAttemptRecord {
  readonly id: string;
  readonly paymentId: string;
  readonly attemptNumber: number;
  readonly status: PaymentAttemptStatus;
  /** `0003:22`: how a failure was classified, if at all. `ambiguous` says the outcome is not known. */
  readonly failureClass: 'retryable' | 'terminal' | 'ambiguous' | null;
}

/** Webhook processing states (`payment 0005_webhook_event.sql:20`). */
export type ProviderObservationState =
  'received' | 'processing' | 'processed' | 'ignored' | 'unmatched' | 'conflict' | 'failed';

/**
 * A provider OBSERVATION: a webhook Payment received (`webhook_event`, `0005:5-23`), matched to an attempt or not. It is not a
 * verified fact: what it says is not kept here, and only a provider transaction fact records a verified capture, refund or
 * chargeback.
 */
export interface ProviderObservationRecord {
  readonly id: string;
  readonly matchedAttemptId: string | null;
  readonly state: ProviderObservationState;
}

/** Verified provider fact kinds (`payment 0019_payment_dispute.sql:48`, extending `0013:45`, `0017:228`). */
export type ProviderFactKind = 'capture' | 'refund' | 'chargeback';

/**
 * A VERIFIED provider fact (`provider_transaction_fact`, `payment 0013_provider_transaction_fact.sql:28-52`): bound to one
 * attempt of one payment, first reported through an authenticated channel (`source`), and test-mode only in Core
 * (`liveMode = false`, `0013:49`). Every record in the demo world is a DETERMINISTIC DEMO FIXTURE: it was never observed by
 * Nawara Core, is not a provider receipt and is not settlement evidence.
 */
export interface ProviderFactRecord {
  readonly id: string;
  readonly kind: ProviderFactKind;
  readonly paymentId: string;
  readonly attemptId: string;
  readonly source: 'webhook' | 'status_check';
  /** Set exactly when `source` is `webhook` (`0013:51`). */
  readonly webhookEventId: string | null;
  readonly liveMode: false;
  readonly demoFixture: true;
}

/** Billing's refund-case states (`billing 0033_refund_case.sql:51`). */
export type RefundCaseStatus = 'open' | 'cancelled' | 'completed';

/**
 * Billing's refund CASE for one captured payment (`0033:22-51`): the owner's request to refund, not a refund. A refund is
 * verified only by a `refund` provider fact; `completed` is Billing's case state, never read here as money returned.
 */
export interface RefundCaseRecord {
  readonly id: string;
  readonly paymentRequestId: string;
  readonly paymentId: string;
  readonly status: RefundCaseStatus;
}

/**
 * Per-Platform commercial facts that are not about one Organization:
 * - `personalPremium`: people's own Personal Premium subscriptions active in the product (a DECLARED count: person
 *   records arrive with P5; never derived from, nor added to, Organization subscriptions);
 * - `assistedPayments`: the Platform's setting, which Organizations inherit or override to disabled.
 */
export interface PlatformCommercialRecord {
  readonly platformId: PlatformId;
  readonly personalPremium: number;
  readonly assistedPayments: 'enabled' | 'disabled';
}

/** An administrative event on a Platform (the source of the Platform, Organization and Company feeds). */
export interface PlatformActivityRecord {
  readonly id: string;
  readonly platformId: PlatformId;
  readonly organizationId: OrganizationId | null;
  readonly action:
    | 'platform.created'
    | 'organization.created'
    | 'organization.updated'
    | 'admin_invitation.created'
    | 'admin_invitation.revoked'
    | 'membership.approved'
    | 'membership.rejected'
    | 'membership.revoked'
    | 'organization.admin.granted'
    | 'organization.admin.revoked'
    | 'operator.assigned'
    /** A Platform assignment removed by the owner (P6-S2). */
    | 'operator.unassigned';
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

/**
 * A Company-level administrative event that belongs to no Platform: an operator account created by the owner (P6-S4)
 * or blocked or unblocked (P6-S3; Core's `account.disabled` / `account.enabled`, which carry no Platform or
 * Organization). Shown in the Company Overview feed only; never given a fictitious Platform. Its subject is the
 * operator's id, never a contact.
 */
export interface CompanyActivityRecord {
  readonly id: string;
  readonly platformId: null;
  readonly organizationId: null;
  readonly action: 'operator.created' | 'operator.blocked' | 'operator.unblocked';
  /** The operator the event is about (an id: no contact is ever recorded). */
  readonly subjectId: AdminIdentityId;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

/** Any administrative event of the demo world. */
export type ActivityRecord = PlatformActivityRecord | CompanyActivityRecord;

/**
 * A command the world has already applied, by idempotency key (the simulated Core keeps its replay record). A repeat with
 * the same key, command, actor and request answers the stored result; any other reuse of the key is refused.
 */
export interface IdempotencyRecord {
  readonly key: string;
  readonly command: string;
  readonly actor: AdminIdentityId;
  /** The request it was applied to (a canonical string of the command's input). */
  readonly request: string;
  /** The id of what it created. */
  readonly resultId: string;
}

export interface DemoWorldTables {
  readonly company: CompanyRecord;
  readonly platforms: readonly PlatformRecord[];
  readonly organizations: readonly OrganizationRecord[];
  readonly identities: readonly AdminIdentityRecord[];
  /** The operators' accounts, one per operator identity (P6-S1). */
  readonly operators: readonly OperatorProfileRecord[];
  /** Every Platform assignment ever made, active and removed (P6-S1: append-only history). */
  readonly assignments: readonly PlatformAssignmentRecord[];
  readonly subscriptions: readonly OrganizationSubscriptionRecord[];
  readonly adminInvitations: readonly AdminInvitationRecord[];
  /** Member identities and their Organization memberships (P5-S1). */
  readonly members: readonly MemberIdentityRecord[];
  readonly memberships: readonly MembershipRecord[];
  /** Billing and Payment facts (WP-3.2): payment follow-ups are derived from them (`paymentIssuesOf`), never stored. */
  readonly invoices: readonly InvoiceRecord[];
  readonly paymentRequests: readonly PaymentRequestRecord[];
  readonly payments: readonly PaymentRecord[];
  readonly paymentAttempts: readonly PaymentAttemptRecord[];
  readonly providerObservations: readonly ProviderObservationRecord[];
  readonly providerFacts: readonly ProviderFactRecord[];
  readonly refundCases: readonly RefundCaseRecord[];
  readonly platformCommercial: readonly PlatformCommercialRecord[];
  readonly activity: readonly ActivityRecord[];
  /** Records created at run time so far: their ids are numbered from it, so they are stable and never reuse a seed id. */
  readonly sequence: number;
  readonly idempotency: readonly IdempotencyRecord[];
}
