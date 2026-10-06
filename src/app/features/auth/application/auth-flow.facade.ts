import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, forkJoin, of, timer } from 'rxjs';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import { FactorProof, MfaMethod } from '../../../core/auth/auth.model';
import { AuthSession } from '../../../core/auth/auth-session';
import { OperatorIdentifier } from '../../../core/auth/operator-identifier';
import {
  RETURN_URL_PARAM,
  SIGN_IN_PATH,
  SIGN_IN_REASON_PARAM,
  SignInReason,
  safeReturnUrl,
} from '../../../core/auth/return-url';
import { PasskeyPromptError, WebAuthnClient } from '../../../core/auth/webauthn-client';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { PlatformRef } from '../../../core/context/scope.model';
import { AppError, toAppError } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { Actor } from '../../../core/auth/actor';
import { NO_ACCESS_PATH, PLATFORM_CHOICE_PATH, authorizedReturn, resolveLanding } from './landing';

/** How long "Verification accepted" stays before the access check, so it is seen and announced. */
export const AUTH_ACCEPTED_PAUSE_MS = new InjectionToken<number>('AUTH_ACCEPTED_PAUSE_MS', {
  factory: () => 800,
});

export const MFA_PATH = '/login/verify';
export const WORKING_CODE_PATH = '/login/code';
export const WORKING_CODE_VERIFY_PATH = '/login/code/verify';
export const CONTACT_CONFIRMATION_PATH = '/login/confirm';

/** `password` → (`mfa`) → `checking` → `resolved` (the landing page, or the no-access page). */
export type AuthStep = 'password' | 'mfa' | 'checking' | 'resolved';
export type BusyAction =
  | 'signIn'
  | 'verify'
  | 'passkey'
  | 'requestCode'
  | 'resendCode'
  | 'verifyWorkingCode'
  | 'confirmContact';
/**
 * Banner states of the password step. `enrollmentRequired` and `recoveryRequired` are Core's established next states
 * (`enrollment_required`, `recovery_required`), kept distinct; their screens are not in this prototype, so the flow
 * stops there: no session, no navigation. `stepNotAvailable`: `mfa_required` offered no factor this prototype knows.
 */
export type SignInProblem =
  | 'failed'
  | 'unavailable'
  | 'rateLimited'
  | 'enrollmentRequired'
  | 'recoveryRequired'
  | 'stepNotAvailable';
export type VerifyProblem =
  'invalidCode' | 'rateLimited' | 'unavailable' | 'expired' | 'passkeyFailed';
/** Problems of the working-code request (`invalid`: Core refused the identifier's shape, `400`). */
export type CodeRequestProblem = 'invalid' | 'rateLimited' | 'unavailable';
/**
 * Problems of the working-code verification. Every refusal of a code is Core's one generic `401
 * operator_code_invalid`: `invalidCode` never says why (wrong, used, replaced, locked, out of shift or unknown).
 */
export type WorkingCodeProblem = 'invalidCode' | 'rateLimited' | 'unavailable';
/**
 * Problems of a new operator's contact confirmation. Every refused code is Core's one generic `401
 * operator_code_invalid` (wrong, expired, used up, unknown or blocked): `invalidCode` never says why.
 */
export type ContactConfirmationProblem = 'invalidCode' | 'rateLimited' | 'unavailable';
/** What the verify page says about the last request: neither confirms eligibility nor delivery. */
export type WorkingCodeNotice = 'requested' | 'requestedAgain';

/**
 * Core's stable auth error codes are not verified yet (docs/CORE-INTEGRATION.md §9), so these map by error kind, the
 * HTTP-status fallback of docs/ARCHITECTURE.md §9. Messages never reveal whether an account exists, attempt counts
 * or lockout durations.
 */
export function signInProblemOf(error: AppError): SignInProblem {
  switch (error.kind) {
    case 'unauthenticated':
    case 'validation':
    case 'forbidden':
    case 'not_found':
      return 'failed';
    case 'rate_limited':
      return 'rateLimited';
    default:
      return 'unavailable';
  }
}

