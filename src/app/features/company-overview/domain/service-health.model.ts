/**
 * Service-health summary shown on the overview, behind its own gateway.
 *
 * Core status 🟡 (CF-06, Core V2 A12): each service exposes only unauthenticated infrastructure probes (`/health` →
 * `{status:'ok'}`, `/ready` → `ready | unavailable`), with no aggregation, no operator API and no "delayed" state.
 * Demo statuses are illustrative only: they never mean a service is deployed, ready or healthy.
 */

/** Nawara Core services, as machine values (labels come from the catalog). */
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

export type ServiceStatus = 'operational' | 'delayed' | 'unavailable' | 'unknown';

export interface ServiceStatusEntry {
  readonly service: CoreService;
  readonly status: ServiceStatus;
}

export interface ServiceHealthSummary {
  readonly services: readonly ServiceStatusEntry[];
}
