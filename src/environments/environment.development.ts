import { AppEnvironment } from '../app/core/config/app-environment';

/**
 * Development build (`ng serve`, `ng build --configuration development`): the demo slice with a fictional owner session
 * and mock adapters, loaded lazily, and the design-foundation gallery. Replaces environment.ts through `fileReplacements` in
 * angular.json.
 */
export const environment: AppEnvironment = {
  production: false,
  demo: { load: () => import('../app/demo/demo-bindings').then((m) => m.DEMO_BINDINGS) },
  // The A2 design-foundation gallery (`/foundation`): development and demo builds only (G0-D6).
  foundation: {
    load: () =>
      import('../app/features/foundation/foundation.routes').then((m) => m.FOUNDATION_ROUTES),
  },
};
