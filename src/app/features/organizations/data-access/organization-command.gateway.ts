import { Observable, throwError } from 'rxjs';
import { CommandOptions } from '../../../core/actions/command-options';
import { adapterUnavailable } from '../../../core/errors/app-error';
import {
  CreateOrganizationRequest,
  CreatedOrganization,
} from '../domain/create-organization.model';

/**
 * Frontend contract for Organization commands. Core's `POST /organization/admin/organizations` is source-verified
 * (P3b-0): the owner's or an assigned operator's bearer, `x-step-up-token` for `organization.create`, a required
 * `Idempotency-Key`; writes are refused (`409 not_authoritative`) until the organization-service cutover. No HTTP adapter
 * is authorized in this slice: production builds bind the unavailable adapter.
 */
export abstract class OrganizationCommandGateway {
  /** Whether this build can send the command at all (the UI shows the action disabled otherwise). */
  abstract readonly available: boolean;
  abstract create(
    request: CreateOrganizationRequest,
    options: CommandOptions,
  ): Observable<CreatedOrganization>;
}

/** Every non-demo build: no Core command is wired, so nothing is ever sent. */
export class UnavailableOrganizationCommandGateway extends OrganizationCommandGateway {
  readonly available = false;

  create(): Observable<CreatedOrganization> {
    return throwError(adapterUnavailable);
  }
}
