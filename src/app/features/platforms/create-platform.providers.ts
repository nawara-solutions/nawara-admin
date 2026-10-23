import { Provider } from '@angular/core';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import { CreatePlatformAction } from './application/create-platform.action';
import {
  PlatformCommandGateway,
  UnavailablePlatformCommandGateway,
} from './data-access/platform-command.gateway';

/**
 * The providers of "Create platform" for a route that offers it (the Platform directory, the Company Overview): the
 * command and step-up gateways (mock adapters in a demo build, `unavailable` otherwise) and the action itself. Public,
 * like the feature's routes file: other features bind the action through it, never through its internals.
 */
export async function createPlatformProviders(environment: AppEnvironment): Promise<Provider[]> {
  const [commands, stepUp] = await Promise.all([
    adapterProviders(environment, 'platformCommands', [
      { provide: PlatformCommandGateway, useClass: UnavailablePlatformCommandGateway },
    ]),
    adapterProviders(environment, 'stepUp', [
      { provide: StepUpGateway, useClass: UnavailableStepUpGateway },
    ]),
  ]);
  return [...commands, ...stepUp, CreatePlatformAction];
}
