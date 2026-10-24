import { DOCUMENT, Injectable, Provider, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { PlatformId } from '../context/scope.model';
import { AppError } from '../errors/app-error';
import { DemoWorld } from '../../demo/world/demo-world';
import { confirmOperatorContact } from '../../demo/world/commands/operator.commands';
import { grantsOf, operatorProfileOf, platformViewerOf } from '../../demo/world/selectors';
import { NW_CLOCK } from '../../shared/format/clock';
import {
  DEMO_ACCOUNTS,
  DEMO_CONFIRMATION_CODE,
  DEMO_PASSWORD,
  DEMO_TOTP_CODE,
  DEMO_TOTP_ISSUER,
  DEMO_TOTP_SECRET,
  DEMO_WORKING_CODE,
  DemoAccount,
  DemoOperator,
} from './auth.fixtures';
import { AuthGateway } from './auth.gateway';
import {
  ALL_DEMO_OPERATORS,
  CODE_ATTEMPTS,
  DemoAuthState,
  PendingEnrollment,
} from './auth.mock-state';
import {
  FactorProof,
  Grants,
  Identity,
  LoginOutcome,
  PasskeyAssertion,
  PasskeyRequest,
  TotpEnrollment,
} from './auth.model';
import { OperatorIdentifier } from './operator-identifier';
import { PasskeyPromptError, WebAuthnClient } from './webauthn-client';

/** How long a demo challenge stays valid. Core's real lifetime is still to verify (docs/CORE-INTEGRATION.md §9). */
const CHALLENGE_LIFETIME_MS = 5 * 60_000;

/**
 * Core's per-token attempt budget (`MAX_CHALLENGE_ATTEMPTS`, `challenge.service.ts`): every refused confirmation counts
 * one; the fifth still answers its own error (`400`), and consumes the token, so every later begin or confirm is `401`.
 * Order of Core's answers on both enrollment routes (`owner.controller.ts` → `enrollment.service.ts` `fromToken`, then the
 * `factor_enroll_owner` throttle): a dead token `401`, then `403 factor_already_enrolled`, then the throttle's `429`, all
 * before anything is counted. The mock answers in the same order.
 */
const ENROLLMENT_ATTEMPTS = 5;

/** Core's answer for an enrollment token that is invalid, expired, used or exhausted. */
const ENROLLMENT_TOKEN_INVALID: AppError = {
  kind: 'unauthenticated',
  code: 'verification_failed',
  status: 401,
};

/** Core's answer, on either enrollment route, once the owner has a confirmed factor. */
const FACTOR_ALREADY_ENROLLED: AppError = {
  kind: 'forbidden',
  code: 'factor_already_enrolled',
  status: 403,
};

/** Core's one answer to every refused working code (wrong, used, replaced, locked, unknown, out of shift). */
const CODE_INVALID: AppError = {
  kind: 'unauthenticated',
  code: 'operator_code_invalid',
  status: 401,
};

const sameIdentifier = (a: OperatorIdentifier, b: OperatorIdentifier): boolean =>
  a.kind === 'email'
    ? b.kind === 'email' && a.email === b.email
    : b.kind === 'phone' && a.phone === b.phone;

/**
 * Mock adapter (demo builds only). Its answers follow Auth's documented outcomes; its errors use HTTP status only,
 * because Core's stable auth error codes are not verified yet (provisional, never a Core contract).
 * An unknown or expired challenge answers `404`, which the flow treats as "verification needs to restart".
 *
 * Each route that binds the auth adapter (sign-in pages, shell) gets its own instance, but every instance works on the
 * one root `DemoAuthState`: one simulated Auth service, so a sign-out from the shell ends the session the sign-in
 * pages opened, and Core records (an enrolled factor, a confirmed contact) survive it until a reload.
 */
@Injectable()
export class MockAuthGateway extends AuthGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly state = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  login(email: string, password: string): Observable<LoginOutcome> {
    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.identity.email === email.trim().toLowerCase(),
    );
    if (!account || password !== DEMO_PASSWORD)
      return this.fail({ kind: 'unauthenticated', status: 401 });
    const next = this.state.enrolledOwners.has(account.identity.userId)
      ? ({ kind: 'mfa', methods: ['totp'] } as const)
      : account.next;
    switch (next.kind) {
      case 'session':
        this.signIn(account);
        return this.answer<LoginOutcome>({ kind: 'session' });
      case 'enrollment': {
        const enrollmentToken = crypto.randomUUID();
        this.state.enrollments.set(enrollmentToken, {
          account,
          expiresAt: Date.now() + CHALLENGE_LIFETIME_MS,
          factorId: null,
          attemptsLeft: ENROLLMENT_ATTEMPTS,
        });
        return this.answer<LoginOutcome>({ kind: 'enrollment_required', enrollmentToken });
      }
      case 'recovery':
        return this.answer<LoginOutcome>({ kind: 'recovery_required' });
      case 'mfa': {
        const token = crypto.randomUUID();
        this.state.challenges.set(token, {
          account,
          expiresAt: Date.now() + CHALLENGE_LIFETIME_MS,
        });
        return this.answer<LoginOutcome>({
          kind: 'mfa_required',
          challenge: { token, methods: next.methods },
        });
      }
    }
  }

  verifyOwnerFactor(challenge: string, proof: FactorProof): Observable<void> {
    const pending = this.live(challenge);
    if (!pending) return this.fail({ kind: 'not_found', status: 404 });
    const next = pending.account.next;
    const offered =
      (next.kind === 'mfa' && next.methods.includes(proof.method)) ||
      (this.state.enrolledOwners.has(pending.account.identity.userId) && proof.method === 'totp');
    // A simulated passkey assertion is accepted unchecked (see SimulatedWebAuthnClient).
    const valid = proof.method === 'passkey' || proof.code.replace(/\s/g, '') === DEMO_TOTP_CODE;
    if (!offered || !valid) return this.fail({ kind: 'unauthenticated', status: 401 });
    this.state.challenges.delete(challenge);
    this.signIn(pending.account);
    return this.answer(undefined);
  }

  passkeyRequest(challenge: string): Observable<PasskeyRequest> {
    if (!this.live(challenge)) return this.fail({ kind: 'not_found', status: 404 });
    return this.answer<PasskeyRequest>({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: 'nawara-solutions.com',
        userVerification: 'required',
        timeout: 60_000,
      },
    });
  }

  /**
   * Like Core's `enroll/totp`: a live token begins a new, unconfirmed factor (a new `factorId` each time) and returns its
   * key. The key is the one FICTIONAL demo key; nothing here is a real secret.
   */
  beginTotpEnrollment(enrollmentToken: string): Observable<TotpEnrollment> {
    const pending = this.liveEnrollment(enrollmentToken);
    if (!pending) return this.fail(ENROLLMENT_TOKEN_INVALID);
    const scenario = this.enrollmentScenario(pending);
    if (scenario === 'alreadyEnrolled') return this.fail(FACTOR_ALREADY_ENROLLED);
    if (scenario === 'beginUnavailable') return this.fail({ kind: 'unavailable', status: 503 });
    if (scenario === 'beginLimited') return this.fail({ kind: 'rate_limited', status: 429 });
    pending.factorId = crypto.randomUUID();
    const issuer = encodeURIComponent(DEMO_TOTP_ISSUER);
    const label = `${issuer}:${encodeURIComponent(pending.account.identity.email)}`;
    return this.answer<TotpEnrollment>({
      factorId: pending.factorId,
      secret: DEMO_TOTP_SECRET,
      otpauthUri: `otpauth://totp/${label}?secret=${DEMO_TOTP_SECRET}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    });
  }

  /**
   * Like Core's `enroll/totp/confirm`: the right code (`DEMO_TOTP_CODE`; the mock computes no TOTP) consumes the token and
   * signs in, with no further MFA. A wrong code is `400` and uses one of the token's attempts; a dead token is `401`.
   */
  confirmTotpEnrollment(enrollmentToken: string, factorId: string, code: string): Observable<void> {
    const pending = this.liveEnrollment(enrollmentToken);
    if (!pending) return this.fail(ENROLLMENT_TOKEN_INVALID);
    const scenario = this.enrollmentScenario(pending);
    if (scenario === 'alreadyEnrolled') return this.fail(FACTOR_ALREADY_ENROLLED);
    if (scenario === 'confirmUnavailable') return this.fail({ kind: 'unavailable', status: 503 });
    if (scenario === 'confirmLimited') return this.fail({ kind: 'rate_limited', status: 429 });
    // Like Core's `factors.confirmTotp`: a factor that is not the one begun, or a wrong code, is the same counted 400.
    if (pending.factorId !== factorId || code.replace(/\s/g, '') !== DEMO_TOTP_CODE) {
      pending.attemptsLeft -= 1;
      return this.fail({ kind: 'validation', messages: [], status: 400 });
    }
    this.state.enrollments.delete(enrollmentToken);
    this.state.enrolledOwners.add(pending.account.identity.userId);
    this.signIn(pending.account);
    return this.answer(undefined);
  }

  /** Always 204, like Core: nothing says whether the account exists or a code was sent (none, if unconfirmed). */
  requestWorkingCode(identifier: OperatorIdentifier): Observable<void> {
    const found = this.operator(identifier);
    if (found?.scenario === 'requestLimited')
      return this.fail({ kind: 'rate_limited', status: 429 });
    if (found && this.confirmed(found) && !this.blocked(found))
      this.state.workingCodes.set(found.identity.userId, CODE_ATTEMPTS);
    return this.answer(undefined);
  }

  verifyWorkingCode(identifier: OperatorIdentifier, code: string): Observable<void> {
    const found = this.operator(identifier);
    if (found?.scenario === 'verifyLimited')
      return this.fail({ kind: 'rate_limited', status: 429 });
    if (found?.scenario === 'verifyUnavailable')
      return this.fail({ kind: 'unavailable', status: 503 });
    const left = found ? this.state.workingCodes.get(found.identity.userId) : undefined;
    if (!found || this.blocked(found) || left === undefined || left <= 0)
      return this.fail(CODE_INVALID);
    if (code !== DEMO_WORKING_CODE) {
      this.state.workingCodes.set(found.identity.userId, left - 1);
      return this.fail(CODE_INVALID);
    }
    this.state.workingCodes.delete(found.identity.userId);
    this.signIn(found);
    return this.answer(undefined);
  }

  /**
   * Like Core's `operators/confirm`: an already confirmed contact answers 204 without checking the code; a right code
   * confirms the contact (204); anything else is the generic 401. Never signs in and never issues a working code.
   * Rate limits are only SIMULATED by scenario (`confirmLimited`): Core's real buckets (`operator_confirm_ip`, and
   * `operator_verify_identifier`, shared with working-code verification and reset only by a successful verification)
   * are not reproduced here.
   */
  confirmOperatorContact(identifier: OperatorIdentifier, code: string): Observable<void> {
    const found = this.operator(identifier);
    if (found?.scenario === 'confirmLimited')
      return this.fail({ kind: 'rate_limited', status: 429 });
    if (found?.scenario === 'confirmUnavailable')
      return this.fail({ kind: 'unavailable', status: 503 });
    if (found && this.blocked(found)) return this.fail(CODE_INVALID);
    if (found && this.confirmed(found)) return this.answer(undefined);
    const left = found ? this.state.confirmationCodes.get(found.identity.userId) : undefined;
    if (!found || left === undefined || left <= 0) return this.fail(CODE_INVALID);
    if (code !== DEMO_CONFIRMATION_CODE) {
      this.state.confirmationCodes.set(found.identity.userId, left - 1);
      return this.fail(CODE_INVALID);
    }
    this.state.confirmationCodes.delete(found.identity.userId);
    if (found.businessIdentityId === null) this.state.confirmedOperators.add(found.identity.userId);
    else this.world.commit(confirmOperatorContact(found.businessIdentityId, this.now()));
    return this.answer(undefined);
  }

  me(): Observable<Identity> {
    const signedIn = this.state.signedIn();
    return signedIn
      ? this.answer(signedIn.identity)
      : this.fail({ kind: 'unauthenticated', status: 401 });
  }

  grants(): Observable<Grants> {
    const signedIn = this.state.signedIn();
    return signedIn
      ? this.answer(grantsOf(this.world.snapshot(), signedIn.businessIdentityId))
      : this.fail({ kind: 'unauthenticated', status: 401 });
  }

  /** Like Core: the owner for a Platform of their Company, an operator for an assigned Platform; else `false`. */
  platformAccess(platform: PlatformId): Observable<boolean> {
    const signedIn = this.state.signedIn();
    if (!signedIn) return this.fail({ kind: 'unauthenticated', status: 401 });
    const viewer = platformViewerOf(this.world.snapshot(), signedIn.businessIdentityId, platform);
    return this.answer(viewer !== null);
  }

  /** Ends the simulated Core session only: Core records (enrolled factors, confirmed contacts) are kept. */
  logout(): Observable<void> {
    this.state.signedIn.set(null);
    return this.answer(undefined);
  }

  /** Opens the simulated Core session as the account's business identity (its grants stay in the world). */
  private signIn(account: DemoAccount | DemoOperator): void {
    this.state.signedIn.set({
      identity: account.identity,
      businessIdentityId: account.businessIdentityId,
    });
  }

  /**
   * Whether the operator's contact is confirmed: for a staff operator, the demo world's account (the directory shows the
   * same); for a scenario account that is not staff, the sign-in state.
   */
  private confirmed(found: DemoOperator): boolean {
    if (found.businessIdentityId === null)
      return this.state.confirmedOperators.has(found.identity.userId);
    return (
      operatorProfileOf(this.world.snapshot(), found.businessIdentityId)?.contactConfirmedAt != null
    );
  }

  /** Whether the owner blocked the operator (Core: `isActive = false`; no code is issued, none redeemed). */
  private blocked(found: DemoOperator): boolean {
    return (
      found.businessIdentityId !== null &&
      operatorProfileOf(this.world.snapshot(), found.businessIdentityId)?.blocked === true
    );
  }

  private operator(identifier: OperatorIdentifier): DemoOperator | undefined {
    return ALL_DEMO_OPERATORS.find((candidate) => sameIdentifier(candidate.identifier, identifier));
  }

  /** A live token: known, unexpired and not out of attempts (Core consumes it on the fifth refusal). */
  private liveEnrollment(enrollmentToken: string): PendingEnrollment | null {
    const pending = this.state.enrollments.get(enrollmentToken);
    return pending && pending.expiresAt > Date.now() && pending.attemptsLeft > 0 ? pending : null;
  }

  private enrollmentScenario(pending: PendingEnrollment) {
    const next = pending.account.next;
    return next.kind === 'enrollment' ? next.scenario : 'normal';
  }

  private live(challenge: string) {
    const pending = this.state.challenges.get(challenge);
    return pending && pending.expiresAt > Date.now() ? pending : null;
  }

  private answer<T>(value: T): Observable<T> {
    return of(value).pipe(delay(this.latency));
  }

  private fail<T>(error: AppError): Observable<T> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

/**
 * SIMULATED passkey prompt for demo builds. It does **not** call WebAuthn (`navigator.credentials`), and the mock
 * gateway accepts its fake assertion without any verification: nothing here proves a passkey works. It only lets a
 * reviewer exercise the flow's states. It shows a browser OK / Cancel confirmation dialog, which is not a passkey
 * prompt: OK simulates a completed prompt, Cancel a cancelled one. The real client is `BrowserWebAuthnClient`.
 */
@Injectable()
export class SimulatedWebAuthnClient extends WebAuthnClient {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly transloco = inject(TranslocoService);

  async get(): Promise<PasskeyAssertion> {
    await new Promise((resolve) => setTimeout(resolve, this.latency * 3));
    const confirmed = this.window?.confirm(this.transloco.translate('auth.demo.passkeyPrompt'));
    if (!confirmed) throw new PasskeyPromptError('cancelled');
    return { credential: { type: 'simulated-passkey' } };
  }
}

export const MOCK_AUTH_PROVIDERS: readonly Provider[] = [
  { provide: AuthGateway, useClass: MockAuthGateway },
  { provide: WebAuthnClient, useClass: SimulatedWebAuthnClient },
];
