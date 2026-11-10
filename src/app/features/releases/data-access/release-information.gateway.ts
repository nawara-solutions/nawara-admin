import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { ReleaseInformation } from '../domain/release-information.model';

/**
 * Frontend contract of the owner's Releases information (P8-S4). Core status (verified nawara-core `8d89bed`, WP-2.1): the
 * owner's catalog reads exist (REL-01 products and components, REL-02 a component's releases, REL-03 compatibility-policy
 * history; `release-service/src/admin/read.controller.ts:61-96`, CF-05) beside the withdraw and minimum-version commands,
 * but Release is not in production (MOVE V3), so none is production-available. Admin has no HTTP adapter and no command;
 * integrating the reads is not authorized. Read only.
 */
export abstract class ReleaseInformationGateway {
  abstract information(company: CompanyId): Observable<ReleaseInformation>;
}

/** Every non-demo build: not available (never a demo record, never a request). */
export class UnavailableReleaseInformationGateway extends ReleaseInformationGateway {
  information(): Observable<ReleaseInformation> {
    return throwError(adapterUnavailable);
  }
}
