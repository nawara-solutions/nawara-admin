import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { createPlatformProviders } from '../platforms/create-platform.providers';
import { CompanyOverviewFacade } from './application/company-overview.facade';
import {
  CommercialSummaryGateway,
  UnavailableCommercialSummaryGateway,
} from './data-access/commercial-summary.gateway';
import {
  CompanyOverviewGateway,
  UnavailableCompanyOverviewGateway,
} from './data-access/company-overview.gateway';
import {
  ServiceInventoryGateway,
  UnavailableServiceInventoryGateway,
} from '../../core/core-services/service-inventory.gateway';

/**
 * Company Overview routes. The three gateways (overview, commercial summary, service health) are bound here
 * (docs/ARCHITECTURE.md §3): mock adapters in a demo build, `unavailable` adapters otherwise.
 */
export async function loadCompanyOverviewRoutes(environment: AppEnvironment): Promise<Routes> {
  const [overview, commercial, health, createPlatform] = await Promise.all([
    adapterProviders(environment, 'companyOverview', [
      { provide: CompanyOverviewGateway, useClass: UnavailableCompanyOverviewGateway },
    ]),
    adapterProviders(environment, 'commercialSummary', [
      { provide: CommercialSummaryGateway, useClass: UnavailableCommercialSummaryGateway },
    ]),
    adapterProviders(environment, 'services', [
      { provide: ServiceInventoryGateway, useClass: UnavailableServiceInventoryGateway },
    ]),
    createPlatformProviders(environment),
  ]);
  return [
    {
      path: '',
      providers: [...overview, ...commercial, ...health, ...createPlatform, CompanyOverviewFacade],
      loadComponent: () =>
        import('./pages/company-overview.page').then((m) => m.CompanyOverviewPage),
    },
  ];
}
