import { Observable, throwError } from 'rxjs';
import { OrganizationId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import {
  AdminInvitationList,
  CreateAdminInvitationRequest,
  CreatedAdminInvitation,
} from '../domain/admin-invitation.model';

/** What an owner's invitation command carries besides its body: the step-up, sent as `x-step-up-token`. */
export interface InvitationCommandOptions {
  readonly stepUpToken: string;
}

/**
 * Frontend contract of organization-admin invitations, Auth-owned and source-verified (P3b-S3-0; docs/CORE-INTEGRATION.md
 * §5): list (`GET`, no step-up), create (`POST`, step-up `admin_invitation.create`, `201` with the code ONCE) and revoke
 * (`POST …/revoke`, step-up `admin_invitation.revoke`, `204`). No idempotency key exists. Operators are refused by Core
 * (a collapsed `404`), so Admin never calls this for them. No HTTP adapter is authorized yet: production builds bind
 * the unavailable adapter.
 */
export abstract class AdminInvitationGateway {
  /** Whether this build can send the commands at all (the UI shows the actions disabled otherwise). */
  abstract readonly available: boolean;
  abstract list(organization: OrganizationId): Observable<AdminInvitationList>;
  abstract create(
    organization: OrganizationId,
    request: CreateAdminInvitationRequest,
    options: InvitationCommandOptions,
  ): Observable<CreatedAdminInvitation>;
  abstract revoke(
    organization: OrganizationId,
    invitationId: string,
    options: InvitationCommandOptions,
  ): Observable<void>;
}

/** Every non-demo build: nothing is wired, so nothing is ever listed or sent. */
export class UnavailableAdminInvitationGateway extends AdminInvitationGateway {
  readonly available = false;

  list(): Observable<AdminInvitationList> {
    return throwError(adapterUnavailable);
  }

  create(): Observable<CreatedAdminInvitation> {
    return throwError(adapterUnavailable);
  }

  revoke(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
