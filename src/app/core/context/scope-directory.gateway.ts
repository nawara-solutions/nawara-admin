import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { CompanyDirectory, CompanyId } from './scope.model';

/**
 * Frontend contract for the Company's own record and its Platforms (docs/ARCHITECTURE.md §3, §7).
 *
 * Core status 🔴: no human route reads a Company or lists its Platforms (organization-service lists are service-token
 * only; follow-up CF-02). Only a mock adapter exists, in demo builds.
 */
export abstract class ScopeDirectoryGateway {
  abstract companyDirectory(company: CompanyId): Observable<CompanyDirectory>;
}

/** Every non-demo build: there is no Core contract to call, so the directory is unavailable (never mock data). */
export class UnavailableScopeDirectoryGateway extends ScopeDirectoryGateway {
  companyDirectory(): Observable<CompanyDirectory> {
    return throwError(adapterUnavailable);
  }
}
