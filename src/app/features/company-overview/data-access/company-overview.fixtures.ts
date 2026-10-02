import { DEMO_COMPANY_DIRECTORY } from '../../../core/context/scope-directory.fixtures';
import { CommercialSummary } from '../domain/commercial-summary.model';
import { CompanyOverview } from '../domain/company-overview.model';
import { ServiceHealthSummary } from '../domain/service-health.model';

const [school, drive] = DEMO_COMPANY_DIRECTORY.platforms;
if (!school || !drive) throw new Error('The demo directory defines two platforms.');

const GROWTH_DAYS = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-30'];
const series = (counts: readonly number[]) =>
  GROWTH_DAYS.map((day, i) => ({ day, organizations: counts[i] ?? 0 }));

/**
 * FICTIONAL demo data for the Company Overview (docs/ARCHITECTURE.md §3), taken from the approved reference. Every
 * number, history point, attention item, activity entry, commercial figure and service status is invented. None of it
 * is Core data, and its shape is not a Core contract.
 *
 * The figures are kept mutually consistent:
 * - 16 + 8 organizations = 24;
 * - 1,284 unique identities against 920 + 460 = 1,380 platform memberships (one account can hold memberships in several
 *   platforms, so unique identities ≤ memberships);
 * - 3 + 2 = 5 operator assignments held by 4 unique operators (one operator is assigned to both platforms);
 * - on each growth day, the School and Drive counts add up to the total.
 */
export const DEMO_COMPANY_OVERVIEW: CompanyOverview = {
  company: DEMO_COMPANY_DIRECTORY.company,
  periodDays: 30,
  summary: {
    platforms: { status: 'available', value: 2 },
    organizations: { status: 'available', value: 24 },
    uniqueIdentities: { status: 'available', value: 1284 },
    pendingAdminInvitations: { status: 'available', value: 7 },
  },
  platforms: [
    {
      platform: school,
      organizations: { status: 'available', value: 16 },
      memberships: { status: 'available', value: 920 },
      operators: { status: 'available', value: 3 },
    },
    {
      platform: drive,
      organizations: { status: 'available', value: 8 },
      memberships: { status: 'available', value: 460 },
      operators: { status: 'available', value: 2 },
    },
  ],
  access: {
    status: 'available',
    data: {
      operatorAssignments: { status: 'available', value: 5 },
      uniqueOperators: { status: 'available', value: 4 },
      platformsWithOperators: { status: 'available', value: 2 },
    },
  },
  attention: {
    status: 'available',
    data: [
      { kind: 'admin_invitations_awaiting', count: 7 },
      { kind: 'access_assignments_to_review', count: 2 },
    ],
  },
  growth: {
    status: 'available',
    data: {
      points: [
        { day: '2026-09-01', organizations: 16 },
        { day: '2026-09-08', organizations: 18 },
        { day: '2026-09-15', organizations: 20 },
        { day: '2026-09-22', organizations: 22 },
        { day: '2026-09-30', organizations: 24 },
      ],
      platforms: [
        { platformId: school.id, points: series([11, 12, 13, 15, 16]) },
        { platformId: drive.id, points: series([5, 6, 7, 7, 8]) },
      ],
    },
  },
  activity: {
    status: 'available',
    data: [
      {
        id: 'demo-activity-1',
        action: 'organization.created',
        organizationName: 'École Horizon',
        platformName: school.name,
        occurredAt: '2026-09-30T10:42:00Z',
      },
      {
        id: 'demo-activity-2',
        action: 'operator.assigned',
        organizationName: null,
        platformName: drive.name,
        occurredAt: '2026-09-29T08:30:00Z',
      },
      {
        id: 'demo-activity-3',
        action: 'admin_invitation.sent',
        organizationName: null,
        platformName: school.name,
        occurredAt: '2026-09-27T09:05:00Z',
      },
      {
        id: 'demo-activity-4',
        action: 'license.renewed',
        organizationName: 'Auto-École Atlas',
        platformName: drive.name,
        occurredAt: '2026-09-25T11:20:00Z',
      },
    ],
  },
};

/** FICTIONAL commercial figures ("licenses" are view-model terms; Core has Billing entitlements, 🟡 V2 A10/A11). */
export const DEMO_COMMERCIAL_SUMMARY: CommercialSummary = {
  activeLicenses: { status: 'available', value: 38 },
  expiringSoon: { status: 'available', value: 3 },
  expiringWithinDays: 14,
  paymentIssues: { status: 'available', value: 2 },
};

/** FICTIONAL service statuses: illustrative only, never live health, readiness or deployment (CF-06). */
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
