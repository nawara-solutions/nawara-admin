import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
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
  ServiceHealthGateway,
  UnavailableServiceHealthGateway,
} from './data-access/service-health.gateway';

/**
 * Company Overview routes. The three gateways (overview, commercial summary, service health) are bound here
 * (docs/ARCHITECTURE.md §3): mock adapters in a demo build, `unavailable` adapters otherwise.
 */
export async function loadCompanyOverviewRoutes(environment: AppEnvironment): Promise<Routes> {
  const [overview, commercial, health] = await Promise.all([
    adapterProviders(environment, 'companyOverview', [
      { provide: CompanyOverviewGateway, useClass: UnavailableCompanyOverviewGateway },
    ]),
    adapterProviders(environment, 'commercialSummary', [
      { provide: CommercialSummaryGateway, useClass: UnavailableCommercialSummaryGateway },
    ]),
    adapterProviders(environment, 'serviceHealth', [
      { provide: ServiceHealthGateway, useClass: UnavailableServiceHealthGateway },
    ]),
  ]);
  return [
    {
      path: '',
      providers: [...overview, ...commercial, ...health, CompanyOverviewFacade],
      loadComponent: () =>
        import('./pages/company-overview.page').then((m) => m.CompanyOverviewPage),
    },
  ];
}