export function codeRequestProblemOf(error: AppError): CodeRequestProblem {
  switch (error.kind) {
    case 'validation':
      return 'invalid';
    case 'rate_limited':
      return 'rateLimited';
    default:
      return 'unavailable';
  }
}

export function workingCodeProblemOf(error: AppError): WorkingCodeProblem {
  switch (error.kind) {
    case 'unauthenticated':
    case 'validation':
    case 'forbidden':
    case 'not_found':
      return 'invalidCode';
    case 'rate_limited':
      return 'rateLimited';
    default:
      return 'unavailable';
  }
}

/** Same mapping as the working code: Core answers both with the same generic refusal and rate limits. */
export function contactConfirmationProblemOf(error: AppError): ContactConfirmationProblem {
  return workingCodeProblemOf(error);
}

/** A refused proof keeps the challenge; a challenge Core no longer knows (`403`/`404`/`409`) must restart. */
export function verifyProblemOf(error: AppError): VerifyProblem {
  switch (error.kind) {
    case 'unauthenticated':
    case 'validation':
      return 'invalidCode';
    case 'rate_limited':
      return 'rateLimited';
    case 'forbidden':
    case 'not_found':
    case 'conflict':
      return 'expired';
    default:
      return 'unavailable';
  }
}

/**
 * The sign-in journey (docs/ARCHITECTURE.md §5, §11): password and the owner's second step, or an operator's working
 * code (a separate method, never an owner factor), then the same access check and landing. Scoped to the sign-in frame component, so its state ends when the user leaves the sign-in pages.
 *
 * Authentication never grants access by itself: the session is established only after `/auth/me` and `/auth/grants`
 * have been resolved by `resolveLanding`. The challenge token stays in this facade's memory only, and is dropped on
 * going back, on expiry and on success. Credentials and codes are never kept here.
 */
@Injectable()
export class AuthFlowFacade {
  private readonly gateway = inject(AuthGateway);
  private readonly webAuthn = inject(WebAuthnClient);
  private readonly directory = inject(ScopeDirectoryGateway);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly acceptedPause = inject(AUTH_ACCEPTED_PAUSE_MS);
  private destroyed = false;

  private challengeToken: string | null = null;
  private readonly returnUrl = signal<string | null>(null);

  private readonly currentStep = signal<AuthStep>('password');
  private readonly currentBusy = signal<BusyAction | null>(null);
  private readonly offered = signal<readonly MfaMethod[]>([]);

  readonly step = this.currentStep.asReadonly();
  readonly busy = this.currentBusy.asReadonly();
  readonly signInProblem = signal<SignInProblem | null>(null);
  readonly verifyProblem = signal<VerifyProblem | null>(null);
  readonly accepted = signal(false);
  /** The email of the last attempt, kept when going back to the password step (never the password). */
  readonly email = signal('');
  /** The authenticated account (email, or phone for a phone-only identity) that has no administrative access. */
  readonly noAccessContact = signal<string | null>(null);

  /** The text last typed on the working-code request page, kept when coming back to change it (never a code). */
  readonly identifierText = signal('');
  /** The identifier a working code was requested for; set only after Core answered the request. */
  readonly workingCodeIdentifier = signal<OperatorIdentifier | null>(null);
  readonly codeRequestProblem = signal<CodeRequestProblem | null>(null);
  readonly workingCodeProblem = signal<WorkingCodeProblem | null>(null);
  readonly workingCodeNotice = signal<WorkingCodeNotice | null>(null);
  /** Contact confirmation (a new operator, before any working code): its problem, or that it succeeded. */
  readonly confirmationProblem = signal<ContactConfirmationProblem | null>(null);
  readonly contactConfirmed = signal(false);

  readonly methods = this.offered.asReadonly();
  readonly method = signal<MfaMethod>('totp');
  /** The other method Core offered for this challenge, if any (the "use … instead" link). */
  readonly alternative = computed(() => this.offered().find((m) => m !== this.method()) ?? null);
  /** A protected page was requested before sign-in (the "return to it" banner). */
  readonly hasReturnUrl = computed(() => this.returnUrl() !== null);
  /** The requested page as query parameters, so links between sign-in pages keep it (already checked as internal). */
  readonly returnQueryParams = computed(() => {
    const returnUrl = this.returnUrl();
    return returnUrl === null ? {} : { [RETURN_URL_PARAM]: returnUrl };
  });

