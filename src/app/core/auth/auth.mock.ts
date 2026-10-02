import { DOCUMENT, Injectable, Provider, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DEMO_COMPANY_DIRECTORY } from '../context/scope-directory.fixtures';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { PlatformId } from '../context/scope.model';
import { AppError } from '../errors/app-error';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_TOTP_CODE, DemoAccount } from './auth.fixtures';
import { AuthGateway } from './auth.gateway';
import {
  FactorProof,
  Grants,
  Identity,
  LoginOutcome,
  PasskeyAssertion,
  PasskeyRequest,
} from './auth.model';
import { PasskeyPromptError, WebAuthnClient } from './webauthn-client';

/** How long a demo challenge stays valid. Core's real lifetime is still to verify (docs/CORE-INTEGRATION.md §9). */
const CHALLENGE_LIFETIME_MS = 5 * 60_000;

/**
 * Mock adapter (demo builds only). Its answers follow Auth's documented outcomes; its errors use HTTP status only,
 * because Core's stable auth error codes are not verified yet (provisional, never a Core contract).
 * An unknown or expired challenge answers `404`, which the flow treats as "verification needs to restart".
 */
@Injectable()
export class MockAuthGateway extends AuthGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly challenges = new Map<string, { account: DemoAccount; expiresAt: number }>();
  private signedIn: DemoAccount | null = null;

  login(email: string, password: string): Observable<LoginOutcome> {
    const account = DEMO_ACCOUNTS.find(
      (candidate) => candidate.identity.email === email.trim().toLowerCase(),
    );
    if (!account || password !== DEMO_PASSWORD)
      return this.fail({ kind: 'unauthenticated', status: 401 });
    switch (account.next.kind) {
      case 'session':
        this.signedIn = account;
        return this.answer<LoginOutcome>({ kind: 'session' });
      case 'enrollment':
        return this.answer<LoginOutcome>({ kind: 'enrollment_required' });
      case 'recovery':
        return this.answer<LoginOutcome>({ kind: 'recovery_required' });
      case 'mfa': {
        const token = crypto.randomUUID();
        this.challenges.set(token, { account, expiresAt: Date.now() + CHALLENGE_LIFETIME_MS });
        return this.answer<LoginOutcome>({
          kind: 'mfa_required',
          challenge: { token, methods: account.next.methods },
        });
      }
    }
  }

  verifyOwnerFactor(challenge: string, proof: FactorProof): Observable<void> {
    const pending = this.live(challenge);
    if (!pending) return this.fail({ kind: 'not_found', status: 404 });
    const next = pending.account.next;
    const offered = next.kind === 'mfa' && next.methods.includes(proof.method);
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
