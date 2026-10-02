import { DestroyRef, Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom, forkJoin, of, timer } from 'rxjs';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import { FactorProof, MfaMethod } from '../../../core/auth/auth.model';
import { AuthSession } from '../../../core/auth/auth-session';
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

/** `password` → (`mfa`) → `checking` → `resolved` (the landing page, or the no-access page). */
export type AuthStep = 'password' | 'mfa' | 'checking' | 'resolved';
export type BusyAction = 'signIn' | 'verify' | 'passkey';
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
 * The sign-in journey (docs/ARCHITECTURE.md §5, §11): password, the owner's second step, then the access check and the
 * landing. Scoped to the sign-in frame component, so its state ends when the user leaves the sign-in pages.
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
  /** The authenticated account that has no administrative access (no-access page). */
  readonly noAccessEmail = signal<string | null>(null);

  readonly methods = this.offered.asReadonly();
  readonly method = signal<MfaMethod>('totp');
  /** The other method Core offered for this challenge, if any (the "use … instead" link). */
  readonly alternative = computed(() => this.offered().find((m) => m !== this.method()) ?? null);
  /** A protected page was requested before sign-in (the "return to it" banner). */
  readonly hasReturnUrl = computed(() => this.returnUrl() !== null);

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

  useMethod(method: MfaMethod): void {
    if (this.currentBusy() !== null || !this.offered().includes(method)) return;
    this.method.set(method);
    this.verifyProblem.set(null);
  }

  /** Clears a banner (for example before "Try again"). */
  dismissProblems(): void {
    this.signInProblem.set(null);
    this.verifyProblem.set(null);
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
    this.noAccessEmail.set(null);
    this.email.set('');
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
        this.noAccessEmail.set(landing.email);
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
  }

  private signInQuery() {
    const returnUrl = this.returnUrl();
    return returnUrl === null ? {} : { queryParams: { [RETURN_URL_PARAM]: returnUrl } };
  }
}
