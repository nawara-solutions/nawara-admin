import { Grants } from '../../core/auth/auth.model';
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
  PlatformActivityRecord,
  PlatformAssignmentRecord,
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

export const unreadOf = (world: DemoWorldTables, identity: AdminIdentityId | null): number =>
  world.inboxes.find((i) => i.identityId === identity)?.unread ?? 0;

// ── Commercial: subscriptions, payments, policies ─────────────────────────────────────────────────────────────────

export type SubscriptionState = 'active' | 'grace' | 'none';

const subscriptionOf = (
  world: DemoWorldTables,
  organization: OrganizationId,
): OrganizationSubscriptionRecord | undefined =>
  world.subscriptions.find((s) => s.organizationId === organization);

/** When the Organization's one subscription ends (UTC instant), or `null` when it has none. */
export const subscriptionEndOf = (
  world: DemoWorldTables,
  organization: OrganizationId,
): string | null => subscriptionOf(world, organization)?.endsAt ?? null;

/** Active until it ends, then in grace for 24 hours, then no subscription. No record: no subscription. */
export function subscriptionStateOf(
  world: DemoWorldTables,
  organization: OrganizationId,
  now: number,
): { readonly state: SubscriptionState; readonly graceEndsAt?: string } {
  const subscription = subscriptionOf(world, organization);
  if (!subscription) return { state: 'none' };
  const ends = Date.parse(subscription.endsAt);
  if (ends > now) return { state: 'active' };
  const graceEnds = ends + SUBSCRIPTION_GRACE_HOURS * HOUR_MS;
  return graceEnds > now
    ? { state: 'grace', graceEndsAt: new Date(graceEnds).toISOString() }
    : { state: 'none' };
}

/** Active subscriptions that end within `days` days after `now`. */
export const subscriptionsEndingWithin = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
  now: number,
  days: number,
): number =>
  organizations.filter((o) => {
    const subscription = subscriptionOf(world, o.id);
    if (!subscription) return false;
    const ends = Date.parse(subscription.endsAt);
    return ends > now && ends <= now + days * DAY_MS;
  }).length;

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

export const paymentIssuesOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
) => ofOrganizations(world.paymentIssues, organizations);

export const platformCommercialOf = (world: DemoWorldTables, platform: PlatformId) =>
  world.platformCommercial.find((c) => c.platformId === platform);

/**
 * The assisted-payments policy that applies to an Organization: the Platform's setting, unless the Organization is set
 * to `disabled` (an override can only turn it off; a disabled Platform cannot be enabled below). `null`: the Platform
 * has no commercial record.
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
