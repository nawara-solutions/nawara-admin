import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformAssignment } from '../domain/operator.model';

/**
 * Frontend contract for one operator's Platform assignment history.
 *
 * Core status 🟢 (P6-S0, Core `750eb21`): `GET /auth/admin/operators/:id/platform-assignments`, owner only (`403` for
 * anyone else), `200` with every record (active and removed) oldest first, the collapsed `404` for an unknown operator
 * or another Company's. The Company is derived from the owner's session, never sent. An HTTP adapter is NOT authorized
 * in P6-S1: until it is, every non-demo build binds the unavailable adapter (and the directory that gives the operator
 * ids does not exist in Core, CF-03).
 */
export abstract class OperatorAssignmentGateway {
  abstract history(operator: string): Observable<readonly PlatformAssignment[]>;
}

export class UnavailableOperatorAssignmentGateway extends OperatorAssignmentGateway {
  history(): Observable<readonly PlatformAssignment[]> {
    return throwError(adapterUnavailable);
  }
}
