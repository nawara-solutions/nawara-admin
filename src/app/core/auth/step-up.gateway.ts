import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { FactorProof } from './auth.model';

/**
 * The purposes a step-up is obtained for: Core's own (auth-service `step-up.service.ts` `STEP_UP_METHODS`), and only
 * those a built action uses (docs/CORE-INTEGRATION.md §4, §5): `platform.create` for `POST /organization/admin/platforms`,
 * `organization.create` for `POST /organization/admin/organizations`, `admin_invitation.create` / `.revoke` for the
 * organization-admin invitations of `/auth/organizations/:id/admin-invitations`, and `organization.admin.grant` /
 * `.revoke` for the organization-admin role of `…/memberships/:id/admin` (P5-S3b), those four factor only (TOTP or a
 * passkey, never the secret key); and `platform_assignment.grant` / `.revoke` for an operator's Platform assignments
 * (P6-S2) and `operator.create` for `POST /auth/admin/operators` (P6-S4), which Core lets the owner prove with TOTP, a
 * passkey OR the secret key; and `owner.factor.enroll` for confirming an added authenticator
 * (`POST /auth/admin/factors/totp/confirm`, P9-S4b), `owner.secret_key.rotate` for creating a new secret key
 * (`POST /auth/admin/secret-key/rotate`, P9-S4c) and `owner.factor.remove` for removing a factor
 * (`DELETE /auth/admin/factors/:id`, P9-S4d), all three factor only. Admin's dialogs offer the
 * authenticator code only today (a shared factor chooser is a separate work item); the contract does not narrow Core's
 * factors. Machine values.
 */
export type StepUpPurpose =
  | 'platform.create'
  | 'organization.create'
  | 'admin_invitation.create'
  | 'admin_invitation.revoke'
  | 'organization.admin.grant'
  | 'organization.admin.revoke'
  | 'platform_assignment.grant'
  | 'platform_assignment.revoke'
  | 'operator.create'
  | 'owner.factor.enroll'
  | 'owner.secret_key.rotate'
  | 'owner.factor.remove';

/** A step-up grant: sent once, immediately, with the one operation of its purpose; never stored. */
export interface StepUpGrant {
  readonly token: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly expiresAt: string;
}

/**
 * Frontend contract for the owner's step-up (Core: `POST /auth/admin/step-up` → a single-use, session- and
 * purpose-bound token, ≤ 15 minutes, sent as `x-step-up-token`; docs/CORE-INTEGRATION.md §4). Owners only: operator
 * step-up does not exist in Core (CF-08). No HTTP adapter in this slice.
 */
export abstract class StepUpGateway {
  abstract obtain(purpose: StepUpPurpose, proof: FactorProof): Observable<StepUpGrant>;
}

/** Every non-demo build: no step-up is wired, so nothing can be verified (never a simulated grant). */
export class UnavailableStepUpGateway extends StepUpGateway {
  obtain(): Observable<StepUpGrant> {
    return throwError(adapterUnavailable);
  }
}
