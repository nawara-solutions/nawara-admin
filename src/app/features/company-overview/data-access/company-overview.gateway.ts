import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { CompanyId } from '../../../core/context/scope.model';
import { CompanyOverview } from '../domain/company-overview.model';

/**
 * Frontend contract for the Company Overview (docs/ARCHITECTURE.md §3). The Company id is always explicit.
 *
 * Core status 🔴 for every aggregate (docs/CORE-INTEGRATION.md §7): no HTTP adapter exists, and none may be written
 * against an invented endpoint.
 */
export abstract class CompanyOverviewGateway {
  abstract load(company: CompanyId): Observable<CompanyOverview>;
}

/** Every non-demo build: there is no Core contract to call, so the overview is unavailable (never mock data). */
export class UnavailableCompanyOverviewGateway extends CompanyOverviewGateway {
  load(): Observable<CompanyOverview> {
    return throwError(adapterUnavailable);
  }
}
