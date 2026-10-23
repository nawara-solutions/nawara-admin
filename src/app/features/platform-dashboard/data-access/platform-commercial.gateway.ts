import { Observable, throwError } from 'rxjs';
import { PlatformId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformCommercial } from '../domain/platform-commercial.model';

/**
 * Frontend contract for one Platform's commercial facts (Billing and Payment; docs/ARCHITECTURE.md §3), read by the
 * owner only. Core status 🟡: no staff or owner read route before Core V2 A10/A11; only a mock exists, in demo builds.
 */
export abstract class PlatformCommercialGateway {
  abstract load(platform: PlatformId): Observable<PlatformCommercial>;
}

/** Every non-demo build: there is no Core contract to call (never mock data). */
export class UnavailablePlatformCommercialGateway extends PlatformCommercialGateway {
  load(): Observable<PlatformCommercial> {
    return throwError(adapterUnavailable);
  }
}
