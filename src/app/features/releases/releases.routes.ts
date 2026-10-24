import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { ReleasesFacade } from './application/releases.facade';
import {
  ReleaseInformationGateway,
  UnavailableReleaseInformationGateway,
} from './data-access/release-information.gateway';

/**
 * Releases (`/releases`; P8-S4), company scope, the owner only (the shell route's capability guard covers direct URLs).
 * The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the `unavailable` adapter
 * otherwise.
 */
export async function loadReleasesRoutes(environment: AppEnvironment): Promise<Routes> {
  const releases = await adapterProviders(environment, 'releases', [
    { provide: ReleaseInformationGateway, useClass: UnavailableReleaseInformationGateway },
  ]);
  return [
    {
      path: '',
      providers: [...releases, ReleasesFacade],
      loadComponent: () => import('./pages/releases.page').then((m) => m.ReleasesPage),
    },
  ];
}
