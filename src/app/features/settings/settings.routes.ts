import { Routes } from '@angular/router';
import { BREADCRUMB_DATA } from '../../layout/breadcrumbs/breadcrumbs';

/**
 * Settings (`/settings`). This slice has one section, Appearance: personal, browser-local preferences, open to every
 * signed-in actor (owner or operator) and granting no administrative capability.
 */
export const SETTINGS_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'appearance' },
  {
    path: 'appearance',
    title: 'titles.settingsAppearance',
    data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.appearance' },
    loadComponent: () =>
      import('./pages/appearance-settings.page').then((m) => m.AppearanceSettingsPage),
  },
];
