import { Observable, throwError } from 'rxjs';
import { TotpEnrollment } from '../../../core/auth/auth.model';
import { adapterUnavailable } from '../../../core/errors/app-error';

/**
 * One of the owner's second factors, in the shape of Core's `GET /auth/admin/factors` (verified P9-S4-0, Core `304064f`:
 * `id, type, confirmed, createdAt, lastUsedAt`). Metadata only: Core returns no seed, credential, name or secret, and
 * neither does this model. `createdAt` is `null` only where the demo never saw the factor being added.
 */
export interface SecurityFactor {
  readonly id: string;
  readonly type: 'totp' | 'webauthn';
  /** `false`: an authenticator setup that was begun and never confirmed (unusable). */
  readonly confirmed: boolean;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly createdAt: string | null;
  readonly lastUsedAt: string | null;
}

/**
 * What the owner's Security overview shows (P9-S4a): their factors only. Deliberately absent: whether a secret key
 * exists (no Core read, CF-54), a pending recovery (CF-58), sessions (CF-51).
 */
export interface AccountSecurity {
  readonly factors: readonly SecurityFactor[];
}

/**
 * Frontend contract of the owner's account security (P9-S4a, P9-S4b), always the signed-in owner's own (bearer-scoped;
 * no identity parameter), `401` without a session and `403` for anyone else. No HTTP adapter until the auth HTTP adapter
 * exists (A4, D-A4).
 */
export abstract class AccountSecurityGateway {
  /** `GET /auth/admin/factors`: metadata only. Safe to re-read: the source of truth after a doubtful answer. */
  abstract load(): Observable<AccountSecurity>;
  /**
   * `POST /auth/admin/factors/totp`: a new, UNCONFIRMED authenticator factor, replacing any earlier unconfirmed one
   * (never a confirmed factor). `secret` and `otpauthUri` are returned this once: held in the setup's memory only,
   * never stored, put in a URL or logged. Errors: `429 rate_limited` (shared with `confirmTotp`).
   */
  abstract beginTotp(): Observable<TotpEnrollment>;
  /**
   * `POST /auth/admin/factors/totp/confirm` with an `owner.factor.enroll` step-up (`x-step-up-token`): the code is the
   * NEW app's. `200` confirms the factor and spends the grant. Errors: `400 verification_failed` (a wrong code, or a
   * factor that is not this owner's unconfirmed one: replaced or already confirmed; Core rolls back, so the grant is not
   * spent), `400 validation_error`, `403 step_up_required` (missing, spent, expired or another purpose's grant),
   * `429 rate_limited`. Never resent automatically: a lost answer is reconciled with `load()`.
   */
  abstract confirmTotp(factorId: string, code: string, stepUpToken: string): Observable<void>;
}

/** Every non-demo build: not available (never a demo record, never a request, never a setup). */
export class UnavailableAccountSecurityGateway extends AccountSecurityGateway {
  load(): Observable<AccountSecurity> {
    return throwError(adapterUnavailable);
  }

  beginTotp(): Observable<TotpEnrollment> {
    return throwError(adapterUnavailable);
  }

  confirmTotp(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
