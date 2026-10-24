import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { OperatorSummary } from '../domain/operator.model';

/**
 * Frontend contract for the Company's operators: the directory (`list`) and one operator's account (`load`). The Company
 * id is always explicit.
 *
 * Core status 🔴 (P6-S0, Core `750eb21`): no route lists a Company's operators or reads one operator's account or
 * state. `GET /auth/admin/operators` and `GET /auth/admin/operators/:id` are described in Core's design documents only
 * (CF-03). No HTTP adapter exists, and none may be written against those routes until Core builds them.
 */
export abstract class OperatorDirectoryGateway {
  abstract list(company: CompanyId): Observable<readonly OperatorSummary[]>;
  /** One operator of the Company; an unknown one, or another Company's, is the collapsed `404`. */
  abstract load(company: CompanyId, operator: string): Observable<OperatorSummary>;
}

/** Every non-demo build: there is no Core contract to call, so the directory is unavailable (never mock data). */
export class UnavailableOperatorDirectoryGateway extends OperatorDirectoryGateway {
  list(): Observable<readonly OperatorSummary[]> {
    return throwError(adapterUnavailable);
  }

  load(): Observable<OperatorSummary> {
    return throwError(adapterUnavailable);
  }
}
