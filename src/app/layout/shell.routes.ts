import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { capabilityGuard, sessionGuard } from '../core/access/access.guards';
import { homePath } from '../core/access/home-path';
import { AuthGateway, UnavailableAuthGateway } from '../core/auth/auth.gateway';
import { AuthSession } from '../core/auth/auth-session';
import { OperatorGrantsRefresh } from '../core/auth/operator-grants-refresh';
import { SignOut } from '../core/auth/sign-out';
import { APP_ENVIRONMENT, AppEnvironment, adapterProviders } from '../core/config/app-environment';
import { EntityLabel } from '../core/context/entity-label';
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
 * (`/platforms/:platformId`, and its Organizations below it). The auth, scope directory and notification summary gateways are bound here for everything
 * under the shell; the auth gateway serves the account menu's sign-out (`SignOut`). In a demo build its mock shares the
 * one `DemoAuthState` with the sign-in pages' mock, so both see the same simulated session.
 */
export async function loadShellRoutes(environment: AppEnvironment): Promise<Routes> {
  const auth = await adapterProviders(environment, 'auth', [
    { provide: AuthGateway, useClass: UnavailableAuthGateway },
  ]);
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
      providers: [
        ...auth,
        ...directory,
        ...notifications,
        OperatorGrantsRefresh,
        ScopeContext,
        EntityLabel,
        NotificationIndicator,
        SignOut,
      ],
      loadComponent: () => import('./shell/shell').then((m) => m.Shell),
      children: [
        // Home depends on the actor: an operator never has the Company overview.
        {
          path: '',
          pathMatch: 'full',
          redirectTo: () => homePath(inject(AuthSession).actor()),
        },
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
          path: 'platforms',
          pathMatch: 'full',
          title: 'titles.platforms',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.platforms' },
          canActivate: [capabilityGuard('company.platforms.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/platforms/platforms.routes').then((m) =>
              m.loadPlatformsRoutes(env),
            );
          },
        },
        {
          // The Company's operators and their Platform access (P6): the owner only, direct URLs included.
          path: 'operators',
          canActivate: [capabilityGuard('company.operators.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/operators/operators.routes').then((m) =>
              m.loadOperatorsRoutes(env),
            );
          },
        },
        {
          // Licenses & entitlements (P7-S1): Company commercial area, the owner only, direct URLs included.
          path: 'licenses',
          title: 'titles.licenses',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.licenses' },
          canActivate: [capabilityGuard('company.commercial.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/licenses/licenses.routes').then((m) =>
              m.loadLicensesRoutes(env),
            );
          },
        },
        {
          // Audit log (P8-S1): simulated administrative activity, company scope, the owner only, direct URLs included.
          path: 'audit',
          title: 'titles.audit',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.audit' },
          canActivate: [capabilityGuard('company.audit.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/activity/activity.routes').then((m) =>
              m.loadActivityRoutes(env),
            );
          },
        },
        {
          // Notifications (P8-S3): the signed-in person's own count, for every actor; no capability decides it.
          path: 'notifications',
          title: 'titles.notifications',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.notifications' },
          loadChildren: () =>
            import('../features/notifications/notifications.routes').then(
              (m) => m.NOTIFICATIONS_ROUTES,
            ),
        },
        {
          // Services & health (P8-S2): the documented Core services, company scope, the owner only, direct URLs included.
          path: 'services',
          title: 'titles.services',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.services' },
          canActivate: [capabilityGuard('company.services.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/services/services.routes').then((m) =>
              m.loadServicesRoutes(env),
            );
          },
        },
        {
          // Billing & payments (P7-S3): payment follow-ups, Company commercial area, the owner only, direct URLs included.
          path: 'billing',
          title: 'titles.billing',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.billing' },
          canActivate: [capabilityGuard('company.commercial.view')],
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/billing/billing.routes').then((m) =>
              m.loadBillingRoutes(env),
            );
          },
        },
        {
          // A Platform's Organizations (an entity of platform scope, never a scope of its own); access as below.
          path: 'platforms/:platformId/organizations',
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/organizations/organizations.routes').then((m) =>
              m.loadOrganizationsRoutes(env),
            );
          },
        },
        {
          // The Platform dashboard: owner or assigned operator; the access check is the page's (collapsed 404).
          path: 'platforms/:platformId',
          title: 'titles.platform',
          loadChildren: () => {
            const env = inject(APP_ENVIRONMENT);
            return import('../features/platform-dashboard/platform-dashboard.routes').then((m) =>
              m.loadPlatformDashboardRoutes(env),
            );
          },
        },
        {
          path: 'settings',
          loadChildren: () =>
            import('../features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
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
