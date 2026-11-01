import { AppEnvironment } from '../app/core/config/app-environment';

/**
 * Production build (the default `ng build` configuration). Demo data is impossible here: `demo` is `null` and this file
 * imports nothing from src/app/demo/, so no mock session, adapter or fixture is bundled (docs/ARCHITECTURE.md §3, §24). It does not
 * reference the design-foundation gallery either, so `/foundation` does not exist in production (G0-D6).
 */
export const environment: AppEnvironment = {
  production: true,
  demo: null,
  // No design-foundation gallery: `/foundation` is not registered and its code is not bundled (G0-D6).
  foundation: null,
};
