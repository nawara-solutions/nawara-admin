import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, from, of, switchMap, throwError, timer } from 'rxjs';
import {
  DEMO_NEW_AUTHENTICATOR_CODE,
  DEMO_TOTP_ISSUER,
  DEMO_TOTP_SECRET,
} from '../../../core/auth/auth.fixtures';
import {
  DemoAuthState,
  DemoSignedIn,
  demoSecretKeyDigest,
} from '../../../core/auth/auth.mock-state';
import { TotpEnrollment } from '../../../core/auth/auth.model';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  AccountSecurity,
  AccountSecurityGateway,
  SecretKeyIssue,
} from './account-security.gateway';

/**
 * Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. `error`: the factor list
 * cannot be read. `confirmLost`: a confirmation is applied but its answer is lost (a network error).
 * `confirmUnavailable`: a confirmation is refused before anything is applied (`503`). Secret key (P9-S4c): `rotateLost`
 * (committed, the answer lost), `rotateServerError` (committed, then `500`), `rotateIncomplete` (committed, `200`
 * without a key), `rotateRateLimited` (`429`, nothing changed). Removing a factor (P9-S4d): `removeLost` (committed, the
 * answer lost), `removeServerError` (committed, then `500`).
 */
export type AccountSecurityDemoScenario =
  | 'normal'
  | 'error'
  | 'confirmLost'
  | 'confirmUnavailable'
  | 'rotateLost'
  | 'rotateServerError'
  | 'rotateIncomplete'
  | 'rotateRateLimited'
  | 'removeLost'
  | 'removeServerError';

export const ACCOUNT_SECURITY_DEMO_SCENARIO = new InjectionToken<AccountSecurityDemoScenario>(
  'ACCOUNT_SECURITY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * DEMO ONLY: the characters of a simulated secret key (32, no 0/O or 1/I). Core's alphabet is not declared (CF-59); the
 * demo key is random and fictional, never a Core key.
 */
const DEMO_SECRET_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A new simulated key: 13 groups of 4, joined by `-` (Core's shape, P9-S4-0; its separator is not declared). */
function demoSecretKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(52));
  const chars = Array.from(bytes, (b) => DEMO_SECRET_KEY_ALPHABET[b & 31]);
  return Array.from({ length: 13 }, (_, i) => chars.slice(i * 4, i * 4 + 4).join('')).join('-');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mock adapter (demo builds only) of Core's owner factor routes, over the simulated records of `DemoAuthState` (never
 * the demo world). No session `401`; anyone but an owner `403` (an operator included, whatever their Platform
 * assignments). Metadata is returned as a copy, so nothing outside can change the simulated records.
 *
 * Adding an authenticator (P9-S4b) follows Core `304064f`: begin replaces only an unconfirmed TOTP; begins and
 * confirmations share one throttle; a confirmation needs a live `owner.factor.enroll` grant of this owner, CHECKED
 * first and SPENT only when the factor is confirmed (a refused confirmation rolls back and leaves it usable). The NEW
 * app's code is `DEMO_NEW_AUTHENTICATOR_CODE`, never the existing factor's demo code. The setup key is the fixed
 * fictional `DEMO_TOTP_SECRET`; no seed, code or grant is kept with the factor records.
 *
 * Creating a secret key (P9-S4c) follows the same contract: a live `owner.secret_key.rotate` grant of this owner (a
 * factor's, never the secret key's), CHECKED first and SPENT with the change; every call makes a new random key, whose
 * DEMO digest replaces the previous verifier at once in `DemoAuthState` (the old key stops matching). The key itself is
 * returned once and kept nowhere. No read says whether a key exists (CF-54).
 *
 * Removing a factor (P9-S4d) follows the same contract, in Core's order: session and owner, the id's shape (`400`), a live
 * `owner.factor.remove` grant of this owner (factor only), the owner's own factor (`404` otherwise), never the last
 * confirmed one (`409 factor_required`); the grant is spent only with the change, and every refusal changes nothing.
 */
