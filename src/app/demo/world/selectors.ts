import { Grants } from '../../core/auth/auth.model';
import {
  SubscriptionLifecycle,
  SubscriptionLifecycleState,
} from '../../shared/subscription/subscription-lifecycle';
import {
  CompanyDirectory,
  OrganizationId,
  PlatformId,
  PlatformRef,
} from '../../core/context/scope.model';
import {
  ActivityRecord,
  AdminIdentityId,
  AdminInvitationRecord,
  MembershipRecord,
  DemoWorldTables,
  OperatorProfileRecord,
  OrganizationRecord,
  OrganizationSubscriptionRecord,
  SubscriptionStatusFact,
  PaymentAttemptRecord,
  PaymentRequestRecord,
  PaymentRequestStatus,
  LateSuccessRecord,
  PaymentDisputeRecord,
  ReconciliationCaseRecord,
  RefundAttemptRecord,
  PlatformActivityRecord,
  PlatformAssignmentRecord,
  ProviderFactRecord,
  ProviderObservationRecord,
  RefundCaseRecord,
} from './records';

/**
 * Pure selectors over a snapshot of the demo world: every figure a demo mock shows is computed here from records, never
 * stored. Feature mocks map the results to their own domain models; nothing here knows a feature.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Core V2: an Organization subscription that ends keeps access for 24 hours. */
export const SUBSCRIPTION_GRACE_HOURS = 24;

// ── Company and Platforms ─────────────────────────────────────────────────────────────────────────────────────────

export const platformRefs = (world: DemoWorldTables): readonly PlatformRef[] =>
  world.platforms.map(({ id, name, key, product }) => ({ id, name, key, product }));

/** The Company and its Platforms, as Core's hierarchy read would answer the owner. */
export const companyDirectoryOf = (world: DemoWorldTables): CompanyDirectory => ({
  company: { id: world.company.id, name: world.company.name },
  platforms: platformRefs(world),
});

export const platformRefOf = (
  world: DemoWorldTables,
  platform: PlatformId,
): PlatformRef | undefined => platformRefs(world).find((p) => p.id === platform);

export const isCompanyPlatform = (world: DemoWorldTables, platform: PlatformId): boolean =>
  world.platforms.some((p) => p.id === platform && p.companyId === world.company.id);

// ── Organizations ─────────────────────────────────────────────────────────────────────────────────────────────────

export const organizationsOf = (
  world: DemoWorldTables,
  platform: PlatformId,
): readonly OrganizationRecord[] => world.organizations.filter((o) => o.platformId === platform);

export const organizationOf = (
  world: DemoWorldTables,
  organization: OrganizationId,
): OrganizationRecord | undefined => world.organizations.find((o) => o.id === organization);

export const organizationsOfCompany = (world: DemoWorldTables): readonly OrganizationRecord[] =>
  world.organizations.filter((o) => isCompanyPlatform(world, o.platformId));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

/** Active memberships and pending requests by Organization, computed once per memberships table. */
const countCache = new WeakMap<
  readonly MembershipRecord[],
  ReadonlyMap<OrganizationId, { readonly active: number; readonly pending: number }>
>();

function membershipCounts(world: DemoWorldTables) {
  let counts = countCache.get(world.memberships);
  if (counts === undefined) {
    const map = new Map<OrganizationId, { active: number; pending: number }>();
    for (const m of world.memberships) {
      const entry = map.get(m.organizationId) ?? { active: 0, pending: 0 };
      if (m.status === 'active') entry.active += 1;
      else if (m.status === 'pending') entry.pending += 1;
      map.set(m.organizationId, entry);
    }
    countCache.set(world.memberships, (counts = map));
  }
  return counts;
}

/** An Organization's "memberships" figure: its ACTIVE memberships (one person may hold several across Organizations). */
export const activeMembershipCount = (world: DemoWorldTables, organization: OrganizationId) =>
  membershipCounts(world).get(organization)?.active ?? 0;

/** An Organization's "requests awaiting approval": its PENDING memberships. */
export const pendingRequestCount = (world: DemoWorldTables, organization: OrganizationId) =>
  membershipCounts(world).get(organization)?.pending ?? 0;

/** A sum of memberships, never a count of people: one person with two memberships counts twice (CF-11). */
export const membershipTotal = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
): number => sum(organizations.map((o) => activeMembershipCount(world, o.id)));

export const pendingRequestTotal = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
): number => sum(organizations.map((o) => pendingRequestCount(world, o.id)));

/** Newest first; ties broken by id, so the order is stable. */
export const newestFirst = (a: OrganizationRecord, b: OrganizationRecord): number =>
  b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);

