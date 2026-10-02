import { AppEnvironment } from '../app/core/config/app-environment';

/**
 * Development build (`ng serve`, `ng build --configuration development`): the demo slice with a fictional owner session
 * and mock adapters, loaded lazily. Replaces environment.ts through `fileReplacements` in angular.json.
 */
export const environment: AppEnvironment = {
  production: false,
  demo: { load: () => import('../app/demo/demo-bindings').then((m) => m.DEMO_BINDINGS) },
};
