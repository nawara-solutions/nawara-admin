import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { AdministrativeActivity } from '../domain/activity.model';

/**
 * Frontend contract of the owner's simulated administrative activity (P8-S1). Core status: Core's owner audit read
 * exists for ONE Organization per query (≤ 31 days, cursor) but there is no Company- or Platform-wide read (CF-04), and
 * this simulated read is not that contract; there is no HTTP adapter. Read only; no export.
 */
export abstract class ActivityGateway {
  abstract activity(company: CompanyId): Observable<AdministrativeActivity>;
}

/** Every non-demo build: nothing to call, so the activity is unavailable (never demo records, never a request). */
export class UnavailableActivityGateway extends ActivityGateway {
  activity(): Observable<AdministrativeActivity> {
    return throwError(adapterUnavailable);
  }
}
