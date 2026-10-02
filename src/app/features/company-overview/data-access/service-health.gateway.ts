import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { ServiceHealthSummary } from '../domain/service-health.model';

/**
 * Frontend contract for the Core service-health summary (docs/ARCHITECTURE.md §3). Core status 🟡 (CF-06, V2 A12):
 * the per-service `/health` and `/ready` probes are infrastructure endpoints, not an operator API, so they are not
 * called from the browser and there is no HTTP adapter.
 */
export abstract class ServiceHealthGateway {
  abstract load(): Observable<ServiceHealthSummary>;
}

/** Every non-demo build: no Core contract to call, so service health is unavailable (never mock data). */
export class UnavailableServiceHealthGateway extends ServiceHealthGateway {
  load(): Observable<ServiceHealthSummary> {
    return throwError(adapterUnavailable);
  }
}
