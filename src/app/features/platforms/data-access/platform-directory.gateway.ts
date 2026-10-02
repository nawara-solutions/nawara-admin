import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';

/**
 * Frontend contract for the Platform directory. The Company id is always explicit.
 *
 * Core status 🔴: no human route lists a Company's Platforms with their counts (CF-02, CF-03, CF-11). No HTTP adapter
 * exists, and none may be written against an invented endpoint.
 */
export abstract class PlatformDirectoryGateway {
  abstract list(company: CompanyId): Observable<readonly PlatformDirectoryEntry[]>;
}

/** Every non-demo build: there is no Core contract to call, so the directory is unavailable (never mock data). */
export class UnavailablePlatformDirectoryGateway extends PlatformDirectoryGateway {
  list(): Observable<readonly PlatformDirectoryEntry[]> {
    return throwError(adapterUnavailable);
  }
}
