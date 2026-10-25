import { Routes } from '@angular/router';
import { capabilityGuard } from '../../core/access/access.guards';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import type { SecretKeyPage } from './pages/secret-key.page';
import { AccountSecurityFacade } from './application/account-security.facade';
import {
  AccountSecurityGateway,
  UnavailableAccountSecurityGateway,
} from './data-access/account-security.gateway';

/** Both child pages' parent crumb: "Settings › Security › …". */
const SECURITY_PARENT = { key: 'shell.breadcrumb.security', link: '/settings/security' } as const;

/**
 * Account security (`/settings/security`; P9-S4a), adding an authenticator app (`…/add-authenticator`; P9-S4b),
 * creating a new secret key (`…/secret-key`; P9-S4c) and changing the password (`…/password`; P9-S4e), the owner only (the parent route's capability guard covers direct
 * URLs; each action page has its own). The gateways are bound
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
            [BREADCRUMB_PARENT_DATA]: SECURITY_PARENT,
          },
          canActivate: [capabilityGuard('account.factor.add')],
          loadComponent: () =>
            import('./pages/add-authenticator.page').then((m) => m.AddAuthenticatorPage),
        },
        {
          // A dedicated page (owner decision D1). Entering it creates nothing; leaving it with the key unsaved asks first.
          path: 'secret-key',
          title: 'titles.settingsSecretKey',
          data: {
            [BREADCRUMB_DATA]: 'shell.breadcrumb.secretKey',
            [BREADCRUMB_PARENT_DATA]: SECURITY_PARENT,
          },
          canActivate: [capabilityGuard('account.secret_key.rotate')],
          canDeactivate: [(page: SecretKeyPage) => page.canLeave()],
          loadComponent: () => import('./pages/secret-key.page').then((m) => m.SecretKeyPage),
        },
        {
          // A dedicated page (owner decision P2): a form password managers recognise. Entering it changes nothing.
          path: 'password',
          title: 'titles.settingsPassword',
          data: {
            [BREADCRUMB_DATA]: 'shell.breadcrumb.password',
            [BREADCRUMB_PARENT_DATA]: SECURITY_PARENT,
          },
          canActivate: [capabilityGuard('account.password.change')],
          loadComponent: () => import('./pages/password.page').then((m) => m.PasswordPage),
        },
      ],
    },
  ];
}
