import { Observable, throwError } from 'rxjs';
import { PlatformId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformDashboard } from '../domain/platform-dashboard.model';

/**
 * Frontend contract for one Platform's dashboard (docs/ARCHITECTURE.md §3). The Platform id is always explicit.
 *
 * Core status 🔴 for every aggregate (docs/CORE-INTEGRATION.md §7, CF-02, CF-03, CF-11, CF-13, CF-04): no HTTP adapter
 * exists, and none may be written against an invented endpoint. A Platform the caller may not see answers like Core's
 * collapsed `404`: unknown and not yours are the same.
 */
export abstract class PlatformDashboardGateway {
  abstract load(platform: PlatformId): Observable<PlatformDashboard>;
}

/** Every non-demo build: there is no Core contract to call, so the dashboard is unavailable (never mock data). */
export class UnavailablePlatformDashboardGateway extends PlatformDashboardGateway {
  load(): Observable<PlatformDashboard> {
    return throwError(adapterUnavailable);
  }
}