/** Organizations created in the last `days` days before `now` (inclusive of `now - days`). */
export const createdWithin = (
  organizations: readonly OrganizationRecord[],
  now: number,
  days: number,
): readonly OrganizationRecord[] =>
  organizations.filter(
    (o) => Date.parse(o.createdAt) >= now - days * DAY_MS && Date.parse(o.createdAt) <= now,
  );

/**
 * Organization counts at the END (exclusive UTC midnight) of each given day before `now`'s UTC day: offset 0 is today
 * (counting everything created up to `now`). Calendar days are `YYYY-MM-DD` in UTC (docs/ARCHITECTURE.md §23).
 */
export function growthSeries(
  organizations: readonly OrganizationRecord[],
  now: number,
  dayOffsets: readonly number[],
): readonly { readonly day: string; readonly organizations: number }[] {
  const today = new Date(now);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return dayOffsets.map((offset) => {
    const dayStart = startOfToday - offset * DAY_MS;
    // A past day counts what existed before the next UTC midnight; today counts what exists now.
    const counted = (createdAt: number) =>
      offset === 0 ? createdAt <= now : createdAt < dayStart + DAY_MS;
    return {
      day: new Date(dayStart).toISOString().slice(0, 10),
      organizations: organizations.filter((o) => counted(Date.parse(o.createdAt))).length,
    };
  });
}

// ── Access: identities and Platform assignments ───────────────────────────────────────────────────────────────────

/** Whether an assignment grants authority now: Core's `active`, never a removed record of the history. */
export const isActiveAssignment = (assignment: PlatformAssignmentRecord): boolean =>
  assignment.revokedAt === null;

/** The assignments that grant authority now (the history keeps the removed ones too). */
export const activeAssignments = (world: DemoWorldTables): readonly PlatformAssignmentRecord[] =>
  world.assignments.filter(isActiveAssignment);

export const assignmentsOf = (world: DemoWorldTables, platform: PlatformId) =>
  activeAssignments(world).filter((a) => a.platformId === platform);

export const assignedPlatformsOf = (
  world: DemoWorldTables,
  operator: AdminIdentityId,
): readonly PlatformId[] =>
  activeAssignments(world)
    .filter((a) => a.operatorId === operator)
    .map((a) => a.platformId);

export const uniqueAssignedOperators = (world: DemoWorldTables): number =>
  new Set(activeAssignments(world).map((a) => a.operatorId)).size;

export const platformsWithOperators = (world: DemoWorldTables): number =>
  new Set(activeAssignments(world).map((a) => a.platformId)).size;

/** An operator's account, or `undefined` for an id that is not one of the Company's operators. */
export const operatorProfileOf = (
  world: DemoWorldTables,
  operator: AdminIdentityId,
): OperatorProfileRecord | undefined => world.operators.find((o) => o.id === operator);

/** An operator's whole assignment history, oldest first (Core orders by `assignedAt`), active and removed. */
export const assignmentHistoryOf = (
  world: DemoWorldTables,
  operator: AdminIdentityId,
): readonly PlatformAssignmentRecord[] =>
  world.assignments
    .filter((a) => a.operatorId === operator)
    .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt) || a.id.localeCompare(b.id));

/**
 * What Core's `/auth/grants` would answer for a business identity, from the records, live: the Company it owns, or the
 * Platforms it is assigned to. An identity the world does not know has no grants (a sign-in account that is not staff).
 */
export function grantsOf(world: DemoWorldTables, identity: AdminIdentityId | null): Grants {
  const record = identity === null ? undefined : world.identities.find((i) => i.id === identity);
  if (record?.kind === 'owner' && world.company.ownerId === record.id)
    return { companyId: world.company.id, platformAssignments: [] };
  if (record?.kind === 'operator')
    return { companyId: null, platformAssignments: assignedPlatformsOf(world, record.id) };
  return { companyId: null, platformAssignments: [] };
}

/**
 * How a business identity may reach a Platform, like Core: the owner reaches every Platform of their Company, an
 * operator only the Platforms assigned to them; anyone else (or another Company's Platform) not at all.
 */
export function platformViewerOf(
  world: DemoWorldTables,
  identity: AdminIdentityId | null,
  platform: PlatformId,
): 'owner' | 'operator' | null {
  const grants = grantsOf(world, identity);
  if (grants.companyId === world.company.id && isCompanyPlatform(world, platform)) return 'owner';
  // Core's live check (`platform-access.service.ts`): an operator needs an ACTIVE account AND an active assignment of
  // this Platform (`DENY_ACCOUNT_INACTIVE` otherwise). A blocked operator's kept assignments grant nothing (P6-S3).
  if (identity !== null && operatorProfileOf(world, identity)?.blocked === true) return null;
  if (grants.platformAssignments.includes(platform) && isCompanyPlatform(world, platform))
    return 'operator';
  return null;
}

