import { AppError } from '../../../core/errors/app-error';
import { OrganizationId } from '../../../core/context/scope.model';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, DemoWorldTables, MembershipRecord } from '../records';
import { organizationOf, platformViewerOf } from '../selectors';

/**
 * Membership commands of the demo world (development builds only), applied through `DemoWorld.commit`. They follow the
 * source-verified Auth contract (P5-S0; auth-service `membership/membership.service.ts` `decide` and `revoke`,
 * `membership/organization.controller.ts`): pending → active (approve) or rejected (reject), active → revoked (revoke,
 * P5-S3a); one membership, nothing else. The audience is an opaque label: no rule here reads it.
 */

export type MembershipDecision = 'approve' | 'reject';

const NOT_FOUND: AppError = { kind: 'not_found', code: 'not_found', status: 404 };
const ALREADY_DECIDED: AppError = {
  kind: 'conflict',
  code: 'membership_already_decided',
  status: 409,
};
const CONTACT_NOT_VERIFIED: AppError = {
  kind: 'conflict',
  code: 'contact_not_verified',
  status: 409,
};

export interface DecideMembershipInput {
  readonly organizationId: OrganizationId;
  readonly membershipId: string;
  readonly decision: MembershipDecision;
  /** The acting business identity (owner or operator) and the session's user id (Core's `actor.userId`). */
  readonly actor: AdminIdentityId;
  readonly actorUserId: string;
  /** Core's `REQUIRE_CONTACT_VERIFICATION` (default `false`): approval then needs a verified contact. */
  readonly requireContactVerification: boolean;
  readonly now: number;
}

/**
 * Core's `decide`, in its order: the membership of the URL's Organization (none: `404`), the actor's authority over
 * that Organization (the Company owner or an operator assigned to its Platform; otherwise the same `404`), never the
 * actor's own membership (`404`), only a pending one (`409 membership_already_decided`), and for an approval with
 * contact verification required, a verified contact (`409 contact_not_verified`). Then exactly one record changes:
 * its status and `approvedAt` or `rejectedAt`. The audience, the admin flag, the person and every other membership
 * stay as they are; a `membership.approved` or `membership.rejected` activity record is added. The decider is not
 * stored: Core keeps `approvedBy`/`rejectedBy` but never returns them to Admin.
 */
export function decideMembership(
  world: DemoWorldTables,
  input: DecideMembershipInput,
): CommandOutcome<MembershipRecord> {
  const current = world.memberships.find(
    (m) => m.id === input.membershipId && m.organizationId === input.organizationId,
  );
  if (current === undefined) return { ok: false, error: NOT_FOUND };
  const organization = organizationOf(world, current.organizationId);
  if (
    organization === undefined ||
    platformViewerOf(world, input.actor, organization.platformId) === null
  )
    return { ok: false, error: NOT_FOUND };
  // "Nobody decides their own membership", as a collapsed 404.
  if (current.userId === input.actorUserId) return { ok: false, error: NOT_FOUND };
  if (current.status !== 'pending') return { ok: false, error: ALREADY_DECIDED };
  if (input.decision === 'approve' && input.requireContactVerification) {
    const person = world.members.find((p) => p.id === current.userId);
    if (!person?.contactVerified) return { ok: false, error: CONTACT_NOT_VERIFIED };
  }
  const at = new Date(input.now).toISOString();
  const decided: MembershipRecord =
    input.decision === 'approve'
      ? { ...current, status: 'active', approvedAt: at }
      : { ...current, status: 'rejected', rejectedAt: at };
  const sequence = world.sequence + 1;
  return {
    ok: true,
    result: decided,
    world: {
      ...world,
      sequence,
      memberships: world.memberships.map((m) => (m.id === current.id ? decided : m)),
      activity: [
        ...world.activity,
        {
          id: `membership-activity-${input.decision}-${sequence}`,
          platformId: organization.platformId,
          organizationId: organization.id,
          action: input.decision === 'approve' ? 'membership.approved' : 'membership.rejected',
          occurredAt: at,
        },
      ],
    },
  };
}

const NOT_ACTIVE: AppError = { kind: 'conflict', code: 'membership_not_active', status: 409 };

export interface RevokeMembershipInput {
  readonly organizationId: OrganizationId;
  readonly membershipId: string;
  /** The acting business identity (owner or operator) and the session's user id (Core's `actor.userId`). */
  readonly actor: AdminIdentityId;
  readonly actorUserId: string;
  readonly now: number;
}

/**
 * Core's `revoke` (P5-S0, auth-service `membership.service.ts`), in its order: the membership of the URL's Organization
 * (none: `404`), the actor's authority (the Company owner or an operator assigned to the Platform; otherwise the same
 * `404`), never the actor's own membership (`404`), only an active one (`409 membership_not_active`: pending, rejected
 * and already revoked alike). Then exactly one record changes, in one step: `status → revoked`, `revokedAt`, and the
 * organization-admin flag cleared. An assigned operator may revoke an organization admin, as in Core (only an
 * organization admin, not an Admin actor, is barred from revoking another admin). The person, their other
 * memberships, invitations and everything commercial stay as they are; a `membership.revoked` activity record is added.
 */
export function revokeMembership(
  world: DemoWorldTables,
  input: RevokeMembershipInput,
): CommandOutcome<MembershipRecord> {
  const current = world.memberships.find(
    (m) => m.id === input.membershipId && m.organizationId === input.organizationId,
  );
  if (current === undefined) return { ok: false, error: NOT_FOUND };
  const organization = organizationOf(world, current.organizationId);
  if (
    organization === undefined ||
    platformViewerOf(world, input.actor, organization.platformId) === null
  )
    return { ok: false, error: NOT_FOUND };
  if (current.userId === input.actorUserId) return { ok: false, error: NOT_FOUND };
  if (current.status !== 'active') return { ok: false, error: NOT_ACTIVE };
  const at = new Date(input.now).toISOString();
  const revoked: MembershipRecord = {
    ...current,
    status: 'revoked',
    revokedAt: at,
    isOrganizationAdmin: false,
  };
  const sequence = world.sequence + 1;
  return {
    ok: true,
    result: revoked,
    world: {
      ...world,
      sequence,
      memberships: world.memberships.map((m) => (m.id === current.id ? revoked : m)),
      activity: [
        ...world.activity,
        {
          id: `membership-activity-revoke-${sequence}`,
          platformId: organization.platformId,
          organizationId: organization.id,
          action: 'membership.revoked',
          occurredAt: at,
        },
      ],
    },
  };
}
