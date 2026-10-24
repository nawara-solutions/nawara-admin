import { Routes } from '@angular/router';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';

/** The Settings hub, the parent crumb of every section ("Company › Settings › Language"). */
const SETTINGS_PARENT = { key: 'shell.breadcrumb.settings', link: '/settings' } as const;

/**
 * Settings (`/settings`, P9-S1, P9-S2; docs/design/p9-settings-architecture.md): the hub, Appearance and Language
 * (browser-local preferences) and the signed-in person's own Account (read only, from the session). Open to every
 * signed-in actor (owner or operator) and granting no administrative capability. Security, Company and Platform
 * settings are later, separately authorized slices.
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
];