// ── Commercial: subscriptions, payments, policies ─────────────────────────────────────────────────────────────────

export type SubscriptionState = 'active' | 'grace' | 'none';

/** The Organization's one subscription fact as recorded, or `null` when it never had one. Read only. */
export const subscriptionFactOf = (
  world: DemoWorldTables,
  organization: OrganizationId,
): OrganizationSubscriptionRecord | null =>
  world.subscriptions.find((s) => s.organizationId === organization) ?? null;

/**
 * Billing's effective entitlement of one subscription at `now`: `{ valid, expiresAt }`, the shape of Core's
 * `EffectiveEntitlement` (expiresAt as an ISO 8601 UTC instant).
 */
export interface EntitlementWindow {
  readonly valid: boolean;
  /** The exclusive end of access while valid (the grace end, or an earlier termination); `null` when not valid. */
  readonly expiresAt: string | null;
}

const NOT_ENTITLED: EntitlementWindow = { valid: false, expiresAt: null };

const instant = (value: string, field: string): number => {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) throw new Error(`subscription ${field} is not a valid instant`);
  return ms;
};

/**
 * Port of Core's pure `deriveEntitlement` (nawara-core `f62b96b`, identical at `8d89bed`: billing-service
 * `src/domain/entitlement.ts`), over the record's timestamps only, never its stored status:
 * - no record, or `pending`: not valid (no period ever existed);
 * - the boundary is `graceUntil` (else `currentPeriodEnd`), shortened by `effectiveTerminationAt` when set;
 * - valid while `currentPeriodStart <= now < boundary` (start inclusive, boundary exclusive);
 * - `cancelAtPeriodEnd` is not an input: it never shortens access already paid for.
 * A record that breaks Core's database invariants throws, as Core's does: it can only be a fixture bug.
 *
 * This answers access at `now` from the record as it stands. It models NO renewal, period extension or anchor (Core
 * moves a period only with a verified settlement; known Core risk CFU-1 concerns early renewal and is not reproduced).
 */
export function entitlementWindowOf(
  subscription: OrganizationSubscriptionRecord | null,
  now: number,
): EntitlementWindow {
  if (subscription === null || subscription.status === 'pending') return NOT_ENTITLED;
  const { currentPeriodStart, currentPeriodEnd, graceUntil, effectiveTerminationAt } = subscription;
  if (currentPeriodStart === null || currentPeriodEnd === null)
    throw new Error(`a '${subscription.status}' subscription must have a period`);
  const start = instant(currentPeriodStart, 'currentPeriodStart');
  const end = instant(currentPeriodEnd, 'currentPeriodEnd');
  if (end <= start) throw new Error('currentPeriodEnd must be after currentPeriodStart');
  let boundary = end;
  if (graceUntil !== null) {
    const grace = instant(graceUntil, 'graceUntil');
    if (grace <= end) throw new Error('graceUntil must be after currentPeriodEnd');
    boundary = grace;
  }
  if (effectiveTerminationAt !== null) {
    const termination = instant(effectiveTerminationAt, 'effectiveTerminationAt');
    if (termination > boundary)
      throw new Error('effectiveTerminationAt cannot extend access past the period/grace boundary');
    boundary = termination;
  }
  if (now < start || now >= boundary) return NOT_ENTITLED;
  return { valid: true, expiresAt: new Date(boundary).toISOString() };
}

/**
 * When the Organization's paid access ends: its period end, or an earlier effective termination (UTC instant); `null`
 * when it never had a subscription or it is `pending`. An expired record keeps its last period, so this stays a past
 * instant rather than becoming `null`; consumers read it only for an `active` or `grace` view state.
 */
export function subscriptionEndOf(
  world: DemoWorldTables,
  organization: OrganizationId,
): string | null {
  const subscription = subscriptionFactOf(world, organization);
  if (subscription === null || subscription.currentPeriodEnd === null) return null;
  const { currentPeriodEnd, effectiveTerminationAt } = subscription;
  return effectiveTerminationAt !== null &&
    Date.parse(effectiveTerminationAt) < Date.parse(currentPeriodEnd)
    ? effectiveTerminationAt
    : currentPeriodEnd;
}