  /** The polite live-region text (catalog key) for the current busy state or step. */
  readonly announcement = computed(() => {
    if (this.currentStep() === 'checking') return 'auth.checking.announce';
    switch (this.currentBusy()) {
      case 'signIn':
        return 'auth.signIn.submitting';
      case 'verify':
        return 'auth.mfa.verifying';
      case 'passkey':
        return 'auth.mfa.passkeyWaiting';
      case 'requestCode':
        return 'auth.workingCode.requesting';
      case 'resendCode':
        return 'auth.workingCode.requestingAgain';
      case 'verifyWorkingCode':
        return 'auth.workingCode.verifying';
      case 'confirmContact':
        return 'auth.contactConfirmation.confirming';
      default:
        return null;
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.destroyed = true));
  }

  /** Keeps the requested page only if it is an internal, path-only route. */
  setReturnUrl(value: unknown): void {
    this.returnUrl.set(safeReturnUrl(value));
  }

  async signIn(email: string, password: string): Promise<void> {
    if (this.currentBusy() !== null) return;
    this.email.set(email);
    this.signInProblem.set(null);
    this.currentBusy.set('signIn');
    try {
      const outcome = await firstValueFrom(this.gateway.login(email, password));
      if (this.destroyed) return;
      if (outcome.kind === 'session') {
        await this.resolveAccess();
      } else if (outcome.kind === 'mfa_required' && outcome.challenge.methods.length > 0) {
        this.challengeToken = outcome.challenge.token;
        this.offered.set(outcome.challenge.methods);
        this.method.set(outcome.challenge.methods[0] ?? 'totp');
        this.verifyProblem.set(null);
        this.accepted.set(false);
        this.currentStep.set('mfa');
        await this.router.navigateByUrl(MFA_PATH);
      } else if (outcome.kind === 'enrollment_required') {
        this.signInProblem.set('enrollmentRequired');
      } else if (outcome.kind === 'recovery_required') {
        this.signInProblem.set('recoveryRequired');
      } else {
        this.signInProblem.set('stepNotAvailable');
      }
    } catch (error: unknown) {
      this.signInProblem.set(signInProblemOf(toAppError(error)));
    } finally {
      this.currentBusy.set(null);
    }
  }

  async verifyCode(code: string): Promise<void> {
    if (this.currentBusy() !== null || this.challengeToken === null) return;
    this.currentBusy.set('verify');
    try {
      await this.verify({ method: 'totp', code });
    } finally {
      this.currentBusy.set(null);
    }
  }

  async startPasskey(): Promise<void> {
    const challenge = this.challengeToken;
    if (this.currentBusy() !== null || challenge === null) return;
    this.verifyProblem.set(null);
    this.currentBusy.set('passkey');
    try {
      const request = await firstValueFrom(this.gateway.passkeyRequest(challenge));
      const assertion = await this.webAuthn.get(request);
      if (this.destroyed) return;
      await this.verify({ method: 'passkey', assertion });
    } catch (error: unknown) {
      this.verifyProblem.set(
        error instanceof PasskeyPromptError ? 'passkeyFailed' : verifyProblemOf(toAppError(error)),
      );
    } finally {
      this.currentBusy.set(null);
    }
  }

  /**
   * Requests a working code. One request at a time (a pending one blocks another). Core's 204 says nothing about the
   * account, so the next page only says a code is sent *if* the account is eligible.
   */
  async requestWorkingCode(text: string, identifier: OperatorIdentifier): Promise<void> {
    if (this.currentBusy() !== null) return;
    this.identifierText.set(text);
    this.codeRequestProblem.set(null);
    this.currentBusy.set('requestCode');
    try {
      await firstValueFrom(this.gateway.requestWorkingCode(identifier));
      if (this.destroyed) return;
      this.workingCodeIdentifier.set(identifier);
      this.workingCodeProblem.set(null);
      this.workingCodeNotice.set('requested');
      this.accepted.set(false);
      await this.router.navigate([WORKING_CODE_VERIFY_PATH], this.signInQuery());
    } catch (error: unknown) {
      this.codeRequestProblem.set(codeRequestProblemOf(toAppError(error)));
    } finally {
      this.currentBusy.set(null);
    }
  }

