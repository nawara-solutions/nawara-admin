import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { capabilityGuard } from '../../core/access/access.guards';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';

/** The Settings hub, the parent crumb of every section ("Company › Settings › Language"). */
const SETTINGS_PARENT = { key: 'shell.breadcrumb.settings', link: '/settings' } as const;

/**
 * Settings (`/settings`, P9-S1 to P9-S3; docs/design/p9-settings-architecture.md): the hub, Appearance and Language
 * (browser-local preferences) and the signed-in person's own Account (read only, from the session), open to every
 * signed-in actor (owner or operator) and granting no administrative capability; and Company settings (read only), the
 * owner's only; and the owner's own Account security (P9-S4a overview; P9-S4b adding an authenticator app and P9-S4c
 * creating a new secret key, below it).
 * Platform settings are a later, separately authorized slice.
 */
export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'titles.settings',
    data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.settings' },
    loadComponent: () => import('./pages/settings-hub.page').then((m) => m.SettingsHubPage),
  },
  {
    path: 'appearance',
    title: 'titles.settingsAppearance',
    data: {
      [BREADCRUMB_DATA]: 'shell.breadcrumb.appearance',
      [BREADCRUMB_PARENT_DATA]: SETTINGS_PARENT,
    },
    loadComponent: () =>
      import('./pages/appearance-settings.page').then((m) => m.AppearanceSettingsPage),
  },
  {
    path: 'language',
    title: 'titles.settingsLanguage',
    data: {
      [BREADCRUMB_DATA]: 'shell.breadcrumb.language',
      [BREADCRUMB_PARENT_DATA]: SETTINGS_PARENT,
    },
    loadComponent: () =>
      import('./pages/language-settings.page').then((m) => m.LanguageSettingsPage),
  },
  {
    // The signed-in person's own account: no identity parameter exists, so no one else's can be asked for.
    path: 'account',
    title: 'titles.settingsAccount',
    data: {
      [BREADCRUMB_DATA]: 'shell.breadcrumb.account',
      [BREADCRUMB_PARENT_DATA]: SETTINGS_PARENT,
    },
    loadComponent: () => import('./pages/account-settings.page').then((m) => m.AccountSettingsPage),
  },
  {
    // The owner's own factors (P9-S4a), adding an authenticator (P9-S4b, `security/add-authenticator`) and creating a
    // new secret key (P9-S4c, `security/secret-key`): the owner only, direct URLs included; no identity parameter.
    path: 'security',
    title: 'titles.settingsSecurity',
    data: {
      [BREADCRUMB_DATA]: 'shell.breadcrumb.security',
      [BREADCRUMB_PARENT_DATA]: SETTINGS_PARENT,
    },
    canActivate: [capabilityGuard('account.security.view')],
    loadChildren: () => {
      // Read in the router's injection context, before the lazy import resolves.
      const environment = inject(APP_ENVIRONMENT);
      return import('./account-security.routes').then((m) =>
        m.loadAccountSecurityRoutes(environment),
      );
    },
  },
  {
    // The Company's profile, read only, and links to its existing administration: the owner only, direct URLs included.
    path: 'company',
    title: 'titles.settingsCompany',
    data: {
      [BREADCRUMB_DATA]: 'shell.breadcrumb.companySettings',
      [BREADCRUMB_PARENT_DATA]: SETTINGS_PARENT,
    },
    canActivate: [capabilityGuard('company.settings.view')],
    loadChildren: () => {
      // Read in the router's injection context, before the lazy import resolves.
      const environment = inject(APP_ENVIRONMENT);
      return import('./company-settings.routes').then((m) =>
        m.loadCompanySettingsRoutes(environment),
      );
    },
  },
];