/**
 * Admin's VIEW state (never Core's stored status), from the entitlement window: `active` while entitled before the period
 * ends, `grace` while entitled after it (with when that access ends), otherwise `none`. `none` is a view value only: a
 * pending, not-yet-started, expired or terminated record is still a record (`subscriptionFactOf`).
 */
export function subscriptionStateOf(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
): { readonly state: SubscriptionState; readonly graceEndsAt?: string } {
  const subscription = subscriptionFactOf(world, organization);
  const window = entitlementWindowOf(subscription, now);
  if (
    !window.valid ||
    window.expiresAt === null ||
    subscription === null ||
    subscription.currentPeriodEnd === null
  )
    return { state: 'none' };
  return now < Date.parse(subscription.currentPeriodEnd)
    ? { state: 'active' }
    : { state: 'grace', graceEndsAt: window.expiresAt };
}

/**
 * The lifecycle of an Organization's subscription at `now`, for presentation (WP-4.1). Built ONLY on `subscriptionFactOf` and
 * `entitlementWindowOf` (WP-3.1): the stored status is reported beside it, never trusted for access.
 * - `none`: no record; `pending`: a record whose first period never started (never entitled);
 * - `active`: entitled before the period ends; `grace`: entitled after it, until the grace ends (the same split as
 *   `subscriptionStateOf`);
 * - `notStarted`: a non-pending record whose period starts after `now` (not entitled yet);
 * - `terminated`: an effective termination at or before `now` ended access; `expired`: the entitlement window ended.
 * `cancelAtPeriodEnd` is a CONDITION, not a state: access continues until the period, then the grace, ends. A future
 * termination is reported as `accessEndsAt`. No renewal, period extension or payment is ever inferred (CFU-1 not reproduced).
 */
/** The stored status a record in each lifecycle state would carry if Billing were current. */
const STORED_STATUS_OF: Readonly<
  Record<SubscriptionLifecycleState, SubscriptionStatusFact | null>
> = {
  none: null,
  pending: 'pending',
  notStarted: 'active',
  active: 'active',
  grace: 'grace',
  expired: 'expired',
  terminated: 'expired',
};

export function subscriptionLifecycleOf(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
): SubscriptionLifecycle {
  const fact = subscriptionFactOf(world, organization);
  const window = entitlementWindowOf(fact, now);
  const state = lifecycleStateOf(fact, window, now);
  return {
    state,
    storedStatus: fact?.status ?? null,
    storedStatusLags: (fact?.status ?? null) !== STORED_STATUS_OF[state],
    currentPeriodStart: fact?.currentPeriodStart ?? null,
    currentPeriodEnd: fact?.currentPeriodEnd ?? null,
    graceUntil: fact?.graceUntil ?? null,
    cancelAtPeriodEnd: fact?.cancelAtPeriodEnd ?? false,
    effectiveTerminationAt: fact?.effectiveTerminationAt ?? null,
    accessEndsAt: window.valid ? window.expiresAt : null,
  };
}

function lifecycleStateOf(
  fact: OrganizationSubscriptionRecord | null,
  window: EntitlementWindow,
  now: number,
): SubscriptionLifecycleState {
  if (fact === null) return 'none';
  if (
    fact.status === 'pending' ||
    fact.currentPeriodStart === null ||
    fact.currentPeriodEnd === null
  )
    return 'pending';
  if (window.valid) return now < Date.parse(fact.currentPeriodEnd) ? 'active' : 'grace';
  if (now < Date.parse(fact.currentPeriodStart)) return 'notStarted';
  if (fact.effectiveTerminationAt !== null && Date.parse(fact.effectiveTerminationAt) <= now)
    return 'terminated';
  return 'expired';
}

/**
 * Whether the Organization's subscription is active and its period ends within `days` days after `now`. A terminated
 * record (its end is a termination, not a period running out) and an expired one are never "ending soon".
 */
export function subscriptionEndsWithin(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
  days: number,
): boolean {
  const subscription = subscriptionFactOf(world, organization);
  if (subscription === null || subscription.currentPeriodEnd === null) return false;
  if (subscription.effectiveTerminationAt !== null) return false;
  if (subscriptionStateOf(world, organization, now).state !== 'active') return false;
  const ends = Date.parse(subscription.currentPeriodEnd);
  return ends > now && ends <= now + days * DAY_MS;
}

/** Active subscriptions that end within `days` days after `now`. */
export const subscriptionsEndingWithin = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
  now: number,
  days: number,
): number => organizations.filter((o) => subscriptionEndsWithin(world, o.id, now, days)).length;

