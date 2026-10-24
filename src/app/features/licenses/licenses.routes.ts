import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { LicensesFacade } from './application/licenses.facade';
import { LicensesGateway, UnavailableLicensesGateway } from './data-access/licenses.gateway';

/**
 * Licenses & entitlements (`/licenses`; P7-S1), company scope, the owner only (the shell route's capability guard covers
 * direct URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the
 * `unavailable` adapter otherwise.
 */
export async function loadLicensesRoutes(environment: AppEnvironment): Promise<Routes> {
  const licenses = await adapterProviders(environment, 'licenses', [
    { provide: LicensesGateway, useClass: UnavailableLicensesGateway },
  ]);
  return [
    {
      path: '',
      providers: [...licenses, LicensesFacade],
      loadComponent: () => import('./pages/licenses.page').then((m) => m.LicensesPage),
    },
  ];
}
