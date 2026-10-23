import { Observable, throwError } from 'rxjs';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { OrganizationDetail, OrganizationDirectory } from '../domain/organization.model';

/**
 * Frontend contract for a Platform's Organizations (docs/ARCHITECTURE.md §3, §7). Ids are always explicit.
 *
 * - `list`: Core status 🔴: no human route lists a Platform's Organizations (CF-02); no HTTP adapter may be written
 *   against an invented endpoint.
 * - `load`: Core has `GET /auth/admin/organizations/:id` (owner, operator), by Organization id alone; its response
 *   shape is not verified yet, so there is no HTTP adapter in this slice. The answer carries its `platformId`; the
 *   caller compares it with the Platform in the URL.
 *
 * Unknown and not-yours answer alike, like Core's collapsed `404`.
 */
export abstract class OrganizationGateway {
  abstract list(platform: PlatformId): Observable<OrganizationDirectory>;
  abstract load(organization: OrganizationId): Observable<OrganizationDetail>;
}

/** Every non-demo build: no Core contract is wired, so Organizations are unavailable (never mock data). */
export class UnavailableOrganizationGateway extends OrganizationGateway {
  list(): Observable<OrganizationDirectory> {
    return throwError(adapterUnavailable);
  }

  load(): Observable<OrganizationDetail> {
    return throwError(adapterUnavailable);
  }
}
