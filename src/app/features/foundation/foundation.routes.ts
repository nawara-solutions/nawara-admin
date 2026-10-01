import { Routes } from '@angular/router';

export const FOUNDATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/foundation-preview.page').then((m) => m.FoundationPreviewPage),
  },
];