/**
 * Whether an Organization is entitled now, kept apart from its subscription state: an active subscription entitles it; a
 * subscription in its 24-hour grace still entitles it, temporarily (the Core V2 policy above); none does not. Never
 * derived from memberships: a member of an Organization without a subscription is still a member.
 */
export type EntitlementState = 'entitled' | 'entitledInGrace' | 'notEntitled';

export function entitlementOf(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
): EntitlementState {
  const { state } = subscriptionStateOf(world, organization, now);
  return state === 'active' ? 'entitled' : state === 'grace' ? 'entitledInGrace' : 'notEntitled';
}

/**
 * How these Organizations' subscriptions are distributed at `now`. `active + grace + none` is always `organizations`
 * (one subscription per Organization at most); `entitled` is `active + grace` (a separate fact, never added to them);
 * `endingSoon` counts active subscriptions ending within `endingWithinDays` (a subset of `active`).
 */
export interface SubscriptionDistribution {
  readonly organizations: number;
  readonly active: number;
  readonly grace: number;
  readonly none: number;
  readonly endingSoon: number;
  readonly entitled: number;
}

export function subscriptionDistribution(
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
  now: number,
  endingWithinDays: number,
): SubscriptionDistribution {
  const states = organizations.map((o) => subscriptionStateOf(world, o.id, now).state);
  const count = (state: SubscriptionState) => states.filter((s) => s === state).length;
  const active = count('active');
  const grace = count('grace');
  return {
    organizations: organizations.length,
    active,
    grace,
    none: count('none'),
    endingSoon: subscriptionsEndingWithin(world, organizations, now, endingWithinDays),
    entitled: active + grace,
  };
}

const ofOrganizations = <T extends { readonly organizationId: OrganizationId }>(
  records: readonly T[],
  organizations: readonly OrganizationRecord[],
): readonly T[] => {
  const ids = new Set(organizations.map((o) => o.id));
  return records.filter((r) => ids.has(r.organizationId));
};

/** Core's derived invitation status (auth-service `invitation.service.ts` `list`): consumed, revoked, expired, active. */
export type AdminInvitationStatus = 'active' | 'consumed' | 'revoked' | 'expired';

export function invitationStatusOf(
  invitation: AdminInvitationRecord,
  now: number,
): AdminInvitationStatus {
  if (invitation.consumedAt !== null) return 'consumed';
  if (invitation.revokedAt !== null) return 'revoked';
  if (Date.parse(invitation.expiresAt) <= now) return 'expired';
  return 'active';
}

/** The ACTIVE invitations of these Organizations at `now`: the ones "awaiting acceptance" in every count. */
export const activeAdminInvitationsOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
  now: number,
) =>
  ofOrganizations(world.adminInvitations, organizations).filter(
    (i) => invitationStatusOf(i, now) === 'active',
  );

// ── Billing and Payment facts (WP-3.2) ─────────────────────────────────────────────────────────────────────────────
// Pure readings of the demo world's fact tables (records.ts; nawara-core `8d89bed`). Each layer stays its own: a request's
// status never states an attempt's, an attempt's never states a payment fact, and only a verified provider fact (a demo
// fixture here) states that money moved. Nothing here mutates the world.

/** The invoices of these Organizations (an invoice's Organization context, `billing 0003:16`). */
export const invoicesOf = (world: DemoWorldTables, organizations: readonly OrganizationRecord[]) =>
  ofOrganizations(world.invoices, organizations);

/** A payment request with its invoice's Organization: the scope it is read in. */
export interface ScopedPaymentRequest extends PaymentRequestRecord {
  readonly organizationId: OrganizationId;
}

/** The payment requests of these Organizations, through their invoices, in record order. */
export function paymentRequestsOf(
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
): readonly ScopedPaymentRequest[] {
  const invoices = new Map(invoicesOf(world, organizations).map((i) => [i.id, i]));
  return world.paymentRequests.flatMap((request) => {
    const invoice = invoices.get(request.invoiceId);
    return invoice ? [{ ...request, organizationId: invoice.organizationId }] : [];
  });
}

/** Payment's payments for one request (normally one; `payment."paymentRequestId"`). */
export const paymentsOfRequest = (world: DemoWorldTables, requestId: string) =>
  world.payments.filter((p) => p.paymentRequestId === requestId);

/** Every attempt of a request's payments, by payment then attempt number: several may exist, none erases another. */
export function attemptsOfRequest(
  world: DemoWorldTables,
  requestId: string,
): readonly PaymentAttemptRecord[] {
  const payments = paymentsOfRequest(world, requestId).map((p) => p.id);
  return world.paymentAttempts
    .filter((a) => payments.includes(a.paymentId))
    .sort(
      (a, b) =>
        payments.indexOf(a.paymentId) - payments.indexOf(b.paymentId) ||
        a.attemptNumber - b.attemptNumber,
    );
}

