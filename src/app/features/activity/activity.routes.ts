import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { ActivityFacade } from './application/activity.facade';
import { ActivityGateway, UnavailableActivityGateway } from './data-access/activity.gateway';

/**
 * Audit log (`/audit`; P8-S1): the owner's simulated administrative activity, company scope (the shell route's
 * capability guard covers direct URLs). An Organization's detail links here with it preselected, so there is one
 * browser, one facade and one gateway. Bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the
 * `unavailable` adapter otherwise.
 */
export async function loadActivityRoutes(environment: AppEnvironment): Promise<Routes> {
  const activity = await adapterProviders(environment, 'activity', [
    { provide: ActivityGateway, useClass: UnavailableActivityGateway },
  ]);
  return [
    {
      path: '',
      providers: [...activity, ActivityFacade],
      loadComponent: () => import('./pages/activity.page').then((m) => m.ActivityPage),
    },
  ];
}
