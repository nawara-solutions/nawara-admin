import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { CompanyDirectory, CompanyId, PlatformId, PlatformRef } from './scope.model';

/**
 * Frontend contract for the Company's own record and its Platforms (docs/ARCHITECTURE.md §3, §7).
 *
 * Core status 🔴: no human route reads a Company or lists its Platforms (organization-service lists are service-token
 * only; follow-up CF-02). Only a mock adapter exists, in demo builds.
 */
export abstract class ScopeDirectoryGateway {
  abstract companyDirectory(company: CompanyId): Observable<CompanyDirectory>;
  /** Names of the Platforms an operator is assigned to (the ids come from grants), in the order given. */
  abstract assignedPlatforms(ids: readonly PlatformId[]): Observable<readonly PlatformRef[]>;
}

/** Every non-demo build: there is no Core contract to call, so the directory is unavailable (never mock data). */
export class UnavailableScopeDirectoryGateway extends ScopeDirectoryGateway {
  companyDirectory(): Observable<CompanyDirectory> {
    return throwError(adapterUnavailable);
  }

  assignedPlatforms(): Observable<readonly PlatformRef[]> {
    return throwError(adapterUnavailable);
  }
}
