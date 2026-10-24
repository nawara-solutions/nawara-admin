import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoWorld } from '../../demo/world/demo-world';
import { grantsOf } from '../../demo/world/selectors';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { CompanyId } from '../context/scope.model';
import { AppError } from '../errors/app-error';
import { CORE_SERVICES, ServiceInventory } from './core-service.model';
import { ServiceInventoryGateway } from './service-inventory.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type ServicesDemoScenario = 'normal' | 'error';

export const SERVICES_DEMO_SCENARIO = new InjectionToken<ServicesDemoScenario>(
  'SERVICES_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** The documented inventory: the eight services and no live health. Nothing observed, nothing invented. */
export const DOCUMENTED_SERVICE_INVENTORY: ServiceInventory = {
  services: CORE_SERVICES,
  liveHealth: 'unavailable',
};

/**
 * Mock adapter (demo builds only): the documented services, for the Company owner only (no session `401`, anyone else
 * `403`, an operator included whatever their Platform assignments; another Company the collapsed `404`). It returns
 * no status of any kind, makes no network request and never polls.
 */
export class MockServiceInventoryGateway extends ServiceInventoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(SERVICES_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  inventory(company: CompanyId): Observable<ServiceInventory> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail({ kind: 'forbidden', code: 'forbidden', status: 403 });
      if (company !== world.company.id) return this.fail({ kind: 'not_found', status: 404 });
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      return of(DOCUMENTED_SERVICE_INVENTORY).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_SERVICE_INVENTORY_PROVIDERS: readonly Provider[] = [
  { provide: ServiceInventoryGateway, useClass: MockServiceInventoryGateway },
];
