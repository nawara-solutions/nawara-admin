import { Observable, throwError } from 'rxjs';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import {
  OrganizationCommercial,
  PlatformOrganizationsCommercial,
} from '../domain/organization-commercial.model';

/**
 * Frontend contract for Organizations' commercial facts (Billing, Payment, the Platform's assisted-payments policy),
 * read by the Company owner only; the UI never calls it for an operator. Core status 🟡: no staff or owner read route
 * before Core V2 A10/A11; a PROVISIONAL mock contract, in demo builds only.
 */
export abstract class OrganizationCommercialGateway {
  abstract list(platform: PlatformId): Observable<PlatformOrganizationsCommercial>;
  abstract load(organization: OrganizationId): Observable<OrganizationCommercial>;
}

/** Every non-demo build: there is no Core contract to call (never mock data). */
export class UnavailableOrganizationCommercialGateway extends OrganizationCommercialGateway {
  list(): Observable<PlatformOrganizationsCommercial> {
    return throwError(adapterUnavailable);
  }

  load(): Observable<OrganizationCommercial> {
    return throwError(adapterUnavailable);
  }
}