/**
 * What the provider reported about a request, kept in two separate lists: OBSERVATIONS (webhooks matched to its attempts;
 * received, not verified) and VERIFIED facts (provider transaction facts bound to its payments; demo fixtures here).
 */
export interface ProviderEvidence {
  readonly observations: readonly ProviderObservationRecord[];
  readonly verifiedFacts: readonly ProviderFactRecord[];
}

export function providerEvidenceOf(world: DemoWorldTables, requestId: string): ProviderEvidence {
  const attempts = new Set(attemptsOfRequest(world, requestId).map((a) => a.id));
  const payments = new Set(paymentsOfRequest(world, requestId).map((p) => p.id));
  return {
    observations: world.providerObservations.filter(
      (o) => o.matchedAttemptId !== null && attempts.has(o.matchedAttemptId),
    ),
    verifiedFacts: world.providerFacts.filter((f) => payments.has(f.paymentId)),
  };
}

/**
 * Whether money was collected for a request, as far as the facts go. `captureVerified`: a verified `capture` fact exists (a
 * demo fixture). `unknown` otherwise, WHATEVER the request, payment or attempt status says: a failed request, a failed or
 * unknown attempt and a received webhook prove neither collection nor its absence. There is no "not collected" value.
 */
export type CollectionEvidence =
  | {
      readonly kind: 'captureVerified';
      readonly factIds: readonly string[];
      readonly demoFixture: true;
    }
  | { readonly kind: 'unknown' };

export function collectionEvidenceOf(
  world: DemoWorldTables,
  requestId: string,
): CollectionEvidence {
  const captures = providerEvidenceOf(world, requestId).verifiedFacts.filter(
    (f) => f.kind === 'capture',
  );
  return captures.length === 0
    ? { kind: 'unknown' }
    : { kind: 'captureVerified', factIds: captures.map((f) => f.id), demoFixture: true };
}

/**
 * A request's refund side, kept apart: Billing's refund CASES (requests to refund, with their own state) and VERIFIED `refund`
 * facts. A case, open or completed, is never read as money returned; only a `refund` fact is evidence of one.
 */
export interface RefundEvidence {
  readonly cases: readonly RefundCaseRecord[];
  readonly verifiedRefundFactIds: readonly string[];
}

export function refundEvidenceOf(world: DemoWorldTables, requestId: string): RefundEvidence {
  return {
    cases: world.refundCases.filter((c) => c.paymentRequestId === requestId),
    verifiedRefundFactIds: providerEvidenceOf(world, requestId)
      .verifiedFacts.filter((f) => f.kind === 'refund')
      .map((f) => f.id),
  };
}

/**
 * A payment follow-up (P7-S3; WP-1.2 copy): a request Billing marks `failed`, or one `requested` and awaiting its payer. A
 * classification of the REQUEST, never a financial outcome (see `collectionEvidenceOf`). Every other request status makes no
 * follow-up. `id` is the request's.
 */
export interface PaymentIssue {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly kind: 'failed' | 'awaiting_action';
}

const FOLLOW_UP_KIND: Partial<Record<PaymentRequestStatus, PaymentIssue['kind']>> = {
  failed: 'failed',
  requested: 'awaiting_action',
};

/** The payment follow-ups of these Organizations, derived from their payment requests (WP-3.2; no stored issue). */
export const paymentIssuesOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
): readonly PaymentIssue[] =>
  paymentRequestsOf(world, organizations).flatMap((request) => {
    const kind = FOLLOW_UP_KIND[request.status];
    return kind ? [{ id: request.id, organizationId: request.organizationId, kind }] : [];
  });

// ── Financial cases (WP-4.2) ──────────────────────────────────────────────────────────────────────────────────────
// Pure readings of the case tables (records.ts; nawara-core `8d89bed`). Each fact keeps its own layer: a dispute is not a
// chargeback, a chargeback is not a recovery, a late success does not rewrite its request, a refund case or attempt is not a
// refund, a refund fact is not an allocation or a completion, and a reconciliation case is never a permission to resolve it.

/** The reconciliation cases of these Organizations (a case's Organization context, `billing 0042:316`), in record order. */
export const reconciliationCasesOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
) => {
  const ids = new Set(organizations.map((o) => o.id));
  return world.reconciliationCases.filter(
    (c) => c.organizationId !== null && ids.has(c.organizationId),
  );
};

