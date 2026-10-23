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

/** An active Platform assignment of an operator (Auth's `platform_assignment`). */
export interface PlatformAssignmentRecord {
  readonly operatorId: AdminIdentityId;
  readonly platformId: PlatformId;
}

/**
 * The one subscription of an Organization (Billing), by when it ends. Its state follows from the clock: active until
 * `endsAt`, then 24 hours of grace, then ended. An Organization without a record has no subscription.
 */
export interface OrganizationSubscriptionRecord {
  readonly organizationId: OrganizationId;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly endsAt: string;
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

/** A payment that failed or awaits action (Payment), for an Organization. */
export interface PaymentIssueRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly kind: 'failed' | 'awaiting_action';
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

/** An administrative event on a Platform (the source of every activity feed). */
export interface ActivityRecord {
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
    | 'operator.assigned';
  /** UTC instant, ISO 8601 with `Z`. */
  readonly occurredAt: string;
}

/** Unread notifications of an administrative identity (a declared count: no inbox records yet, CF-14). */
export interface NotificationInboxRecord {
  readonly identityId: AdminIdentityId;
  readonly unread: number;
}

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
  readonly assignments: readonly PlatformAssignmentRecord[];
  readonly subscriptions: readonly OrganizationSubscriptionRecord[];
  readonly adminInvitations: readonly AdminInvitationRecord[];
  /** Member identities and their Organization memberships (P5-S1). */
  readonly members: readonly MemberIdentityRecord[];
  readonly memberships: readonly MembershipRecord[];
  readonly paymentIssues: readonly PaymentIssueRecord[];
  readonly platformCommercial: readonly PlatformCommercialRecord[];
  readonly activity: readonly ActivityRecord[];
  readonly inboxes: readonly NotificationInboxRecord[];
  /** Records created at run time so far: their ids are numbered from it, so they are stable and never reuse a seed id. */
  readonly sequence: number;
  readonly idempotency: readonly IdempotencyRecord[];
}
