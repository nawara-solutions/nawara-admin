import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BillingFacade } from './application/billing.facade';
import { BillingGateway, UnavailableBillingGateway } from './data-access/billing.gateway';

/**
 * Billing & payments (`/billing`; P7-S3), company scope, the owner only (the shell route's capability guard covers
 * direct URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the
 * `unavailable` adapter otherwise.
 */
export async function loadBillingRoutes(environment: AppEnvironment): Promise<Routes> {
  const billing = await adapterProviders(environment, 'billing', [
    { provide: BillingGateway, useClass: UnavailableBillingGateway },
  ]);
  return [
    {
      path: '',
      providers: [...billing, BillingFacade],
      loadComponent: () => import('./pages/billing.page').then((m) => m.BillingPage),
    },
  ];
}
