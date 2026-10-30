import { Routes } from '@angular/router';
import { capabilityGuard } from '../../core/access/access.guards';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { AssistanceDirectoryFacade } from '../assistance/application/assistance-directory.facade';
import { UNAVAILABLE_ASSISTANCE_PROVIDERS } from '../assistance/data-access/assistance.gateway';
import { BillingFacade } from './application/billing.facade';
import { BillingGateway, UnavailableBillingGateway } from './data-access/billing.gateway';

/**
 * Billing & payments (`/billing`; P7-S3), company scope, the owner only (the shell route's capability guard covers
 * direct URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the
 * `unavailable` adapter otherwise.
 *
 * Below it, the Organization Assistance case directory (`/billing/assistance`; A4): read only, the owner only (its own
 * capability guard as well), with the Assistance gateway bound the same way.
 */
export async function loadBillingRoutes(environment: AppEnvironment): Promise<Routes> {
  const [billing, assistance] = await Promise.all([
    adapterProviders(environment, 'billing', [
      { provide: BillingGateway, useClass: UnavailableBillingGateway },
    ]),
    adapterProviders(environment, 'assistance', UNAVAILABLE_ASSISTANCE_PROVIDERS),
  ]);
  return [
    {
      path: '',
      providers: [...billing, BillingFacade],
      loadComponent: () => import('./pages/billing.page').then((m) => m.BillingPage),
    },
    {
      path: 'assistance',
      title: 'titles.assistance',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistance',
        [BREADCRUMB_PARENT_DATA]: { key: 'shell.breadcrumb.billing', link: '/billing' },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceDirectoryFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-directory.page').then(
          (m) => m.AssistanceDirectoryPage,
        ),
    },
  ];
}
