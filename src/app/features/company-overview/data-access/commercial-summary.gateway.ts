import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { CommercialSummary } from '../domain/commercial-summary.model';

/**
 * Frontend contract for the Company's commercial summary (docs/ARCHITECTURE.md §3). Core status 🟡: no staff API in
 * Billing or Payment before Core V2 A10/A11, so there is no HTTP adapter.
 */
export abstract class CommercialSummaryGateway {
  abstract load(company: CompanyId): Observable<CommercialSummary>;
}

/** Every non-demo build: no Core contract to call, so the summary is unavailable (never mock data). */
export class UnavailableCommercialSummaryGateway extends CommercialSummaryGateway {
  load(): Observable<CommercialSummary> {
    return throwError(adapterUnavailable);
  }
}
