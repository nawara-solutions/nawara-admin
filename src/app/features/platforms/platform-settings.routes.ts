import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import {
  PlatformCommercialGateway,
  UnavailablePlatformCommercialGateway,
} from '../platform-dashboard/data-access/platform-commercial.gateway';
import { PlatformSettingsFacade } from './application/platform-settings.facade';
import { editPlatformProviders } from './edit-platform.providers';

/**
 * Platform settings routes (`/platforms/:platformId/settings`, M4). The gateways are bound here (docs/ARCHITECTURE.md
 * §3): mock adapters in a demo build, `unavailable` adapters otherwise. The access check is the page's (owner only; an
 * operator gets the collapsed "not found or not accessible" state), as on every platform-scope page; the mock command
 * refuses anyone but the owner on its own.
 */
export async function loadPlatformSettingsRoutes(environment: AppEnvironment): Promise<Routes> {
  const [commercial, edit] = await Promise.all([
    adapterProviders(environment, 'platformCommercial', [
      { provide: PlatformCommercialGateway, useClass: UnavailablePlatformCommercialGateway },
    ]),
    editPlatformProviders(environment),
  ]);
  return [
    {
      path: '',
      providers: [...commercial, ...edit, PlatformSettingsFacade],
      loadComponent: () =>
        import('./pages/platform-settings.page').then((m) => m.PlatformSettingsPage),
    },
  ];
}
