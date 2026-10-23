import { Observable, throwError } from 'rxjs';
import { OrganizationId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { MembershipDecision, MembershipDecisionResult } from '../domain/membership-decision.model';
import { ListableMembershipStatus, MembershipList } from '../domain/membership.model';

/**
 * Frontend contract of an Organization's memberships, Auth-owned and source-verified (P5-S0):
 * - `list`: exactly Core's `GET /auth/organizations/:organizationId/memberships?status=` (the status is always sent:
 *   Core's default is `pending`). No pagination, search, sort or detail read exists, so none is offered here.
 * - `decide` (P5-S2): `POST …/memberships/:membershipId/approve` or `…/reject`, no body, `200 { id, status }`. Not
 *   idempotent and no key exists: a lost answer is never resent automatically.
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
}

/** Every non-demo build: nothing is wired, so nothing is ever listed or decided. */
export class UnavailableMembershipGateway extends MembershipGateway {
  readonly available = false;

  list(): Observable<MembershipList> {
    return throwError(adapterUnavailable);
  }

  decide(): Observable<MembershipDecisionResult> {
    return throwError(adapterUnavailable);
  }
}
