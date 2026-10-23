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
  DemoWorldTables,
  OrganizationRecord,
  OrganizationSubscriptionRecord,
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

export const organizationsOfCompany = (world: DemoWorldTables): readonly OrganizationRecord[] =>
  world.organizations.filter((o) => isCompanyPlatform(world, o.platformId));

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export const membershipTotal = (organizations: readonly OrganizationRecord[]): number =>
  sum(organizations.map((o) => o.memberships));

export const pendingRequestTotal = (organizations: readonly OrganizationRecord[]): number =>
  sum(organizations.map((o) => o.pendingRequests));

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

export const assignmentsOf = (world: DemoWorldTables, platform: PlatformId) =>
  world.assignments.filter((a) => a.platformId === platform);

export const assignedPlatformsOf = (
  world: DemoWorldTables,
  operator: AdminIdentityId,
): readonly PlatformId[] =>
  world.assignments.filter((a) => a.operatorId === operator).map((a) => a.platformId);

export const uniqueAssignedOperators = (world: DemoWorldTables): number =>
  new Set(world.assignments.map((a) => a.operatorId)).size;

export const platformsWithOperators = (world: DemoWorldTables): number =>
  new Set(world.assignments.map((a) => a.platformId)).size;

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

const ofOrganizations = <T extends { readonly organizationId: OrganizationId }>(
  records: readonly T[],
  organizations: readonly OrganizationRecord[],
): readonly T[] => {
  const ids = new Set(organizations.map((o) => o.id));
  return records.filter((r) => ids.has(r.organizationId));
};

export const adminInvitationsOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
) => ofOrganizations(world.adminInvitations, organizations);

export const paymentIssuesOf = (
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
) => ofOrganizations(world.paymentIssues, organizations);

export const platformCommercialOf = (world: DemoWorldTables, platform: PlatformId) =>
  world.platformCommercial.find((c) => c.platformId === platform);

// ── Activity ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** Newest first; ties broken by id, so the order is stable. */
const newestEventFirst = (a: ActivityRecord, b: ActivityRecord): number =>
  b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id);

export const activityOf = (
  world: DemoWorldTables,
  platform: PlatformId,
): readonly ActivityRecord[] =>
  world.activity.filter((e) => e.platformId === platform).sort(newestEventFirst);

/** The Company's activity: every Platform's events, in one order. */
export const companyActivity = (world: DemoWorldTables): readonly ActivityRecord[] =>
  world.activity.filter((e) => isCompanyPlatform(world, e.platformId)).sort(newestEventFirst);

export const organizationNameOf = (
  world: DemoWorldTables,
  organization: OrganizationId | null,
): string | null =>
  organization === null
    ? null
    : (world.organizations.find((o) => o.id === organization)?.name ?? null);
