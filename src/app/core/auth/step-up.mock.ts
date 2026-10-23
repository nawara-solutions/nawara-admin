import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { NW_CLOCK } from '../../shared/format/clock';
import { DEMO_TOTP_CODE } from './auth.fixtures';
import { DemoAuthState } from './auth.mock-state';
import { FactorProof } from './auth.model';
import { StepUpGateway, StepUpGrant, StepUpPurpose } from './step-up.gateway';

/** Which answer the mock gives, so every state can be reviewed (§3). Demo builds use `normal`. */
export type StepUpDemoScenario = 'normal' | 'rateLimited' | 'unavailable';

export const STEP_UP_DEMO_SCENARIO = new InjectionToken<StepUpDemoScenario>(
  'STEP_UP_DEMO_SCENARIO',
  {
    factory: () => 'normal',
  },
);

/**
 * Lifetime of a simulated grant. Core's grants last at most 15 minutes (docs/CORE-INTEGRATION.md §4); the demo uses
 * 5 minutes, a provisional mock policy, not Core's value.
 */
export const DEMO_STEP_UP_LIFETIME_MS = 5 * 60_000;

/**
 * Mock adapter (demo builds only): SIMULATED owner verification. It accepts the demo code (or the simulated passkey) for
 * the signed-in owner and issues an opaque, single-use, purpose- and user-bound grant that only the demo mocks accept
 * (`DemoAuthState.consumeStepUp`). Nothing is asked of, or issued by, Nawara Core. An operator is refused, as Core has no
 * operator step-up (CF-08). A wrong code answers the generic `401` (no Core code is invented).
 */
export class MockStepUpGateway extends StepUpGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(STEP_UP_DEMO_SCENARIO);
  private readonly state = inject(DemoAuthState);
  private readonly now = inject(NW_CLOCK);

  obtain(purpose: StepUpPurpose, proof: FactorProof): Observable<StepUpGrant> {
    const fail = (error: AppError) =>
      timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    const signedIn = this.state.signedIn();
    if (signedIn === null) return fail({ kind: 'unauthenticated', status: 401 });
    if (signedIn.identity.adminTier !== 'owner')
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
    if (this.scenario === 'rateLimited')
      return fail({ kind: 'rate_limited', retryAfterSeconds: 30, status: 429 });
    if (this.scenario === 'unavailable') return fail({ kind: 'unavailable', status: 503 });
    const valid = proof.method === 'passkey' || proof.code.replace(/\s/g, '') === DEMO_TOTP_CODE;
    if (!valid) return fail({ kind: 'unauthenticated', status: 401 });
    const expiresAt = this.now() + DEMO_STEP_UP_LIFETIME_MS;
    const token = this.state.issueStepUp(
      purpose,
      signedIn.identity.userId,
      expiresAt,
      proof.method === 'passkey' ? 'webauthn' : 'totp',
    );
    return of({ token, expiresAt: new Date(expiresAt).toISOString() }).pipe(delay(this.latency));
  }
}

export const MOCK_STEP_UP_PROVIDERS: readonly Provider[] = [
  { provide: StepUpGateway, useClass: MockStepUpGateway },
];
