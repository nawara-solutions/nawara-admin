import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { CompanyId } from '../context/scope.model';
import { ServiceInventory } from './core-service.model';

/**
 * Frontend contract of the owner's Services & health inventory (P8-S2), shared by `/services` and the Company
 * Overview's card, so they cannot disagree. Core status 🔴 (CF-06): no live health read exists; the infrastructure
 * probes are never called from the browser, so there is no HTTP adapter. Read only; nothing polls.
 */
export abstract class ServiceInventoryGateway {
  abstract inventory(company: CompanyId): Observable<ServiceInventory>;
}

/** Every non-demo build: not available (never a demo record, never a request). */
export class UnavailableServiceInventoryGateway extends ServiceInventoryGateway {
  inventory(): Observable<ServiceInventory> {
    return throwError(adapterUnavailable);
  }
}
