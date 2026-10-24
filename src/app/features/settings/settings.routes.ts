import { Routes } from '@angular/router';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';

/** The Settings hub, the parent crumb of every section ("Company › Settings › Language"). */
const SETTINGS_PARENT = { key: 'shell.breadcrumb.settings', link: '/settings' } as const;

/**
 * Settings (`/settings`, P9-S1; docs/design/p9-settings-architecture.md). Personal, browser-local preferences only,
 * open to every signed-in actor (owner or operator) and granting no administrative capability: the hub, Appearance
 * and Language. Account, security, Company and Platform settings are later, separately authorized slices.
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
];
