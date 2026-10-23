import { Observable, throwError } from 'rxjs';
import { OrganizationId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import {
  MembershipDecision,
  MembershipDecisionResult,
  MembershipRevokeResult,
} from '../domain/membership-decision.model';
import { ListableMembershipStatus, MembershipList } from '../domain/membership.model';

/**
 * Frontend contract of an Organization's memberships, Auth-owned and source-verified (P5-S0):
 * - `list`: exactly Core's `GET /auth/organizations/:organizationId/memberships?status=` (the status is always sent:
 *   Core's default is `pending`). No pagination, search, sort or detail read exists, so none is offered here.
 * - `decide` (P5-S2): `POST …/memberships/:membershipId/approve` or `…/reject`, no body, `200 { id, status }`. Not
 *   idempotent and no key exists: a lost answer is never resent automatically.
 * - `revoke` (P5-S3a): `POST …/memberships/:membershipId/revoke`, no body, no step-up, `200 { id, status: 'revoked' }`;
 *   not idempotent either.
 * - `setOrganizationAdmin` (P5-S3b): `POST` (grant) or `DELETE` (remove) `…/memberships/:membershipId/admin`, the
 *   owner's step-up in `x-step-up-token` (`organization.admin.grant` / `.revoke`), `204`.
 * No HTTP adapter is authorized yet: production builds bind the unavailable adapter.
 */
export abstract class MembershipGateway {
  /** Whether decisions can be sent at all in this build (the unavailable adapter: never). */
  abstract readonly available: boolean;

  abstract list(
    organization: OrganizationId,
    status: ListableMembershipStatus,
  ): Observable<MembershipList>;

  abstract decide(
    organization: OrganizationId,
    membershipId: string,
    decision: MembershipDecision,
  ): Observable<MembershipDecisionResult>;

  abstract revoke(
    organization: OrganizationId,
    membershipId: string,
  ): Observable<MembershipRevokeResult>;

  abstract setOrganizationAdmin(
    organization: OrganizationId,
    membershipId: string,
    admin: boolean,
    options: { readonly stepUpToken: string },
  ): Observable<void>;
}

/** Every non-demo build: nothing is wired, so nothing is ever listed or changed. */
export class UnavailableMembershipGateway extends MembershipGateway {
  readonly available = false;

  list(): Observable<MembershipList> {
    return throwError(adapterUnavailable);
  }

  decide(): Observable<MembershipDecisionResult> {
    return throwError(adapterUnavailable);
  }

  revoke(): Observable<MembershipRevokeResult> {
    return throwError(adapterUnavailable);
  }

  setOrganizationAdmin(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