/**
 * The reconciliation cases visible under one Platform of the Company: the case's own Platform, never inferred from a
 * payment. A case of another Company's Platform is never returned.
 */
export const reconciliationCasesOfPlatform = (world: DemoWorldTables, platform: PlatformId) =>
  isCompanyPlatform(world, platform)
    ? world.reconciliationCases.filter((c) => c.platformId === platform)
    : [];

/** A case's lifecycle: `open` until a resolution is recorded. Admin offers no resolution (never an action). */
export interface ReconciliationCaseView {
  readonly case: ReconciliationCaseRecord;
  readonly state: 'open' | 'resolved';
  /** Who may resolve it is Core's, per type: Admin states none and offers none. */
  readonly resolutionInAdmin: 'notOffered';
}

export const reconciliationCaseViewOf = (
  record: ReconciliationCaseRecord,
): ReconciliationCaseView => ({
  case: record,
  state: record.resolutionKind === null ? 'open' : 'resolved',
  resolutionInAdmin: 'notOffered',
});

/**
 * A payment request's disputes, each with its chargeback as a SEPARATE fact: `verifiedChargeback` only when a `chargeback`
 * provider fact is linked (a dispute alone, open, won or lost, is not one). Nothing here states a refund or a recovery.
 */
export interface DisputeEvidence {
  readonly dispute: PaymentDisputeRecord;
  readonly chargeback:
    { readonly kind: 'verifiedChargeback'; readonly factId: string } | { readonly kind: 'none' };
}

export function disputesOfRequest(
  world: DemoWorldTables,
  requestId: string,
): readonly DisputeEvidence[] {
  const payments = new Set(paymentsOfRequest(world, requestId).map((p) => p.id));
  return world.paymentDisputes
    .filter((d) => payments.has(d.paymentId))
    .map((dispute) => {
      const fact =
        dispute.chargebackFactId === null
          ? undefined
          : world.providerFacts.find(
              (f) => f.id === dispute.chargebackFactId && f.kind === 'chargeback',
            );
      return {
        dispute,
        chargeback: fact ? { kind: 'verifiedChargeback', factId: fact.id } : { kind: 'none' },
      };
    });
}

/**
 * A request's late successes, kept apart from its history: the request, payment and attempt statuses stay as recorded; the
 * late capture is verified only when its fact exists. `collectionEvidenceOf` already counts that fact as a capture.
 */
export interface LateSuccessEvidence {
  readonly lateSuccess: LateSuccessRecord;
  readonly requestStatus: PaymentRequestStatus | null;
  readonly verifiedCaptureFactId: string | null;
}

export function lateSuccessesOfRequest(
  world: DemoWorldTables,
  requestId: string,
): readonly LateSuccessEvidence[] {
  const request = world.paymentRequests.find((r) => r.id === requestId);
  return world.lateSuccesses
    .filter((l) => l.paymentRequestId === requestId)
    .map((lateSuccess) => ({
      lateSuccess,
      requestStatus: request?.status ?? null,
      verifiedCaptureFactId:
        lateSuccess.factId !== null &&
        world.providerFacts.some((f) => f.id === lateSuccess.factId && f.kind === 'capture')
          ? lateSuccess.factId
          : null,
    }));
}

/**
 * One refund case, every layer apart: the CASE (Billing's request to refund, with its own state), Payment's refund ATTEMPTS
 * (processing states), and VERIFIED `refund` facts for its payment. A verified fact is neither an allocation (not
 * represented: DO-73) nor a completion; `caseCompleted` is only Billing's case state.
 */
export interface RefundCaseEvidence {
  readonly refundCase: RefundCaseRecord;
  readonly attempts: readonly RefundAttemptRecord[];
  readonly verifiedRefundFactIds: readonly string[];
  readonly allocation: 'notRepresented';
  readonly caseCompleted: boolean;
}

export function refundCaseEvidenceOf(
  world: DemoWorldTables,
  refundCaseId: string,
): RefundCaseEvidence | null {
  const refundCase = world.refundCases.find((c) => c.id === refundCaseId);
  if (!refundCase) return null;
  return {
    refundCase,
    attempts: world.refundAttempts.filter((a) => a.refundCaseId === refundCaseId),
    verifiedRefundFactIds: world.providerFacts
      .filter((f) => f.kind === 'refund' && f.paymentId === refundCase.paymentId)
      .map((f) => f.id),
    allocation: 'notRepresented',
    caseCompleted: refundCase.status === 'completed',
  };
}

