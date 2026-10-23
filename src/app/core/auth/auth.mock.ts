import { DOCUMENT, Injectable, Provider, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DEMO_COMPANY_DIRECTORY } from '../context/scope-directory.fixtures';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { PlatformId } from '../context/scope.model';
import { AppError } from '../errors/app-error';
import {
  DEMO_ACCOUNTS,
  DEMO_CONFIRMATION_CODE,
  DEMO_NEW_OPERATORS,
  DEMO_OPERATORS,
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

/** Core's `MAX_CODE_ATTEMPTS`: five wrong guesses kill a working code (`operator-code.service.ts`). */
const WORKING_CODE_ATTEMPTS = 5;

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

/** A pending enrollment: the owner, the factor begun last (if any), and the attempts left on its token. */
interface PendingEnrollment {
  readonly account: DemoAccount;
  readonly expiresAt: number;
  factorId: string | null;
  attemptsLeft: number;
}

/** Every demo operator: the confirmed ones (working-code sign-in) and the new ones (contact confirmation first). */
const ALL_OPERATORS: readonly DemoOperator[] = [...DEMO_OPERATORS, ...DEMO_NEW_OPERATORS];

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
 */
@Injectable()
export class MockAuthGateway extends AuthGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly challenges = new Map<string, { account: DemoAccount; expiresAt: number }>();
  private readonly enrollments = new Map<string, PendingEnrollment>();
  /** Owners who completed enrollment in this session (by user id): their next sign-in asks for the code. */
  private readonly enrolledOwners = new Set<string>();
  /** The live working code per operator (by user id): wrong guesses left. Issuing replaces; success consumes. */
  private readonly workingCodes = new Map<string, number>();
  /** Operators whose contact is confirmed (by user id). Core issues working codes only to them. */
  private readonly confirmedOperators = new Set(
    ALL_OPERATORS.filter((o) => o.confirmed).map((o) => o.identity.userId),
  );
  /** The confirmation code of each unconfirmed operator: wrong guesses left. Core never reissues it (CF-16). */
  private readonly confirmationCodes = new Map(
    ALL_OPERATORS.filter((o) => !o.confirmed).map((o) => [
      o.identity.userId,
      WORKING_CODE_ATTEMPTS,
    ]),
  );
  private signedIn: { readonly identity: Identity; readonly grants: Grants } | null = null;

  login(email: string, password: string): Observable<LoginOutcome> {
    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.identity.email === email.trim().toLowerCase(),
    );
    if (!account || password !== DEMO_PASSWORD)
      return this.fail({ kind: 'unauthenticated', status: 401 });
    const next = this.enrolledOwners.has(account.identity.userId)
      ? ({ kind: 'mfa', methods: ['totp'] } as const)
      : account.next;
    switch (next.kind) {
      case 'session':
        this.signedIn = account;
        return this.answer<LoginOutcome>({ kind: 'session' });
      case 'enrollment': {
        const enrollmentToken = crypto.randomUUID();
        this.enrollments.set(enrollmentToken, {
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
        this.challenges.set(token, { account, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
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
      (this.enrolledOwners.has(pending.account.identity.userId) && proof.method === 'totp');
    // A simulated passkey assertion is accepted unchecked (see SimulatedWebAuthnClient).
    const valid = proof.method === 'passkey' || proof.code.replace(/\s/g, '') === DEMO_TOTP_CODE;
    if (!offered || !valid) return this.fail({ kind: 'unauthenticated', status: 401 });
    this.challenges.delete(challenge);
    this.signedIn = pending.account;
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
    this.enrollments.delete(enrollmentToken);
    this.enrolledOwners.add(pending.account.identity.userId);
    this.signedIn = pending.account;
    return this.answer(undefined);
  }

  /** Always 204, like Core: nothing says whether the account exists or a code was sent (none, if unconfirmed). */
  requestWorkingCode(identifier: OperatorIdentifier): Observable<void> {
    const found = this.operator(identifier);
    if (found?.scenario === 'requestLimited')
      return this.fail({ kind: 'rate_limited', status: 429 });
    if (found && this.confirmedOperators.has(found.identity.userId))
      this.workingCodes.set(found.identity.userId, WORKING_CODE_ATTEMPTS);
    return this.answer(undefined);
  }

  verifyWorkingCode(identifier: OperatorIdentifier, code: string): Observable<void> {
    const found = this.operator(identifier);
    if (found?.scenario === 'verifyLimited')
      return this.fail({ kind: 'rate_limited', status: 429 });
    if (found?.scenario === 'verifyUnavailable')
      return this.fail({ kind: 'unavailable', status: 503 });
    const left = found ? this.workingCodes.get(found.identity.userId) : undefined;
    if (!found || left === undefined || left <= 0) return this.fail(CODE_INVALID);
    if (code !== DEMO_WORKING_CODE) {
      this.workingCodes.set(found.identity.userId, left - 1);
      return this.fail(CODE_INVALID);
    }
    this.workingCodes.delete(found.identity.userId);
    this.signedIn = found;
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
    if (found && this.confirmedOperators.has(found.identity.userId)) return this.answer(undefined);
    const left = found ? this.confirmationCodes.get(found.identity.userId) : undefined;
    if (!found || left === undefined || left <= 0) return this.fail(CODE_INVALID);
    if (code !== DEMO_CONFIRMATION_CODE) {
      this.confirmationCodes.set(found.identity.userId, left - 1);
      return this.fail(CODE_INVALID);
    }
    this.confirmationCodes.delete(found.identity.userId);
    this.confirmedOperators.add(found.identity.userId);
    return this.answer(undefined);
  }

  me(): Observable<Identity> {
    return this.signedIn
      ? this.answer(this.signedIn.identity)
      : this.fail({ kind: 'unauthenticated', status: 401 });
  }

  grants(): Observable<Grants> {
    return this.signedIn
      ? this.answer(this.signedIn.grants)
      : this.fail({ kind: 'unauthenticated', status: 401 });
  }

  /** Like Core: the owner for a Platform of their Company, an operator for an assigned Platform; else `false`. */
  platformAccess(platform: PlatformId): Observable<boolean> {
    const account = this.signedIn;
    if (!account) return this.fail({ kind: 'unauthenticated', status: 401 });
    const allowed =
      account.identity.adminTier === 'owner'
        ? account.grants.companyId === DEMO_COMPANY_DIRECTORY.company.id &&
          DEMO_COMPANY_DIRECTORY.platforms.some((p) => p.id === platform)
        : account.identity.adminTier === 'operator' &&
          account.grants.platformAssignments.includes(platform);
    return this.answer(allowed);
  }

  logout(): Observable<void> {
    this.signedIn = null;
    return this.answer(undefined);
  }

  private operator(identifier: OperatorIdentifier): DemoOperator | undefined {
    return ALL_OPERATORS.find((candidate) => sameIdentifier(candidate.identifier, identifier));
  }

  /** A live token: known, unexpired and not out of attempts (Core consumes it on the fifth refusal). */
  private liveEnrollment(enrollmentToken: string): PendingEnrollment | null {
    const pending = this.enrollments.get(enrollmentToken);
    return pending && pending.expiresAt > Date.now() && pending.attemptsLeft > 0 ? pending : null;
  }

  private enrollmentScenario(pending: PendingEnrollment) {
    const next = pending.account.next;
    return next.kind === 'enrollment' ? next.scenario : 'normal';
  }

  private live(challenge: string) {
    const pending = this.challenges.get(challenge);
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
