import { Observable, throwError } from 'rxjs';
import { PlatformId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformAssignment } from '../domain/operator.model';

/** What a Platform assignment change sends besides its ids: the owner's step-up, once (no idempotency key in Core). */
export interface AssignmentChangeRequest {
  readonly stepUpToken: string;
}

/**
 * Frontend contract for one operator's Platform assignments (Core status 🟢, verified in P6-S0 at `750eb21`; the
 * Company is always derived from the owner's session, never sent):
 *
 * - `history`: `GET /auth/admin/operators/:id/platform-assignments`, owner only (`403` for anyone else), `200` with every
 *   record (active and removed) oldest first, the collapsed `404` for an unknown operator or another Company's.
 * - `grant`: `POST …/platform-assignments` `{ platformId }`, `X-Step-Up-Token` of purpose `platform_assignment.grant`:
 *   `201` with the new record; `409 assignment_conflict` (already active); `404`; `403 step_up_required`; `503
 *   hierarchy_unavailable` (checked before anything is written).
 * - `revoke`: `DELETE …/platform-assignments/:platformId`, `X-Step-Up-Token` of purpose `platform_assignment.revoke`:
 *   `204`; the collapsed `404` when no active record exists.
 *
 * Core accepts TOTP, a passkey or the secret key for both purposes and spends the step-up only when the change commits.
 * No HTTP adapter is authorized yet: every non-demo build binds the unavailable adapter (and the directory that gives
 * the operator ids does not exist in Core, CF-03).
 */
export abstract class OperatorAssignmentGateway {
  /** Whether changes can be sent in this build. */
  abstract readonly available: boolean;
  abstract history(operator: string): Observable<readonly PlatformAssignment[]>;
  abstract grant(
    operator: string,
    platform: PlatformId,
    request: AssignmentChangeRequest,
  ): Observable<PlatformAssignment>;
  abstract revoke(
    operator: string,
    platform: PlatformId,
    request: AssignmentChangeRequest,
  ): Observable<void>;
}

export class UnavailableOperatorAssignmentGateway extends OperatorAssignmentGateway {
  readonly available = false;

  history(): Observable<readonly PlatformAssignment[]> {
    return throwError(adapterUnavailable);
  }

  grant(): Observable<PlatformAssignment> {
    return throwError(adapterUnavailable);
  }

  revoke(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
