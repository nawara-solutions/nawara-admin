import { Observable, throwError } from 'rxjs';
import { OrganizationId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { ListableMembershipStatus, MembershipList } from '../domain/membership.model';

/**
 * Frontend contract of an Organization's memberships, Auth-owned and source-verified (P5-S0): exactly Core's
 * `GET /auth/organizations/:organizationId/memberships?status=` (the status is always sent: Core's default is
 * `pending`). No pagination, search, sort or detail read exists, so none is offered here. Read only in P5-S1. No HTTP
 * adapter is authorized yet: production builds bind the unavailable adapter.
 */
export abstract class MembershipGateway {
  abstract list(
    organization: OrganizationId,
    status: ListableMembershipStatus,
  ): Observable<MembershipList>;
}

/** Every non-demo build: nothing is wired, so nothing is ever listed. */
export class UnavailableMembershipGateway extends MembershipGateway {
  list(): Observable<MembershipList> {
    return throwError(adapterUnavailable);
  }
}
