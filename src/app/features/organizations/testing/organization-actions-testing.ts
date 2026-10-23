import { Provider } from '@angular/core';
import { StepUpGateway, UnavailableStepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { CreateOrganizationAction } from '../application/create-organization.action';
import { EditOrganizationAction } from '../application/edit-organization.action';
import {
  OrganizationCommandGateway,
  UnavailableOrganizationCommandGateway,
} from '../data-access/organization-command.gateway';
import { MockOrganizationCommandGateway } from '../data-access/organization-command.mock';
import {
  AdminInvitationGateway,
  UnavailableAdminInvitationGateway,
} from '../data-access/admin-invitation.gateway';
import { MockAdminInvitationGateway } from '../data-access/admin-invitation.mock';
import { ADMIN_INVITATION_PROVIDERS } from '../organization-actions.providers';

/**
 * Test-only: the Organization actions ("Create organization", "Edit details", admin invitations) and their gateways, for a spec that
 * renders an Organization page (the spec provides the scope context and the read gateway). `demo`: the mock adapters;
 * otherwise the unavailable ones, as in a production build.
 */
export function organizationActionTestProviders(demo: boolean): Provider[] {
  return [
    {
      provide: OrganizationCommandGateway,
      useClass: demo ? MockOrganizationCommandGateway : UnavailableOrganizationCommandGateway,
    },
    {
      provide: AdminInvitationGateway,
      useClass: demo ? MockAdminInvitationGateway : UnavailableAdminInvitationGateway,
    },
    { provide: StepUpGateway, useClass: demo ? MockStepUpGateway : UnavailableStepUpGateway },
    CreateOrganizationAction,
    EditOrganizationAction,
    // Detail-route state (it needs the spec's OrganizationDetailFacade, created only when a detail page asks for it).
    ...ADMIN_INVITATION_PROVIDERS,
  ];
}
