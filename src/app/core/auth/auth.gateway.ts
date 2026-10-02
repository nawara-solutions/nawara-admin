import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { PlatformId } from '../context/scope.model';
import { FactorProof, Grants, Identity, LoginOutcome, PasskeyRequest } from './auth.model';

/**
 * Frontend contract for Core authentication (docs/ARCHITECTURE.md §3, §11). Every error is an `AppError`.
 *
 * Core status 🟢 (docs/CORE-INTEGRATION.md §7): `POST /auth/login`, `/auth/admin/login/owner/verify`, the WebAuthn
 * options route, `GET /auth/me`, `GET /auth/grants`, `GET /auth/platform-access/:platformId`, `POST /auth/logout`. The HTTP adapter is not written in this slice:
 * request fields, error codes and the session strategy (D-A4) are still to verify. Until then only the demo mock
 * exists, and every other build is unavailable.
 */
export abstract class AuthGateway {
  abstract login(email: string, password: string): Observable<LoginOutcome>;
  /** Completes an owner `mfa_required` challenge; on success Core issues the session. */
  abstract verifyOwnerFactor(challenge: string, proof: FactorProof): Observable<void>;
  abstract passkeyRequest(challenge: string): Observable<PasskeyRequest>;
  abstract me(): Observable<Identity>;
  abstract grants(): Observable<Grants>;
  /** Whether the signed-in account may enter this Platform's scope (Core answers 200, or a collapsed 404 → `false`). */
  abstract platformAccess(platform: PlatformId): Observable<boolean>;
  abstract logout(): Observable<void>;
}

/** Every non-demo build: no adapter exists yet, so nothing is sent anywhere. */
export class UnavailableAuthGateway extends AuthGateway {
  login(): Observable<LoginOutcome> {
    return throwError(adapterUnavailable);
  }

  verifyOwnerFactor(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  passkeyRequest(): Observable<PasskeyRequest> {
    return throwError(adapterUnavailable);
  }

  me(): Observable<Identity> {
    return throwError(adapterUnavailable);
  }

  grants(): Observable<Grants> {
    return throwError(adapterUnavailable);
  }

  platformAccess(): Observable<boolean> {
    return throwError(adapterUnavailable);
  }

  logout(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
