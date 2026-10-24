import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { AccountSecurityFacade } from './application/account-security.facade';
import {
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from './data-access/account-security.gateway';

/**
 * Account security (`/settings/security`; P9-S4a), the owner only (the parent route's capability guard covers direct
 * URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the `unavailable`
 * adapter otherwise, so a production build shows no simulated factor.
 */
export async function loadAccountSecurityRoutes(environment: AppEnvironment): Promise<Routes> {
  const security = await adapterProviders(environment, 'accountSecurity', [
    { provide: AccountSecurityGateway, useClass: UnavailableAccountSecurityGateway },
  ]);
  return [
    {
      path: '',
      providers: [...security, AccountSecurityFacade],
      loadComponent: () =>
        import('./pages/account-security.page').then((m) => m.AccountSecurityPage),
    },
  ];
}
