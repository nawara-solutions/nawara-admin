import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { APP_ENVIRONMENT, adapterProviders } from '../../core/config/app-environment';
import { ScopeContext } from '../../core/context/scope-context';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../../core/context/scope-directory.gateway';

export const FOUNDATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/foundation-preview.page').then((m) => m.FoundationPreviewPage),
  },
  {
    // The financial authorization dialog preview (F1-S6b): the only place the receipt demo adapters are bound.
    path: 'financial-authorization',
    title: 'titles.financialAuthorizationPreview',
    loadChildren: () => {
      // Read in the router's injection context, before the lazy import resolves.
      const environment = inject(APP_ENVIRONMENT);
      return import('../financial-authorization/financial-authorization.providers').then(
        async (m): Promise<Routes> => [
          {
            path: '',
            // Outside the shell: the run's scope comes from this page's own ScopeContext (company scope).
            providers: [
              ...(await adapterProviders(environment, 'scopeDirectory', [
                { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
              ])),
              ScopeContext,
              ...(await m.financialAuthorizationProviders(environment)),
            ],
            loadComponent: () =>
              import('./pages/financial-authorization-preview.page').then(
                (page) => page.FinancialAuthorizationPreviewPage,
              ),
          },
        ],
      );
    },
  },
];
