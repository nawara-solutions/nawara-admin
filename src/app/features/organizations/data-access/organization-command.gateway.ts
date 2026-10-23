import { Observable, throwError } from 'rxjs';
import { CommandOptions } from '../../../core/actions/command-options';
import { OrganizationId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import {
  CreateOrganizationRequest,
  CreatedOrganization,
} from '../domain/create-organization.model';
import { OrganizationPatch, UpdatedOrganization } from '../domain/edit-organization.model';

/**
 * Frontend contract for Organization commands, both source-verified (P3b-0; docs/CORE-INTEGRATION.md §5):
 * - `POST /organization/admin/organizations`: the owner's or an assigned operator's bearer, `x-step-up-token` for
 *   `organization.create`, a required `Idempotency-Key`;
 * - `PATCH /organization/admin/organizations/:id`: the same callers, at least one editable field, no step-up, no key and
 *   no version.
 * Writes are refused (`409 not_authoritative`) until the organization-service cutover. No HTTP adapter is authorized
 * yet: production builds bind the unavailable adapter.
 */
export abstract class OrganizationCommandGateway {
  /** Whether this build can send the commands at all (the UI shows the actions disabled otherwise). */
  abstract readonly available: boolean;
  abstract create(
    request: CreateOrganizationRequest,
    options: CommandOptions,
  ): Observable<CreatedOrganization>;
  /** Only the changed fields (`patchFrom`), never an immutable one. */
  abstract update(
    organization: OrganizationId,
    patch: OrganizationPatch,
  ): Observable<UpdatedOrganization>;
}

/** Every non-demo build: no Core command is wired, so nothing is ever sent. */
export class UnavailableOrganizationCommandGateway extends OrganizationCommandGateway {
  readonly available = false;

  create(): Observable<CreatedOrganization> {
    return throwError(adapterUnavailable);
  }

  update(): Observable<UpdatedOrganization> {
    return throwError(adapterUnavailable);
  }
}
