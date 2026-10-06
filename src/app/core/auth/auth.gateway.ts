import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { PlatformId } from '../context/scope.model';
import { FactorProof, Grants, Identity, LoginOutcome, PasskeyRequest } from './auth.model';
import { OperatorIdentifier } from './operator-identifier';

/**
 * Frontend contract for Core authentication (docs/ARCHITECTURE.md §3, §11). Every error is an `AppError`.
 *
 * Core status 🟢 (docs/CORE-INTEGRATION.md §7): `POST /auth/login`, `/auth/admin/login/owner/verify`,
 * `/auth/admin/login/operator/request-code` and `/verify-code`, `/auth/admin/operators/confirm`, the WebAuthn
 * options route, `GET /auth/me`, `GET /auth/grants`, `GET /auth/platform-access/:platformId`, `POST /auth/logout`. The HTTP adapter is not written in this slice:
 * request fields, error codes and the session strategy (D-A4) are still to verify. Until then only the demo mock
 * exists, and every other build is unavailable.
 */
export abstract class AuthGateway {
  abstract login(email: string, password: string): Observable<LoginOutcome>;
  /** Completes an owner `mfa_required` challenge; on success Core issues the session. */
  abstract verifyOwnerFactor(challenge: string, proof: FactorProof): Observable<void>;
  abstract passkeyRequest(challenge: string): Observable<PasskeyRequest>;
  /**
   * Asks Core for an operator working code. Core always answers 204 for a well-formed request: the answer says nothing
   * about the account, its eligibility or any delivery (Core sends to the account's stored contact, if anything).
   */
  abstract requestWorkingCode(identifier: OperatorIdentifier): Observable<void>;
  /**
   * Redeems a working code (a 6-character string: leading zeroes kept). On success Core issues the session; every
   * refusal is the same generic 401 `operator_code_invalid`. Separate from the owner's second factor.
   */
  abstract verifyWorkingCode(identifier: OperatorIdentifier, code: string): Observable<void>;
  /**
   * Confirms a new operator's contact with the confirmation code Core issued when the owner created them
   * (`POST /auth/admin/operators/confirm`, public). `204` only records the contact as confirmed: no session, no tokens
   * and no working code are issued (the operator then requests one). An already confirmed contact also gets `204`.
   * Every refusal is the same generic `401 operator_code_invalid`. Core has no route to resend this code (CF-16).
   */
  abstract confirmOperatorContact(identifier: OperatorIdentifier, code: string): Observable<void>;
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

  requestWorkingCode(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  verifyWorkingCode(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  confirmOperatorContact(): Observable<void> {
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