export class MockAccountSecurityGateway extends AccountSecurityGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ACCOUNT_SECURITY_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly now = inject(NW_CLOCK);

  load(): Observable<AccountSecurity> {
    return defer(() => {
      const owner = this.owner();
      if ('kind' in owner) return this.fail(owner);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const factors = (this.auth.ownerFactors.get(owner.identity.userId) ?? []).map(
        ({ id, type, confirmed, createdAt, lastUsedAt }) => ({
          id,
          type,
          confirmed,
          createdAt,
          lastUsedAt,
        }),
      );
      return of<AccountSecurity>({ factors }).pipe(delay(this.latency));
    });
  }

  beginTotp(): Observable<TotpEnrollment> {
    return defer(() => {
      const owner = this.owner();
      if ('kind' in owner) return this.fail(owner);
      const { userId, email } = owner.identity;
      if (!this.auth.takeFactorEnrollmentRequest(userId, this.now()))
        return this.fail({ kind: 'rate_limited', status: 429 });
      const factorId = this.auth.beginTotpFactor(userId, new Date(this.now()).toISOString());
      const issuer = encodeURIComponent(DEMO_TOTP_ISSUER);
      const label = `${issuer}:${encodeURIComponent(email ?? userId)}`;
      return of<TotpEnrollment>({
        factorId,
        secret: DEMO_TOTP_SECRET,
        otpauthUri: `otpauth://totp/${label}?secret=${DEMO_TOTP_SECRET}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
      }).pipe(delay(this.latency));
    });
  }

  confirmTotp(factorId: string, code: string, stepUpToken: string): Observable<void> {
    return defer(() => {
      const owner = this.owner();
      if ('kind' in owner) return this.fail(owner);
      const userId = owner.identity.userId;
      const now = this.now();
      if (!this.auth.takeFactorEnrollmentRequest(userId, now))
        return this.fail({ kind: 'rate_limited', status: 429 });
      if (this.scenario === 'confirmUnavailable')
        return this.fail({ kind: 'unavailable', status: 503 });
      if (!UUID.test(factorId) || !/^\d{6}$/.test(code))
        return this.fail({
          kind: 'validation',
          code: 'validation_error',
          messages: [],
          status: 400,
        });
      if (!this.auth.checkStepUp(stepUpToken, 'owner.factor.enroll', userId, now))
        return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
      const factor = this.auth.ownerFactors
        .get(userId)
        ?.find((f) => f.id === factorId && f.type === 'totp' && !f.confirmed);
      // A wrong code, or a factor that is not this owner's unconfirmed one (replaced, already confirmed, unknown):
      // the same 400, and Core rolls the transaction back, so the grant stays unspent.
      if (factor === undefined || code !== DEMO_NEW_AUTHENTICATOR_CODE)
        return this.fail({
          kind: 'validation',
          code: 'verification_failed',
          messages: [],
          status: 400,
        });
      this.auth.consumeStepUp(stepUpToken, 'owner.factor.enroll', userId, now);
      this.auth.confirmTotpFactor(userId, factorId, new Date(now).toISOString());
      if (this.scenario === 'confirmLost') return this.fail({ kind: 'network', status: 0 });
      return of(undefined).pipe(delay(this.latency));
    });
  }

  rotateSecretKey(stepUpToken: string): Observable<SecretKeyIssue> {
    return defer(() => {
      const owner = this.owner();
      if ('kind' in owner) return this.fail(owner);
      const userId = owner.identity.userId;
      if (this.scenario === 'rotateRateLimited')
        return this.fail({ kind: 'rate_limited', status: 429 });
      if (!this.auth.checkStepUp(stepUpToken, 'owner.secret_key.rotate', userId, this.now()))
        return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
      const secretKey = demoSecretKey();
      return from(demoSecretKeyDigest(secretKey)).pipe(
        switchMap((digest) => {
          const now = this.now();
          // Spent and replaced together, as in Core's transaction: a grant spent meanwhile changes nothing.
          if (!this.auth.consumeStepUp(stepUpToken, 'owner.secret_key.rotate', userId, now))
            return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
          const issuedAt = new Date(now).toISOString();
          this.auth.replaceSecretKeyVerifier(userId, digest, issuedAt);
          switch (this.scenario) {
            case 'rotateLost':
              return this.fail({ kind: 'network', status: 0 });
            case 'rotateServerError':
              return this.fail({ kind: 'unexpected', status: 500 });
            case 'rotateIncomplete':
              return of<SecretKeyIssue>({ secretKey: '', issuedAt }).pipe(delay(this.latency));
            default:
              return of<SecretKeyIssue>({ secretKey, issuedAt }).pipe(delay(this.latency));
          }
        }),
      );
    });
  }

  removeFactor(factorId: string, stepUpToken: string): Observable<void> {
    return defer(() => {
      const owner = this.owner();
      if ('kind' in owner) return this.fail(owner);
      const userId = owner.identity.userId;
      const now = this.now();
      if (!UUID.test(factorId))
        return this.fail({
          kind: 'validation',
          code: 'validation_error',
          messages: [],
          status: 400,
        });
      if (!this.auth.checkStepUp(stepUpToken, 'owner.factor.remove', userId, now))
        return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
      const factors = this.auth.ownerFactors.get(userId) ?? [];
      const factor = factors.find((f) => f.id === factorId);
      if (factor === undefined)
        return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      if (factor.confirmed && factors.filter((f) => f.confirmed).length <= 1)
        return this.fail({ kind: 'conflict', code: 'factor_required', status: 409 });
      this.auth.consumeStepUp(stepUpToken, 'owner.factor.remove', userId, now);
      this.auth.removeOwnerFactor(userId, factorId);
      if (this.scenario === 'removeLost') return this.fail({ kind: 'network', status: 0 });
      if (this.scenario === 'removeServerError')
        return this.fail({ kind: 'unexpected', status: 500 });
      return of(undefined).pipe(delay(this.latency));
    });
  }

  /** The signed-in owner, or the error Core's owner guard answers. */
  private owner(): DemoSignedIn | AppError {
    const signedIn = this.auth.signedIn();
    if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
    if (signedIn.identity.adminTier !== 'owner')
      return { kind: 'forbidden', code: 'forbidden', status: 403 };
    return signedIn;
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_ACCOUNT_SECURITY_PROVIDERS: readonly Provider[] = [
  { provide: AccountSecurityGateway, useClass: MockAccountSecurityGateway },
];
