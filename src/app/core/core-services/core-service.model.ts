/**
 * Nawara Core's services, as Admin's documentation records them (docs/CORE-INTEGRATION.md §5, §7 "Services & health"):
 * eight services, each with a documented responsibility. This is DOCUMENTATION, not an operational observation: it
 * says nothing about whether a service is deployed, ready or healthy.
 *
 * Core status 🔴 (CF-06, V2 A12): each service exposes only unauthenticated infrastructure probes (`/health`,
 * `/ready`), which the browser never calls; there is no authenticated, aggregated status read. So live health is
 * always `unavailable` here, and the model has no field that could carry a status, uptime, latency or incident.
 */

/** The services, as machine values, in the documented order (labels and responsibilities come from the catalog). */
export const CORE_SERVICES = [
  'auth',
  'organization',
  'release',
  'billing',
  'payment',
  'file',
  'notification',
  'audit',
] as const;
export type CoreService = (typeof CORE_SERVICES)[number];

export interface ServiceInventory {
  readonly services: readonly CoreService[];
  /** No authorized live health read exists (CF-06): never anything else until Core publishes one. */
  readonly liveHealth: 'unavailable';
}