  /** Requests another code for the same identifier; Core replaces the previous one. No cooldown is invented. */
  async requestWorkingCodeAgain(): Promise<void> {
    const identifier = this.workingCodeIdentifier();
    if (this.currentBusy() !== null || identifier === null) return;
    this.workingCodeProblem.set(null);
    this.workingCodeNotice.set(null);
    this.currentBusy.set('resendCode');
    try {
      await firstValueFrom(this.gateway.requestWorkingCode(identifier));
      if (this.destroyed) return;
      this.workingCodeNotice.set('requestedAgain');
    } catch (error: unknown) {
      const problem = codeRequestProblemOf(toAppError(error));
      this.workingCodeProblem.set(problem === 'rateLimited' ? 'rateLimited' : 'unavailable');
    } finally {
      this.currentBusy.set(null);
    }
  }

  /** Redeems a working code (a string: leading zeroes kept), then the same access check as every sign-in. */
  async verifyWorkingCode(code: string): Promise<void> {
    const identifier = this.workingCodeIdentifier();
    if (this.currentBusy() !== null || identifier === null) return;
    this.workingCodeProblem.set(null);
    this.currentBusy.set('verifyWorkingCode');
    try {
      try {
        await firstValueFrom(this.gateway.verifyWorkingCode(identifier, code));
      } catch (error: unknown) {
        this.workingCodeNotice.set(null);
        this.workingCodeProblem.set(workingCodeProblemOf(toAppError(error)));
        return;
      }
      this.workingCodeNotice.set(null);
      this.accepted.set(true);
      await firstValueFrom(timer(this.acceptedPause));
      if (this.destroyed) return;
      await this.resolveAccess();
    } finally {
      this.currentBusy.set(null);
    }
  }

  /** A fresh confirmation form: no banner and no earlier success. */
  startContactConfirmation(): void {
    this.confirmationProblem.set(null);
    this.contactConfirmed.set(false);
  }

  /**
   * Confirms a new operator's contact (one request at a time). Success only records the contact as confirmed: no
   * session and no access check, and no working code is sent; the operator then requests one. The code is not kept.
   */
  async confirmContact(text: string, identifier: OperatorIdentifier, code: string): Promise<void> {
    if (this.currentBusy() !== null) return;
    this.identifierText.set(text);
    this.confirmationProblem.set(null);
    this.currentBusy.set('confirmContact');
    try {
      await firstValueFrom(this.gateway.confirmOperatorContact(identifier, code));
      if (this.destroyed) return;
      this.contactConfirmed.set(true);
    } catch (error: unknown) {
      this.confirmationProblem.set(contactConfirmationProblemOf(toAppError(error)));
    } finally {
      this.currentBusy.set(null);
    }
  }

  /** Back to the request page to correct the identifier (kept as typed). */
  async changeIdentifier(): Promise<void> {
    if (this.currentBusy() !== null) return;
    this.forgetWorkingCode();
    await this.router.navigate([WORKING_CODE_PATH], this.signInQuery());
  }

  useMethod(method: MfaMethod): void {
    if (this.currentBusy() !== null || !this.offered().includes(method)) return;
    this.method.set(method);
    this.verifyProblem.set(null);
  }

  /** Clears a banner (for example before "Try again"). */
  dismissProblems(): void {
    this.signInProblem.set(null);
    this.verifyProblem.set(null);
    this.codeRequestProblem.set(null);
    this.workingCodeProblem.set(null);
    this.confirmationProblem.set(null);
  }

  /** Back to the password step. The challenge is dropped; the email is kept. */
  async backToSignIn(): Promise<void> {
    this.forgetChallenge();
    this.currentStep.set('password');
    await this.router.navigate([SIGN_IN_PATH], this.signInQuery());
  }

