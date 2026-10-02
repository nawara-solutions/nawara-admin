import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { guestGuard } from '../../core/access/access.guards';
import { AuthGateway, UnavailableAuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession } from '../../core/auth/auth-session';
import { BrowserWebAuthnClient, WebAuthnClient } from '../../core/auth/webauthn-client';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../../core/context/scope-directory.gateway';

/** The platform choice is for a signed-in operator with several assigned Platforms; anyone else goes home. */
export const platformChoiceGuard: CanActivateFn = () => {
  const actor = inject(AuthSession).actor();
  if (actor?.kind === 'operator' && actor.platformAssignments.length > 1) return true;
  return inject(Router).parseUrl('/');
};

/**
 * Sign-in routes (`/login…`, docs/ARCHITECTURE.md §6), outside the authenticated shell. The auth gateway and the
 * WebAuthn client are the demo mocks in a demo build; otherwise the gateway is unavailable (the guards then send
 * visitors to the "sign-in not available" page) and the WebAuthn client is the browser's.
 */
export async function loadAuthRoutes(environment: AppEnvironment): Promise<Routes> {
  const auth = await adapterProviders(environment, 'auth', [
    { provide: AuthGateway, useClass: UnavailableAuthGateway },
    { provide: WebAuthnClient, useClass: BrowserWebAuthnClient },
  ]);
  const directory = await adapterProviders(environment, 'scopeDirectory', [
    { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
  ]);
  return [
    {
      path: '',
      providers: [...auth, ...directory],
      loadComponent: () => import('./components/auth-frame/auth-frame').then((m) => m.AuthFrame),
      children: [
        {
          path: '',
          title: 'titles.signIn',
          canActivate: [guestGuard],
          loadComponent: () => import('./pages/sign-in/sign-in.page').then((m) => m.SignInPage),
        },
        {
          path: 'verify',
          title: 'titles.verify',
          canActivate: [guestGuard],
          loadComponent: () => import('./pages/mfa/mfa.page').then((m) => m.MfaPage),
        },
        {
          path: 'no-access',
          title: 'titles.noAccess',
          loadComponent: () =>
            import('./pages/no-access/no-access.page').then((m) => m.NoAccessPage),
        },
        {
          path: 'platform',
          title: 'titles.platformChoice',
          canActivate: [platformChoiceGuard],
          loadComponent: () =>
            import('./pages/platform-choice/platform-choice.page').then(
              (m) => m.PlatformChoicePage,
            ),
        },
        { path: '**', redirectTo: '' },
      ],
    },
  ];
}
