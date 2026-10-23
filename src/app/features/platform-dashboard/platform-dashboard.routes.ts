import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { PlatformDashboardFacade } from './application/platform-dashboard.facade';
import {
  PlatformCommercialGateway,
  UnavailablePlatformCommercialGateway,
} from './data-access/platform-commercial.gateway';
import {
  PlatformDashboardGateway,
  UnavailablePlatformDashboardGateway,
} from './data-access/platform-dashboard.gateway';

/**
 * Platform dashboard routes (`/platforms/:platformId`, platform scope). The two gateways (hierarchy figures, commercial
 * facts) are bound here (docs/ARCHITECTURE.md §3): mock adapters in a demo build, `unavailable` adapters otherwise.
 * The route is reused when the Platform changes; the facade follows the URL.
 */
export async function loadPlatformDashboardRoutes(environment: AppEnvironment): Promise<Routes> {
  const [dashboard, commercial] = await Promise.all([
    adapterProviders(environment, 'platformDashboard', [
      { provide: PlatformDashboardGateway, useClass: UnavailablePlatformDashboardGateway },
    ]),
    adapterProviders(environment, 'platformCommercial', [
      { provide: PlatformCommercialGateway, useClass: UnavailablePlatformCommercialGateway },
    ]),
  ]);
  return [
    {
      path: '',
      providers: [...dashboard, ...commercial, PlatformDashboardFacade],
      loadComponent: () =>
        import('./pages/platform-dashboard.page').then((m) => m.PlatformDashboardPage),
    },
  ];
}
