import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';

/**
 * Frontend contract for blocking and unblocking an operator account (Core status 🟢, verified in P6-S0 at `750eb21`):
 * `POST /auth/admin/operators/:id/block` and `…/unblock`, no body, `204`. The Company owner only (`403` for anyone
 * else), the collapsed `404` for an unknown or another Company's operator. No step-up (Core's choice for an emergency
 * control), no idempotency key; a repeat answers `204` again and writes another audit record. Block ends every session
 * and cancels every unused code; unblock restores neither. A `204` carries no state: Admin cannot re-read the
 * resulting account state from Core (CF-03, proposed CF-35).
 *
 * No HTTP adapter is authorized: every non-demo build binds the unavailable adapter.
 */
export abstract class OperatorAccountGateway {
  /** Whether changes can be sent in this build. */
  abstract readonly available: boolean;
  abstract block(operator: string): Observable<void>;
  abstract unblock(operator: string): Observable<void>;
}

export class UnavailableOperatorAccountGateway extends OperatorAccountGateway {
  readonly available = false;

  block(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  unblock(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
