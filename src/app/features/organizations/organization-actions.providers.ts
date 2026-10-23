import { Provider } from '@angular/core';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import {
  CreateAdminInvitationAction,
  RevokeAdminInvitationAction,
} from './application/admin-invitation.actions';
import { AdminInvitationsFacade } from './application/admin-invitations.facade';
import { CreateOrganizationAction } from './application/create-organization.action';
import { EditOrganizationAction } from './application/edit-organization.action';
import {
  AdminInvitationGateway,
  UnavailableAdminInvitationGateway,
} from './data-access/admin-invitation.gateway';
import {
  OrganizationCommandGateway,
  UnavailableOrganizationCommandGateway,
} from './data-access/organization-command.gateway';

/**
 * The providers of the Organization actions for the Organization routes: the command, admin-invitation and step-up
 * gateways (mock adapters in a demo build, `unavailable` otherwise), "Create organization" and "Edit details". The
 * invitation facade and actions belong to the detail route (`ADMIN_INVITATION_PROVIDERS`).
 */
export async function organizationActionProviders(
  environment: AppEnvironment,
): Promise<Provider[]> {
  const [commands, invitations, stepUp] = await Promise.all([
    adapterProviders(environment, 'organizationCommands', [
      { provide: OrganizationCommandGateway, useClass: UnavailableOrganizationCommandGateway },
    ]),
    adapterProviders(environment, 'adminInvitations', [
      { provide: AdminInvitationGateway, useClass: UnavailableAdminInvitationGateway },
    ]),
    adapterProviders(environment, 'stepUp', [
      { provide: StepUpGateway, useClass: UnavailableStepUpGateway },
    ]),
  ]);
  return [...commands, ...invitations, ...stepUp, CreateOrganizationAction, EditOrganizationAction];
}

/** The detail route's invitation state and actions (they follow that page's Organization). */
export const ADMIN_INVITATION_PROVIDERS: readonly Provider[] = [
  AdminInvitationsFacade,
  CreateAdminInvitationAction,
  RevokeAdminInvitationAction,
];
