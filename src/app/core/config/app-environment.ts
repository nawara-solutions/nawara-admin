import { InjectionToken, Provider } from '@angular/core';
import { Actor } from '../auth/actor';

/** Domains that can be served by a demo (mock) adapter. Each has an `unavailable` adapter for every other build. */
export type DemoDomain =
  | 'scopeDirectory'
  | 'notificationSummary'
  | 'companyOverview'
  | 'commercialSummary'
  | 'serviceHealth';

/** What a demo build adds: a fictional signed-in owner and the mock adapter bindings (src/app/demo/demo-bindings.ts). */
export interface DemoBindings {
  readonly owner: Actor;
  readonly providers: Readonly<Record<DemoDomain, readonly Provider[]>>;
}

/**
 * Build-time environment (src/environments/, swapped by `fileReplacements`; docs/ARCHITECTURE.md §24).
 *
 * `demo` is a loader for the demo bindings, or `null`. The production environment file sets `null` and never
 * references the demo module, so mock sessions, mock adapters and fixtures are not even bundled in a production build.
 * `assertEnvironment` refuses the impossible combination as a second barrier.
 */
export interface AppEnvironment {
  readonly production: boolean;
  readonly demo: { readonly load: () => Promise<DemoBindings> } | null;
}

export const APP_ENVIRONMENT = new InjectionToken<AppEnvironment>('APP_ENVIRONMENT');

export function assertEnvironment(environment: AppEnvironment): AppEnvironment {
  if (environment.production && environment.demo !== null) {
    throw new Error('A production build cannot enable demo data (docs/ARCHITECTURE.md §3).');
  }
  return environment;
}

export const isDemo = (environment: AppEnvironment): boolean =>
  assertEnvironment(environment).demo !== null;

/**
 * The gateway bindings for one domain: its mock adapter in a demo build, otherwise `unavailable` (no Core contract
 * exists yet, so there is no HTTP adapter to bind; docs/CORE-INTEGRATION.md §7). Called from lazy route loaders.
 */
export async function adapterProviders(
  environment: AppEnvironment,
  domain: DemoDomain,
  unavailable: readonly Provider[],
): Promise<Provider[]> {
  const demo = assertEnvironment(environment).demo;
  if (demo === null) return [...unavailable];
  return [...(await demo.load()).providers[domain]];
}
