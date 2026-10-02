import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { capabilityGuard, sessionGuard } from '../core/access/access.guards';
import { APP_ENVIRONMENT, AppEnvironment, adapterProviders } from '../core/config/app-environment';
import { ScopeContext } from '../core/context/scope-context';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../core/context/scope-directory.gateway';
import { NotificationIndicator } from '../core/notifications/notification-indicator';
import {
  NotificationSummaryGateway,
  UnavailableNotificationSummaryGateway,
} from '../core/notifications/notification-summary.gateway';
import { BREADCRUMB_DATA } from './breadcrumbs/breadcrumbs';
import { StatusPageData } from './status-page/status-page';

const FORBIDDEN: StatusPageData = {
  icon: 'shield-check',
  titleKey: 'shell.pages.forbidden.title',
  descriptionKey: 'shell.pages.forbidden.description',
};

const NOT_FOUND: StatusPageData = {
  icon: 'circle-alert',
  titleKey: 'shell.pages.notFound.title',
  descriptionKey: 'shell.pages.notFound.description',
};

/**
 * The signed-in application (docs/ARCHITECTURE.md §6): the shell with company scope (`/overview`) and platform scope
 * (`/platforms/:platformId`). The scope directory and notification summary gateways are bound here for everything
 * under the shell.
 */
export async function loadShellRoutes(environment: AppEnvironment): Promise<Routes> {
  const directory = await adapterProviders(environment, 'scopeDirectory', [
    { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
  ]);
  const notifications = await adapterProviders(environment, 'notificationSummary', [
    { provide: NotificationSummaryGateway, useClass: UnavailableNotificationSummaryGateway },
  ]);
  return [
    {
      path: '',
      canActivate: [sessionGuard],
      providers: [...directory, ...notifications, ScopeContext, NotificationIndicator],
      loadComponent: () => import('./shell/shell').then((m) => m.Shell),
      children: [
        { path: '', pathMatch: 'full', redirectTo: 'overview' },
        {
          path: 'overview',
          title: 'titles.overview',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.overview' },
          canActivate: [capabilityGuard('company.overview.view')],
          loadChildren: () => {
            // Read in the router's injection context, before the lazy import resolves.
            const env = inject(APP_ENVIRONMENT);
            return import('../features/company-overview/company-overview.routes').then((m) =>
              m.loadCompanyOverviewRoutes(env),
            );
          },
        },
        {
          path: 'platforms/:platformId',
          title: 'titles.platform',
          loadComponent: () =>
            import('../features/platform-scope/pages/platform-placeholder.page').then(
              (m) => m.PlatformPlaceholderPage,
            ),
        },
        {
          path: 'forbidden',
          title: 'titles.forbidden',
          data: FORBIDDEN,
          loadComponent: () => import('./status-page/status-page').then((m) => m.StatusPage),
        },
        {
          path: '**',
          title: 'titles.notFound',
          data: NOT_FOUND,
          loadComponent: () => import('./status-page/status-page').then((m) => m.StatusPage),
        },
      ],
    },
  ];
}
