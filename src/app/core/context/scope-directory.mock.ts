import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { AppError } from '../errors/app-error';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import { DEMO_COMPANY_DIRECTORY } from './scope-directory.fixtures';
import { CompanyDirectory, CompanyId } from './scope.model';

/** Simulated network latency of the demo adapters, in milliseconds. */
export const DEMO_LATENCY_MS = new InjectionToken<number>('DEMO_LATENCY_MS', {
  factory: () => 300,
});

/**
 * Mock adapter (demo builds only). A Company other than the demo one answers like Core's collapsed `404`: unknown and
 * not yours are indistinguishable.
 */
export class MockScopeDirectoryGateway extends ScopeDirectoryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);

  companyDirectory(company: CompanyId): Observable<CompanyDirectory> {
    if (company !== DEMO_COMPANY_DIRECTORY.company.id) {
      const notFound: AppError = { kind: 'not_found', status: 404 };
      return throwError(() => notFound).pipe(delay(this.latency));
    }
    return of(DEMO_COMPANY_DIRECTORY).pipe(delay(this.latency));
  }
}

export const MOCK_SCOPE_DIRECTORY_PROVIDERS: readonly Provider[] = [
  { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
];
