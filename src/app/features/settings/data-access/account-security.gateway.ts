import { Observable, throwError } from 'rxjs';
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
 * Frontend contract of the owner's account security overview (P9-S4a), read only. Core: `GET /auth/admin/factors`, the
 * signed-in owner's own (bearer-scoped; no identity parameter), `403` for anyone else. No HTTP adapter until the auth
 * HTTP adapter exists (A4, D-A4); no command.
 */
export abstract class AccountSecurityGateway {
  abstract load(): Observable<AccountSecurity>;
}

/** Every non-demo build: not available (never a demo record, never a request). */
export class UnavailableAccountSecurityGateway extends AccountSecurityGateway {
  load(): Observable<AccountSecurity> {
    return throwError(adapterUnavailable);
  }
}
