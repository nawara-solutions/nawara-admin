import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { LicensesOverview } from '../domain/licenses.model';

/**
 * Frontend contract of the Company's Licenses & entitlements overview (P7-S1). Core status 🟡: Billing has no owner read
 * of subscriptions or entitlements before Core V2 A10 (proposed CF-36, CF-37), so there is no HTTP adapter. Read only:
 * no commercial change exists in Core V1 (ADR-0050 D12), and none is offered.
 */
export abstract class LicensesGateway {
  abstract overview(company: CompanyId): Observable<LicensesOverview>;
}

/** Every non-demo build: no Core contract to call, so the overview is unavailable (never mock data, never a request). */
export class UnavailableLicensesGateway extends LicensesGateway {
  overview(): Observable<LicensesOverview> {
    return throwError(adapterUnavailable);
  }
}
