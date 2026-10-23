import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables } from '../../../demo/world/records';
import {
  assignmentsOf,
  membershipTotal,
  organizationsOf,
  platformRefs,
} from '../../../demo/world/selectors';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';
import { PlatformDirectoryGateway } from './platform-directory.gateway';

/** Which answer the mock gives, so every view state can be exercised (§3). Demo builds use `normal`. */
export type PlatformDirectoryDemoScenario = 'normal' | 'partial' | 'empty' | 'error';

export const PLATFORM_DIRECTORY_DEMO_SCENARIO = new InjectionToken<PlatformDirectoryDemoScenario>(
  'PLATFORM_DIRECTORY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

const count = (value: number) => ({ status: 'available', value }) as const;

/** The directory of the demo Company, derived from the demo world's records (FICTIONAL; not a Core contract). */
export const demoPlatformDirectory = (world: DemoWorldTables): readonly PlatformDirectoryEntry[] =>
  platformRefs(world).map((platform) => ({
    platform,
    organizations: count(organizationsOf(world, platform.id).length),
    memberships: count(membershipTotal(world, organizationsOf(world, platform.id))),
    operatorAssignments: count(assignmentsOf(world, platform.id).length),
  }));

/**
 * Mock adapter (demo builds only), reading the demo world at request time, so it agrees with the Platform dashboard
 * and the Company Overview. Another Company answers like Core's collapsed `404`.
 */
export class MockPlatformDirectoryGateway extends PlatformDirectoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DIRECTORY_DEMO_SCENARIO);
  private readonly world = inject(DemoWorld);

  list(company: CompanyId): Observable<readonly PlatformDirectoryEntry[]> {
    const fail = (error: AppError) => throwError(() => error).pipe(delay(this.latency));
    const world = this.world.snapshot();
    if (company !== world.company.id) return fail({ kind: 'not_found', status: 404 });
    const directory = demoPlatformDirectory(world);
    switch (this.scenario) {
      case 'error':
        return fail({ kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 });
      case 'empty':
        return of([]).pipe(delay(this.latency));
      case 'partial':
        return of(
          directory.map((entry, i) =>
            i === 1
              ? {
                  ...entry,
                  memberships: { status: 'unavailable' } as const,
                  operatorAssignments: { status: 'unavailable' } as const,
                }
              : entry,
          ),
        ).pipe(delay(this.latency));
      case 'normal':
        return of(directory).pipe(delay(this.latency));
    }
  }
}

export const MOCK_PLATFORM_DIRECTORY_PROVIDERS: readonly Provider[] = [
  { provide: PlatformDirectoryGateway, useClass: MockPlatformDirectoryGateway },
];
