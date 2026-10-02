import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { DEMO_COMPANY_ID } from '../../../core/context/scope-directory.fixtures';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';
import { DEMO_PLATFORM_DIRECTORY } from './platform-directory.fixtures';
import { PlatformDirectoryGateway } from './platform-directory.gateway';

/** Which answer the mock gives, so every view state can be exercised (§3). Demo builds use `normal`. */
export type PlatformDirectoryDemoScenario = 'normal' | 'partial' | 'empty' | 'error';

export const PLATFORM_DIRECTORY_DEMO_SCENARIO = new InjectionToken<PlatformDirectoryDemoScenario>(
  'PLATFORM_DIRECTORY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** Mock adapter (demo builds only). Another Company answers like Core's collapsed `404`. */
export class MockPlatformDirectoryGateway extends PlatformDirectoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_DIRECTORY_DEMO_SCENARIO);

  list(company: CompanyId): Observable<readonly PlatformDirectoryEntry[]> {
    const fail = (error: AppError) => throwError(() => error).pipe(delay(this.latency));
    if (company !== DEMO_COMPANY_ID) return fail({ kind: 'not_found', status: 404 });
    switch (this.scenario) {
      case 'error':
        return fail({ kind: 'unavailable', code: 'hierarchy_unavailable', status: 503 });
      case 'empty':
        return of([]).pipe(delay(this.latency));
      case 'partial':
        return of(
          DEMO_PLATFORM_DIRECTORY.map((entry, i) =>
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
        return of(DEMO_PLATFORM_DIRECTORY).pipe(delay(this.latency));
    }
  }
}

export const MOCK_PLATFORM_DIRECTORY_PROVIDERS: readonly Provider[] = [
  { provide: PlatformDirectoryGateway, useClass: MockPlatformDirectoryGateway },
];
