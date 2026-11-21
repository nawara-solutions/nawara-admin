import { Provider } from '@angular/core';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { EditPlatformAction } from './application/edit-platform.action';
import {
  PlatformCommandGateway,
  UnavailablePlatformCommandGateway,
} from './data-access/platform-command.gateway';

/**
 * The providers of "Edit name" for a route that offers it (the Platform settings page): the command gateway (the mock
 * adapter in a demo build, `unavailable` otherwise) and the action. No step-up gateway: Core requires none.
 */
export async function editPlatformProviders(environment: AppEnvironment): Promise<Provider[]> {
  const commands = await adapterProviders(environment, 'platformCommands', [
    { provide: PlatformCommandGateway, useClass: UnavailablePlatformCommandGateway },
  ]);
  return [...commands, EditPlatformAction];
}
