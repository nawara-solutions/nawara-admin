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

/**
 * Test-only: the Organization actions ("Create organization", "Edit details") and their gateways, for a spec that
 * renders an Organization page (the spec provides the scope context and the read gateway). `demo`: the mock adapters;
 * otherwise the unavailable ones, as in a production build.
 */
export function organizationActionTestProviders(demo: boolean): Provider[] {
  return [
    {
      provide: OrganizationCommandGateway,
      useClass: demo ? MockOrganizationCommandGateway : UnavailableOrganizationCommandGateway,
    },
    { provide: StepUpGateway, useClass: demo ? MockStepUpGateway : UnavailableStepUpGateway },
    CreateOrganizationAction,
    EditOrganizationAction,
  ];
}
