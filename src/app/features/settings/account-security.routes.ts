import { Routes } from '@angular/router';
import { capabilityGuard } from '../../core/access/access.guards';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { AccountSecurityFacade } from './application/account-security.facade';
import {
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from './data-access/account-security.gateway';

/**
 * Account security (`/settings/security`; P9-S4a) and adding an authenticator app (`…/add-authenticator`; P9-S4b), the
 * owner only (the parent route's capability guard covers direct URLs; the add page has its own). The gateways are bound
 * here (docs/ARCHITECTURE.md §3): the mock adapters in a demo build, the `unavailable` adapters otherwise, so a
 * production build shows no simulated factor and begins no setup. Both pages share the overview's facade, so the
 * Security page shows the outcome of an add.
 */
export async function loadAccountSecurityRoutes(environment: AppEnvironment): Promise<Routes> {
  const [security, stepUp] = await Promise.all([
    adapterProviders(environment, 'accountSecurity', [
      { provide: AccountSecurityGateway, useClass: UnavailableAccountSecurityGateway },
    ]),
    adapterProviders(environment, 'stepUp', [
      { provide: StepUpGateway, useClass: UnavailableStepUpGateway },
    ]),
  ]);
  return [
    {
      path: '',
      providers: [...security, ...stepUp, AccountSecurityFacade],
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./pages/account-security.page').then((m) => m.AccountSecurityPage),
        },
        {
          // A dedicated page (owner decision D1), with room for the QR code. Entering it begins a new setup.
          path: 'add-authenticator',
          title: 'titles.settingsAddAuthenticator',
          data: {
            [BREADCRUMB_DATA]: 'shell.breadcrumb.addAuthenticator',
            [BREADCRUMB_PARENT_DATA]: {
              key: 'shell.breadcrumb.security',
              link: '/settings/security',
            },
          },
          canActivate: [capabilityGuard('account.factor.add')],
          loadComponent: () =>
            import('./pages/add-authenticator.page').then((m) => m.AddAuthenticatorPage),
        },
      ],
    },
  ];
}
