import { OrganizationId } from '../../../core/context/scope.model';

/**
 * An Organization's memberships as Core lists them (auth-service `GET /auth/organizations/:organizationId/memberships
 * ?status=…`, source-verified in P5-S0; docs/design/p5-users-and-memberships.md). Per Organization only; one status per
 * request; no pagination, search or sort; oldest request first. There is no single-membership read: details are
 * resolved from these lists. Everything here is pure.
 */

/** The statuses Core can list (`ListMembershipsQuery`). `revoked` exists but is not listable, so it never appears. */
export const LISTABLE_STATUSES = ['active', 'pending', 'rejected'] as const;
export type ListableMembershipStatus = (typeof LISTABLE_STATUSES)[number];

/** One row of Core's list, exactly its fields. A person has no name in Core: never invent one. */
export interface Membership {
  readonly id: string;
  readonly userId: string;
  readonly status: ListableMembershipStatus;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly requestedAt: string;
  readonly approvedAt: string | null;
  readonly rejectedAt: string | null;
  /** The organization-admin privilege of THIS membership (never implied by membership). */
  readonly isOrganizationAdmin: boolean;
  readonly email: string | null;
  readonly phone: string | null;
  /** Opaque, platform-defined label: shown as is, never translated. */
  readonly audience: string;
  readonly contactVerified: boolean;
}

export interface MembershipList {
  readonly organizationId: OrganizationId;
  readonly status: ListableMembershipStatus;
  /** Oldest request first, as Core answers. */
  readonly memberships: readonly Membership[];
}

/** The three lists of one Organization, loaded together so each tab has its count. */
export type MembershipLists = Readonly<Record<ListableMembershipStatus, readonly Membership[]>>;

/** How a member is identified on screen (owner decision D3): email, else phone, else a short neutral user reference. */
export type MemberIdentity =
  | { readonly kind: 'email'; readonly value: string }
  | { readonly kind: 'phone'; readonly value: string }
  | { readonly kind: 'user'; readonly value: string };

export function memberIdentity(membership: Membership): MemberIdentity {
  if (membership.email) return { kind: 'email', value: membership.email };
  if (membership.phone) return { kind: 'phone', value: membership.phone };
  return { kind: 'user', value: membership.userId.slice(-8) };
}

/** The decision instant of a membership in its status (active: approved; rejected: rejected), if any. */
export const decidedAt = (m: Membership): string | null =>
  m.status === 'active' ? m.approvedAt : m.status === 'rejected' ? m.rejectedAt : null;

/** Client-side sort of the loaded list; never sent to Core (it has none). */
export const MEMBER_SORTS = ['newest', 'oldest', 'identity'] as const;
export type MemberSort = (typeof MEMBER_SORTS)[number];

/**
 * What the URL holds: the tab, the admins filter and the sort. The search text is NOT in the URL: it may contain an
 * email or a phone, and contacts never go into URLs.
 */
export interface MembersQuery {
  readonly status: ListableMembershipStatus;
  readonly admins: boolean;
  readonly sort: MemberSort;
}

export const DEFAULT_MEMBERS_QUERY: MembersQuery = {
  status: 'active',
  admins: false,
  sort: 'newest',
};

const pick = <T extends string>(values: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

export function parseMembersQuery(params: Readonly<Record<string, unknown>>): MembersQuery {
  return {
    status: pick(LISTABLE_STATUSES, params['status'], DEFAULT_MEMBERS_QUERY.status),
    admins: params['admins'] === '1',
    sort: pick(MEMBER_SORTS, params['sort'], DEFAULT_MEMBERS_QUERY.sort),
  };
}

/** Only non-default values, so a plain URL stays plain. */
export function toMembersQueryParams(query: MembersQuery): Record<string, string> {
  const params: Record<string, string> = {};
  if (query.status !== DEFAULT_MEMBERS_QUERY.status) params['status'] = query.status;
  if (query.admins) params['admins'] = '1';
  if (query.sort !== DEFAULT_MEMBERS_QUERY.sort) params['sort'] = query.sort;
  return params;
}

/**
 * The rows of one tab: the admins filter (meaningful only for active memberships: the privilege exists only while
 * active), the search over the identity and the audience (case- and accent-insensitive), then the sort.
 */
export function applyMembersQuery(
  rows: readonly Membership[],
  query: MembersQuery,
  search: string,
  collator: Intl.Collator,
): readonly Membership[] {
  const needle = fold(search.trim());
  const filtered = rows.filter(
    (m) =>
      (!query.admins || query.status !== 'active' || m.isOrganizationAdmin) &&
      (needle === '' ||
        fold(memberIdentity(m).value).includes(needle) ||
        fold(m.audience).includes(needle)),
  );
  const at = (m: Membership) => Date.parse(m.requestedAt);
  const sorted = [...filtered];
  if (query.sort === 'oldest') sorted.sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
  else if (query.sort === 'newest')
    sorted.sort((a, b) => at(b) - at(a) || a.id.localeCompare(b.id));
  else
    sorted.sort(
      (a, b) =>
        collator.compare(memberIdentity(a).value, memberIdentity(b).value) ||
        a.id.localeCompare(b.id),
    );
  return sorted;
}

const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