  /** Ends the Core session (best effort) and the local one, then shows "You have signed out". */
  async signOut(): Promise<void> {
    try {
      await firstValueFrom(this.gateway.logout());
    } catch {
      // The local session ends regardless; Core expires what it could not revoke.
    }
    this.session.signOut();
    this.forgetChallenge();
    this.noAccessContact.set(null);
    this.email.set('');
    this.identifierText.set('');
    this.currentStep.set('password');
    const reason: SignInReason = 'signed-out';
    await this.router.navigate([SIGN_IN_PATH], {
      queryParams: { [SIGN_IN_REASON_PARAM]: reason },
    });
  }

  /** Names of the signed-in operator's assigned Platforms, for the platform choice. */
  assignedPlatforms(): Observable<ViewState<readonly PlatformRef[]>> {
    const actor = this.session.actor();
    if (actor?.kind !== 'operator') return of({ status: 'forbidden' });
    return toViewState(
      this.directory.assignedPlatforms(actor.platformAssignments),
      (platforms) => platforms.length === 0,
    );
  }

  private async verify(proof: FactorProof): Promise<void> {
    const challenge = this.challengeToken;
    if (challenge === null) return;
    this.verifyProblem.set(null);
    try {
      await firstValueFrom(this.gateway.verifyOwnerFactor(challenge, proof));
    } catch (error: unknown) {
      const problem = verifyProblemOf(toAppError(error));
      if (problem === 'expired') this.challengeToken = null;
      this.verifyProblem.set(problem);
      return;
    }
    this.challengeToken = null;
    this.accepted.set(true);
    await firstValueFrom(timer(this.acceptedPause));
    if (this.destroyed) return;
    await this.resolveAccess();
  }

  /** `/auth/me` + `/auth/grants` → landing. Only now is the session established. */
  private async resolveAccess(): Promise<void> {
    this.currentStep.set('checking');
    try {
      const [identity, grants] = await firstValueFrom(
        forkJoin([this.gateway.me(), this.gateway.grants()]),
      );
      if (this.destroyed) return;
      const landing = resolveLanding(identity, grants);
      if (landing.kind === 'noAccess') {
        this.currentStep.set('resolved');
        this.forgetChallenge();
        this.noAccessContact.set(landing.contact);
        await this.router.navigateByUrl(NO_ACCESS_PATH);
        return;
      }
      const returnTo = await this.authorizedReturnUrl(landing.actor);
      if (this.destroyed) return;
      this.currentStep.set('resolved');
      this.forgetChallenge();
      this.session.establish(landing.actor);
      await this.router.navigateByUrl(
        returnTo ?? (landing.kind === 'enter' ? landing.url : PLATFORM_CHOICE_PATH),
      );
    } catch {
      if (this.destroyed) return;
      // Authenticated, but access could not be resolved: never guess. Drop the Core session and start again.
      this.gateway.logout().subscribe({ error: () => undefined });
      this.forgetChallenge();
      this.currentStep.set('password');
      this.signInProblem.set('unavailable');
      await this.router.navigate([SIGN_IN_PATH], this.signInQuery());
    }
  }

  /**
   * The requested page, only if this actor may open it: a known route its capabilities allow, and for a Platform scope
   * Core's own platform-access answer. Anything else (refused, unknown, unreachable) falls back to the default landing.
   */
  private async authorizedReturnUrl(actor: Actor): Promise<string | null> {
    const target = authorizedReturn(actor, this.returnUrl());
    if (target === null) return null;
    if (target.kind === 'page') return target.url;
    try {
      const allowed = await firstValueFrom(this.gateway.platformAccess(target.platformId));
      return allowed ? target.url : null;
    } catch {
      return null;
    }
  }

  private forgetChallenge(): void {
    this.challengeToken = null;
    this.offered.set([]);
    this.verifyProblem.set(null);
    this.accepted.set(false);
    this.forgetWorkingCode();
  }

  private forgetWorkingCode(): void {
    this.workingCodeIdentifier.set(null);
    this.codeRequestProblem.set(null);
    this.workingCodeProblem.set(null);
    this.workingCodeNotice.set(null);
    this.startContactConfirmation();
  }

  private signInQuery() {
    const returnUrl = this.returnUrl();
    return returnUrl === null ? {} : { queryParams: { [RETURN_URL_PARAM]: returnUrl } };
  }
}
