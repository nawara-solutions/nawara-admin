import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { DemoWorld } from '../../demo/world/demo-world';
import { companyDirectoryOf, platformRefOf } from '../../demo/world/selectors';
import { AppError } from '../errors/app-error';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import { CompanyDirectory, CompanyId, PlatformId, PlatformRef } from './scope.model';

/** Simulated network latency of the demo adapters, in milliseconds. */
export const DEMO_LATENCY_MS = new InjectionToken<number>('DEMO_LATENCY_MS', {
  factory: () => 300,
});

/**
 * Mock adapter (demo builds only), reading the demo world's Company and Platforms. A Company other than the demo one
 * answers like Core's collapsed `404`: unknown and not yours are indistinguishable.
 */
export class MockScopeDirectoryGateway extends ScopeDirectoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly world = inject(DemoWorld);

  companyDirectory(company: CompanyId): Observable<CompanyDirectory> {
    const world = this.world.snapshot();
    if (company !== world.company.id) {
      const notFound: AppError = { kind: 'not_found', status: 404 };
      return throwError(() => notFound).pipe(delay(this.latency));
    }
    return of(companyDirectoryOf(world)).pipe(delay(this.latency));
  }

  /** Unknown ids are left out, as a Platform the caller may not see would be. */
  assignedPlatforms(ids: readonly PlatformId[]): Observable<readonly PlatformRef[]> {
    const world = this.world.snapshot();
    const known = ids.flatMap((id) => platformRefOf(world, id) ?? []);
    return of(known).pipe(delay(this.latency));
  }
}

export const MOCK_SCOPE_DIRECTORY_PROVIDERS: readonly Provider[] = [
  { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
];
