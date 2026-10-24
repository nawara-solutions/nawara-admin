import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';

/**
 * The Company profile Settings shows (P9-S3): only what Admin already knows of the Company, nothing Core does not
 * define. No contact, address, legal identity, billing detail or branding exists here.
 */
export interface CompanySettings {
  readonly company: { readonly id: CompanyId; readonly name: string };
  readonly platformCount: number;
}

/**
 * Frontend contract of Company settings (P9-S3), read only. Core status: no human route reads or changes the Company
 * profile (CF-02, CF-49), so there is no HTTP adapter and no command.
 */
export abstract class CompanySettingsGateway {
  abstract load(company: CompanyId): Observable<CompanySettings>;
}

/** Every non-demo build: not available (never a demo record, never a request). */
export class UnavailableCompanySettingsGateway extends CompanySettingsGateway {
  load(): Observable<CompanySettings> {
    return throwError(adapterUnavailable);
  }
}