/**
 * A payment-request reference held elsewhere (e.g. an Assistance record), resolved against the shared facts only: `linked`
 * when the request exists, with its Organization; otherwise `notInSharedFacts` (never a guessed match).
 */
export type PaymentRequestReference =
  | { readonly kind: 'linked'; readonly request: ScopedPaymentRequest }
  | { readonly kind: 'notInSharedFacts'; readonly paymentRequestId: string };

export function paymentRequestReferenceOf(
  world: DemoWorldTables,
  paymentRequestId: string,
): PaymentRequestReference {
  const request = paymentRequestsOf(world, world.organizations).find(
    (r) => r.id === paymentRequestId,
  );
  return request ? { kind: 'linked', request } : { kind: 'notInSharedFacts', paymentRequestId };
}

/**
 * What still needs attention in these Organizations, as counts of unresolved records only: open reconciliation cases, open
 * payment disputes, refund cases not completed. A count is never a financial conclusion (nothing is "lost", "owed" or
 * "refunded" here), and Admin offers no action on any of them.
 */
export interface FinancialAttention {
  readonly openReconciliationCases: number;
  readonly openPaymentDisputes: number;
  readonly openRefundCases: number;
}

export function financialAttentionOf(
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
): FinancialAttention {
  const requests = paymentRequestsOf(world, organizations);
  const payments = new Set(
    requests.flatMap((r) => paymentsOfRequest(world, r.id).map((p) => p.id)),
  );
  const requestIds = new Set(requests.map((r) => r.id));
  return {
    openReconciliationCases: reconciliationCasesOf(world, organizations).filter(
      (c) => c.resolutionKind === null,
    ).length,
    openPaymentDisputes: world.paymentDisputes.filter(
      (d) => d.status === 'open' && payments.has(d.paymentId),
    ).length,
    openRefundCases: world.refundCases.filter(
      (c) => c.status === 'open' && requestIds.has(c.paymentRequestId),
    ).length,
  };
}

export const platformCommercialOf = (world: DemoWorldTables, platform: PlatformId) =>
  world.platformCommercial.find((c) => c.platformId === platform);

/**
 * LEGACY DEMO FLAG, never eligibility (A31-04 / X34, WP-2.2): the demo world's invented "policy" (the Platform's flag,
 * unless the Organization is set to `disabled`). Core has no such policy; it decides each assistance request from its
 * own facts (BIL-13). No read model shows this value; it remains only so the demo assistance seed can be checked
 * against the demo world. `null`: the Platform has no commercial record.
 */
export function assistedPaymentsOf(
  world: DemoWorldTables,
  organization: OrganizationRecord,
): {
  readonly effective: 'enabled' | 'disabled';
  readonly platform: 'enabled' | 'disabled';
  readonly organization: 'inherit' | 'disabled';
} | null {
  const platform = platformCommercialOf(world, organization.platformId)?.assistedPayments;
  if (platform === undefined) return null;
  const effective =
    platform === 'enabled' && organization.assistedPayments === 'inherit' ? 'enabled' : 'disabled';
  return { effective, platform, organization: organization.assistedPayments };
}

// ── Activity ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Newest first; ties broken by id, so the order is stable. */
const newestEventFirst = (a: ActivityRecord, b: ActivityRecord): number =>
  b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id);

/** Whether an event belongs to a Platform (every event but the Company-level operator account ones, P6-S3). */
export const isPlatformActivity = (e: ActivityRecord): e is PlatformActivityRecord =>
  e.platformId !== null;

export const activityOf = (
  world: DemoWorldTables,
  platform: PlatformId,
): readonly PlatformActivityRecord[] =>
  world.activity
    .filter(isPlatformActivity)
    .filter((e) => e.platformId === platform)
    .sort(newestEventFirst);

/** The Company's activity: every Platform's events and the Company-level ones (P6-S3), in one order. */
export const companyActivity = (world: DemoWorldTables): readonly ActivityRecord[] =>
  world.activity
    .filter((e) => !isPlatformActivity(e) || isCompanyPlatform(world, e.platformId))
    .sort(newestEventFirst);

/** One Organization's events, newest first (ties by id). */
export const activityOfOrganization = (
  world: DemoWorldTables,
  organization: OrganizationId,
): readonly PlatformActivityRecord[] =>
  world.activity
    .filter(isPlatformActivity)
    .filter((e) => e.organizationId === organization)
    .sort(newestEventFirst);

export const organizationNameOf = (
  world: DemoWorldTables,
  organization: OrganizationId | null,
): string | null =>
  organization === null
    ? null
    : (world.organizations.find((o) => o.id === organization)?.name ?? null);
