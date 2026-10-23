import { ServiceHealthSummary } from '../domain/service-health.model';

/**
 * FICTIONAL service statuses: illustrative only, never live health, readiness or deployment (CF-06). Not Core data.
 * Every other Company Overview figure is derived from the demo world's records (company-overview.mock.ts).
 */
export const DEMO_SERVICE_HEALTH: ServiceHealthSummary = {
  services: [
    { service: 'auth', status: 'operational' },
    { service: 'organization', status: 'operational' },
    { service: 'release', status: 'operational' },
    { service: 'billing', status: 'operational' },
    { service: 'payment', status: 'operational' },
    { service: 'file', status: 'operational' },
    { service: 'notification', status: 'delayed' },
    { service: 'audit', status: 'operational' },
  ],
};
