import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { AdministrativeActivity } from '../domain/activity.model';

/**
 * Frontend contract of the owner's simulated administrative activity (P8-S1). Core status (verified nawara-core
 * `8d89bed`, WP-2.1): Core's deployed owner audit read covers ONE Organization per query (≤ 31 days, cursor); Company- and
 * Platform-scoped reads exist in development only, not deployed (AUD-03 `GET /audit/owner/company/records`, owner;
 * AUD-04 `GET /audit/operator/platforms/:platformId/records`, assigned operator; `audit-service/src/owner/
 * scoped-query.controller.ts:44`, `:58`; CF-04). This simulated read is not that contract: there is no HTTP adapter, and
 * integrating one is not authorized. Read only; no export.
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
