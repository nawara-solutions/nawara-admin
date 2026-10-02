import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { SESSION_UNAVAILABLE_PATH } from './core/access/access.guards';
import { APP_ENVIRONMENT } from './core/config/app-environment';
import { StatusPageData } from './layout/status-page/status-page';

const SESSION_UNAVAILABLE: StatusPageData = {
  icon: 'shield-check',
  titleKey: 'shell.pages.sessionUnavailable.title',
  descriptionKey: 'shell.pages.sessionUnavailable.description',
};

export const routes: Routes = [
  // A2 design-foundation gallery, kept as the token and primitive verification surface.
  {
    path: 'foundation',
    title: 'titles.foundation',
    loadChildren: () =>
      import('./features/foundation/foundation.routes').then((m) => m.FOUNDATION_ROUTES),
  },
  // Sign-in (A4): outside the shell; available only where an auth adapter exists (demo builds in this slice).
  {
    path: 'login',
    loadChildren: () => {
      // Read in the router's injection context, before the lazy import resolves.
      const environment = inject(APP_ENVIRONMENT);
      return import('./features/auth/auth.routes').then((m) => m.loadAuthRoutes(environment));
    },
  },
  // No sign-in in this build: every production build until the auth HTTP adapter lands here.
  {
    path: SESSION_UNAVAILABLE_PATH.slice(1),
    loadComponent: () => import('./layout/minimal-shell/minimal-shell').then((m) => m.MinimalShell),
    children: [
      {
        path: '',
        title: 'titles.sessionUnavailable',
        data: SESSION_UNAVAILABLE,
        loadComponent: () => import('./layout/status-page/status-page').then((m) => m.StatusPage),
      },
    ],
  },
  // The signed-in application: shell, company scope and platform scope (docs/ARCHITECTURE.md §6).
  {
    path: '',
    loadChildren: () => {
      // Read in the router's injection context, before the lazy import resolves.
      const environment = inject(APP_ENVIRONMENT);
      return import('./layout/shell.routes').then((m) => m.loadShellRoutes(environment));
    },
  },
];
