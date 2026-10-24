import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { ReleaseInformation } from '../domain/release-information.model';

/**
 * Frontend contract of the owner's Releases information (P8-S4). Core status: withdraw and minimum-version commands
 * exist for the owner (not in production) but no catalog read does (CF-05), so there is no HTTP adapter and no
 * command. Read only.
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
