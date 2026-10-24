import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { AccountSecurity, AccountSecurityGateway } from './account-security.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type AccountSecurityDemoScenario = 'normal' | 'error';

export const ACCOUNT_SECURITY_DEMO_SCENARIO = new InjectionToken<AccountSecurityDemoScenario>(
  'ACCOUNT_SECURITY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Mock adapter (demo builds only), like Core's `GET /auth/admin/factors`: the signed-in owner's own simulated factors
 * from `DemoAuthState` (never the demo world), metadata only. No session `401`; anyone but an owner `403` (an operator
 * included, whatever their Platform assignments). No request, no command. A copy is returned, so nothing outside can
 * change the simulated records.
 */
export class MockAccountSecurityGateway extends AccountSecurityGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ACCOUNT_SECURITY_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);

  load(): Observable<AccountSecurity> {
    return defer(() => {
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (signedIn.identity.adminTier !== 'owner')
        return this.fail({ kind: 'forbidden', code: 'forbidden', status: 403 });
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const factors = (this.auth.ownerFactors.get(signedIn.identity.userId) ?? []).map(
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

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_ACCOUNT_SECURITY_PROVIDERS: readonly Provider[] = [
  { provide: AccountSecurityGateway, useClass: MockAccountSecurityGateway },
];
