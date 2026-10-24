import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { grantsOf } from '../../../demo/world/selectors';
import { ReleaseInformation } from '../domain/release-information.model';
import { ReleaseInformationGateway } from './release-information.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type ReleasesDemoScenario = 'normal' | 'error';

export const RELEASES_DEMO_SCENARIO = new InjectionToken<ReleasesDemoScenario>(
  'RELEASES_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** The documented standing of each Release capability for Admin; no release, version or deployment of any kind. */
export const DOCUMENTED_RELEASE_INFORMATION: ReleaseInformation = {
  capabilities: [
    { capability: 'catalog', status: 'notAvailable' },
    { capability: 'publish', status: 'ciOnly' },
    { capability: 'withdraw', status: 'notInAdmin' },
    { capability: 'minimumVersion', status: 'notInAdmin' },
  ],
};

/**
 * Mock adapter (demo builds only): the documented information, for the Company owner only (no session `401`, anyone
 * else `403`, an operator included whatever their Platform assignments; another Company the collapsed `404`). No
 * request, no command.
 */
export class MockReleaseInformationGateway extends ReleaseInformationGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(RELEASES_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  information(company: CompanyId): Observable<ReleaseInformation> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail({ kind: 'forbidden', code: 'forbidden', status: 403 });
      if (company !== world.company.id) return this.fail({ kind: 'not_found', status: 404 });
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      return of(DOCUMENTED_RELEASE_INFORMATION).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_RELEASE_INFORMATION_PROVIDERS: readonly Provider[] = [
  { provide: ReleaseInformationGateway, useClass: MockReleaseInformationGateway },
];
