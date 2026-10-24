import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { LicensesFacade } from './application/licenses.facade';
import { PlatformSubscriptionsFacade } from './application/platform-subscriptions.facade';
import { LicensesGateway, UnavailableLicensesGateway } from './data-access/licenses.gateway';

/**
 * Licenses & entitlements (`/licenses`, P7-S1; `/licenses/platforms/:platformId`, P7-S2), company scope, the owner
 * only (the shell route's capability guard covers both, direct URLs included). The gateway is bound here
 * (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the `unavailable` adapter otherwise.
 */
export async function loadLicensesRoutes(environment: AppEnvironment): Promise<Routes> {
  const licenses = await adapterProviders(environment, 'licenses', [
    { provide: LicensesGateway, useClass: UnavailableLicensesGateway },
  ]);
  return [
    {
      path: '',
      providers: licenses,
      children: [
        {
          path: '',
          pathMatch: 'full',
          providers: [LicensesFacade],
          loadComponent: () => import('./pages/licenses.page').then((m) => m.LicensesPage),
        },
        {
          path: 'platforms/:platformId',
          title: 'titles.platformSubscriptions',
          data: {
            [BREADCRUMB_DATA]: 'shell.breadcrumb.platformSubscriptions',
            [BREADCRUMB_PARENT_DATA]: { key: 'shell.breadcrumb.licenses', link: '/licenses' },
          },
          providers: [PlatformSubscriptionsFacade],
          loadComponent: () =>
            import('./pages/platform-subscriptions.page').then((m) => m.PlatformSubscriptionsPage),
        },
      ],
    },
  ];
}
