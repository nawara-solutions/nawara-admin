import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { PlatformDirectoryFacade } from './application/platform-directory.facade';
import {
  PlatformDirectoryGateway,
  UnavailablePlatformDirectoryGateway,
} from './data-access/platform-directory.gateway';

/**
 * Platform directory routes (`/platforms`). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a
 * demo build, the `unavailable` adapter otherwise.
 */
export async function loadPlatformsRoutes(environment: AppEnvironment): Promise<Routes> {
  const directory = await adapterProviders(environment, 'platformDirectory', [
    { provide: PlatformDirectoryGateway, useClass: UnavailablePlatformDirectoryGateway },
  ]);
  return [
    {
      path: '',
      providers: [...directory, PlatformDirectoryFacade],
      loadComponent: () => import('./pages/platforms.page').then((m) => m.PlatformsPage),
    },
  ];
}
