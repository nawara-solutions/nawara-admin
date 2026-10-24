import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { OperatorContact } from '../domain/operator.model';

/** What creating an operator sends with its one contact: the owner's step-up grant for `operator.create` (never kept). */
export interface CreateOperatorRequest {
  readonly stepUpToken: string;
}

/** Core's `201` answer (P6-S0): the new operator's user id, its normalized contact, and whether the account is active. */
export interface CreatedOperator {
  readonly id: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly isActive: boolean;
}

/**
 * Frontend contract for blocking and unblocking an operator account (Core status 🟢, verified in P6-S0 at `750eb21`):
 * `POST /auth/admin/operators/:id/block` and `…/unblock`, no body, `204`. The Company owner only (`403` for anyone
 * else), the collapsed `404` for an unknown or another Company's operator. No step-up (Core's choice for an emergency
 * control), no idempotency key; a repeat answers `204` again and writes another audit record. Block ends every session
 * and cancels every unused code; unblock restores neither. A `204` carries no state: Admin cannot re-read the
 * resulting account state from Core (CF-03, proposed CF-35).
 *
 * Creating an operator (P6-S4): `POST /auth/admin/operators` with EXACTLY one of `email` or `phone` (Core normalizes
 * and validates it: `400`), the owner only (`403`), step-up `operator.create` (`403 step_up_required` without it), `201
 * { id, email, phone, isActive }`. A contact any account already holds, member or owner included, is `409
 * account_already_exists`, which never says whose. Core issues the new operator a one-time confirmation code (never
 * resent: CF-16) and creates no Platform assignment. No idempotency key: a lost answer cannot be replayed safely, and
 * Admin cannot look the result up (CF-03, CF-32).
 *
 * No HTTP adapter is authorized: every non-demo build binds the unavailable adapter.
 */
export abstract class OperatorAccountGateway {
  /** Whether changes can be sent in this build. */
  abstract readonly available: boolean;
  abstract block(operator: string): Observable<void>;
  abstract unblock(operator: string): Observable<void>;
  abstract create(
    contact: OperatorContact,
    request: CreateOperatorRequest,
  ): Observable<CreatedOperator>;
}

export class UnavailableOperatorAccountGateway extends OperatorAccountGateway {
  readonly available = false;

  block(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  unblock(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  create(): Observable<CreatedOperator> {
    return throwError(adapterUnavailable);
  }
}
