import { Provider } from '@angular/core';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import { CreateOrganizationAction } from './application/create-organization.action';
import { EditOrganizationAction } from './application/edit-organization.action';
import {
  OrganizationCommandGateway,
  UnavailableOrganizationCommandGateway,
} from './data-access/organization-command.gateway';

/**
 * The providers of the Organization actions for the Organization routes: the command and step-up gateways (mock
 * adapters in a demo build, `unavailable` otherwise), "Create organization" and "Edit details".
 */
export async function organizationActionProviders(
  environment: AppEnvironment,
): Promise<Provider[]> {
  const [commands, stepUp] = await Promise.all([
    adapterProviders(environment, 'organizationCommands', [
      { provide: OrganizationCommandGateway, useClass: UnavailableOrganizationCommandGateway },
    ]),
    adapterProviders(environment, 'stepUp', [
      { provide: StepUpGateway, useClass: UnavailableStepUpGateway },
    ]),
  ]);
  return [...commands, ...stepUp, CreateOrganizationAction, EditOrganizationAction];
}
