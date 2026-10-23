import { Membership } from './membership.model';

/**
 * A decision on a pending membership request (P5-S2): Core's `POST …/memberships/:membershipId/approve` or `…/reject`
 * (P5-S0, auth-service `membership/organization.controller.ts`). No body, no step-up, no idempotency key. The same
 * rules hold for every audience: the label is opaque and never decides who may be approved.
 */
export type MembershipDecision = 'approve' | 'reject';

/** Core's answer, `200 { id, status }`. */
export interface MembershipDecisionResult {
  readonly id: string;
  readonly status: 'active' | 'rejected';
}

/** Only a pending request can be decided (Core answers `409 membership_already_decided` for any other). */
export const isDecidable = (membership: Pick<Membership, 'status'>): boolean =>
  membership.status === 'pending';

/** Core's answer to `POST …/memberships/:membershipId/revoke` (P5-S3a): `200 { id, status: 'revoked' }`. */
export interface MembershipRevokeResult {
  readonly id: string;
  readonly status: 'revoked';
}

/** Only an active membership can be revoked (Core answers `409 membership_not_active` for any other). */
export const isRevocable = (membership: Pick<Membership, 'status'>): boolean =>
  membership.status === 'active';

/**
 * The organization-admin role can change only on an active membership, and only to the other value (Core answers the
 * collapsed `404` otherwise: already admin for a grant, not admin for a removal).
 */
export const roleChangeOf = (
  membership: Pick<Membership, 'status' | 'isOrganizationAdmin'>,
): 'grant' | 'remove' | null =>
  membership.status !== 'active' ? null : membership.isOrganizationAdmin ? 'remove' : 'grant';
