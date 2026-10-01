import { Routes } from '@angular/router';

export const routes: Routes = [
  // A2 design-foundation preview. A3 replaces the root route with the application shell (docs/ROADMAP.md).
  {
    path: '',
    loadChildren: () =>
      import('./features/foundation/foundation.routes').then((m) => m.FOUNDATION_ROUTES),
  },
];
