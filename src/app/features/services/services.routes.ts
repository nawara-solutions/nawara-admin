import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import {
  ServiceInventoryGateway,
  UnavailableServiceInventoryGateway,
} from '../../core/core-services/service-inventory.gateway';
import { ServicesFacade } from './application/services.facade';

/**
 * Services & health (`/services`; P8-S2), company scope, the owner only (the shell route's capability guard covers
 * direct URLs). The shared inventory gateway is bound here as on the Company Overview (docs/ARCHITECTURE.md §3): the
 * mock adapter in a demo build, the `unavailable` adapter otherwise.
 */
export async function loadServicesRoutes(environment: AppEnvironment): Promise<Routes> {
  const services = await adapterProviders(environment, 'services', [
    { provide: ServiceInventoryGateway, useClass: UnavailableServiceInventoryGateway },
  ]);
  return [
    {
      path: '',
      providers: [...services, ServicesFacade],
      loadComponent: () => import('./pages/services.page').then((m) => m.ServicesPage),
    },
  ];
}
