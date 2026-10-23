import {
  CompanyId,
  OrganizationId,
  PlatformId,
  companyId,
  organizationId,
  platformId,
} from '../../core/context/scope.model';
import {
  ActivityRecord,
  AdminIdentityId,
  DemoWorldTables,
  OrganizationRecord,
  adminIdentityId,
} from './records';

/**
 * The FICTIONAL canonical seed of the demo world (development builds only). Not Core data and not a Core contract. Ids
 * are stable and UUID-shaped like Core's; times are offsets from the injected clock, so the seed is a pure function of
 * `now` and every run with the same clock gives the same world.
 */
export const DEMO_COMPANY_ID: CompanyId = companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a01');
export const DEMO_SCHOOL_PLATFORM_ID: PlatformId = platformId(
  '5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01',
);
export const DEMO_DRIVE_PLATFORM_ID: PlatformId = platformId(
  '5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b02',
);

/** The user-id prefix the demo identities share (their sign-in accounts use the same ids: core/auth/auth.fixtures.ts). */
const USER = '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e';

/** The one owner of the demo Company. */
export const DEMO_OWNER_ID: AdminIdentityId = adminIdentityId(`${USER}01`);

/**
 * The Company's canonical operators: the staff who can reach the workspace. Sign-in accounts that only simulate a
 * refused request (rate limits, an outage, a confirmation that cannot complete) are not staff and hold no assignment.
 */
export const DEMO_OPERATOR_IDS = {
  school: adminIdentityId(`${USER}11`),
  multi: adminIdentityId(`${USER}12`),
  phone: adminIdentityId(`${USER}13`),
  unassigned: adminIdentityId(`${USER}14`),
  /** Created by the owner, contact not confirmed yet: assigned all the same (confirmation is not assignment). */
  awaitingConfirmation: adminIdentityId(`${USER}18`),
} as const;

const HOUR_MS = 3_600_000;
const DAY = 24;

const org = (n: number): OrganizationId =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${n.toString().padStart(2, '0')}`);

/** One Organization of the seed: its number (stable id), when it was created and its counts. */
interface OrganizationSeed {
  readonly n: number;
  readonly platformId: PlatformId;
  readonly name: string;
  readonly createdHoursAgo: number;
  readonly memberships: number;
  readonly pendingRequests: number;
  readonly assistedPayments?: 'disabled';
  /** Hours until its subscription ends (negative: it already ended); none: the Organization has no subscription. */
  readonly subscriptionEndsInHours?: number;
}

const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;

const ORGANIZATIONS: readonly OrganizationSeed[] = [
  {
    n: 1,
    platformId: S,
    name: 'École Horizon',
    createdHoursAgo: 2,
    memberships: 64,
    pendingRequests: 3,
    subscriptionEndsInHours: 365 * DAY,
  },
  {
    n: 2,
    platformId: S,
    name: 'Lycée Al Amal',
    createdHoursAgo: 9 * DAY,
    memberships: 118,
    pendingRequests: 0,
    subscriptionEndsInHours: -6,
  },
  {
    n: 3,
    platformId: S,
    name: 'Collège Riad',
    createdHoursAgo: 38 * DAY,
    memberships: 87,
    pendingRequests: 5,
    subscriptionEndsInHours: 6 * DAY,
  },
  {
    n: 4,
    platformId: S,
    name: 'Institut Nour',
    createdHoursAgo: 52 * DAY,
    memberships: 41,
    pendingRequests: 1,
    assistedPayments: 'disabled',
  },
  {
    n: 5,
    platformId: S,
    name: 'École Les Oliviers',
    createdHoursAgo: 75 * DAY,
    memberships: 72,
    pendingRequests: 0,
    subscriptionEndsInHours: 40 * DAY,
  },
  {
    n: 6,
    platformId: S,
    name: 'École Ibn Sina',
    createdHoursAgo: 120 * DAY,
    memberships: 52,
    pendingRequests: 3,
    subscriptionEndsInHours: 12 * DAY,
  },
  {
    n: 7,
    platformId: S,
    name: 'Lycée Averroès',
    createdHoursAgo: 160 * DAY,
    memberships: 48,
    pendingRequests: 0,
    subscriptionEndsInHours: 90 * DAY,
  },
  {
    n: 8,
    platformId: S,
    name: 'Collège Al Andalous',
    createdHoursAgo: 210 * DAY,
    memberships: 61,
    pendingRequests: 0,
    assistedPayments: 'disabled',
    subscriptionEndsInHours: 150 * DAY,
  },
  {
    n: 9,
    platformId: S,
    name: 'École Bab Al Bahr',
    createdHoursAgo: 260 * DAY,
    memberships: 39,
    pendingRequests: 0,
  },
  {
    n: 10,
    platformId: S,
    name: 'Institut Atlas Savoir',
    createdHoursAgo: 300 * DAY,
    memberships: 55,
    pendingRequests: 0,
    subscriptionEndsInHours: 21 * DAY,
  },
  {
    n: 11,
    platformId: S,
    name: 'École Yasmine',
    createdHoursAgo: 340 * DAY,
    memberships: 44,
    pendingRequests: 0,
    subscriptionEndsInHours: 200 * DAY,
  },
  {
    n: 12,
    platformId: S,
    name: 'Lycée Ibn Khaldoun',
    createdHoursAgo: 390 * DAY,
    memberships: 50,
    pendingRequests: 0,
    subscriptionEndsInHours: 3 * DAY,
  },
  {
    n: 13,
    platformId: S,
    name: 'Collège Zitouna',
    createdHoursAgo: 430 * DAY,
    memberships: 47,
    pendingRequests: 0,
    subscriptionEndsInHours: 75 * DAY,
  },
  {
    n: 14,
    platformId: S,
    name: 'École Les Palmiers',
    createdHoursAgo: 480 * DAY,
    memberships: 58,
    pendingRequests: 0,
    subscriptionEndsInHours: 120 * DAY,
  },
  {
    n: 15,
    platformId: S,
    name: 'Institut Al Qalam',
    createdHoursAgo: 530 * DAY,
    memberships: 43,
    pendingRequests: 0,
    subscriptionEndsInHours: 30 * DAY,
  },
  {
    n: 16,
    platformId: S,
    name: 'École Andalousia',
    createdHoursAgo: 600 * DAY,
    memberships: 41,
    pendingRequests: 0,
    subscriptionEndsInHours: 260 * DAY,
  },
  {
    n: 17,
    platformId: D,
    name: 'Auto-École Atlas',
    createdHoursAgo: 18 * DAY,
    memberships: 74,
    pendingRequests: 2,
    subscriptionEndsInHours: 340 * DAY,
  },
  {
    n: 18,
    platformId: D,
    name: 'Permis Express',
    createdHoursAgo: 45 * DAY,
    memberships: 52,
    pendingRequests: 0,
    subscriptionEndsInHours: 9 * DAY,
  },
  {
    n: 19,
    platformId: D,
    name: 'Auto-École Sahara',
    createdHoursAgo: 95 * DAY,
    memberships: 61,
    pendingRequests: 2,
    subscriptionEndsInHours: 60 * DAY,
  },
  {
    n: 20,
    platformId: D,
    name: 'Conduite Plus',
    createdHoursAgo: 150 * DAY,
    memberships: 58,
    pendingRequests: 0,
    subscriptionEndsInHours: 180 * DAY,
  },
  {
    n: 21,
    platformId: D,
    name: 'Auto-École du Port',
    createdHoursAgo: 220 * DAY,
    memberships: 55,
    pendingRequests: 0,
  },
  {
    n: 22,
    platformId: D,
    name: 'Auto-École Médina',
    createdHoursAgo: 280 * DAY,
    memberships: 57,
    pendingRequests: 0,
    subscriptionEndsInHours: 25 * DAY,
  },
  {
    n: 23,
    platformId: D,
    name: 'Route Sûre',
    createdHoursAgo: 350 * DAY,
    memberships: 48,
    pendingRequests: 0,
    subscriptionEndsInHours: 100 * DAY,
  },
  {
    n: 24,
    platformId: D,
    name: 'Auto-École Andalous',
    createdHoursAgo: 420 * DAY,
    memberships: 55,
    pendingRequests: 0,
    subscriptionEndsInHours: 15 * DAY,
  },
];

const ACTIVITY: readonly (Omit<ActivityRecord, 'occurredAt'> & { readonly hoursAgo: number })[] = [
  {
    id: 'platform-activity-s1',
    platformId: S,
    organizationId: org(1),
    action: 'organization.created',
    hoursAgo: 2,
  },
  {
    id: 'platform-activity-s2',
    platformId: S,
    organizationId: org(3),
    action: 'admin_invitation.sent',
    hoursAgo: 26,
  },
  {
    id: 'platform-activity-s3',
    platformId: S,
    organizationId: org(2),
    action: 'membership.approved',
    hoursAgo: 50,
  },
  {
    id: 'platform-activity-s4',
    platformId: S,
    organizationId: null,
    action: 'operator.assigned',
    hoursAgo: 75,
  },
  {
    id: 'platform-activity-d1',
    platformId: D,
    organizationId: org(19),
    action: 'membership.approved',
    hoursAgo: 5,
  },
  {
    id: 'platform-activity-d2',
    platformId: D,
    organizationId: org(18),
    action: 'admin_invitation.sent',
    hoursAgo: 100,
  },
  {
    id: 'platform-activity-d3',
    platformId: D,
    organizationId: org(17),
    action: 'organization.created',
    hoursAgo: 18 * DAY,
  },
];

/** The canonical demo world at `now` (milliseconds since the epoch). */
export function demoWorldSeed(now: number): DemoWorldTables {
  const at = (hoursFromNow: number) => new Date(now + hoursFromNow * HOUR_MS).toISOString();
  const organizations: OrganizationRecord[] = ORGANIZATIONS.map((o) => ({
    id: org(o.n),
    platformId: o.platformId,
    name: o.name,
    createdAt: at(-o.createdHoursAgo),
    memberships: o.memberships,
    pendingRequests: o.pendingRequests,
    assistedPayments: o.assistedPayments ?? 'inherit',
  }));
  return {
    company: { id: DEMO_COMPANY_ID, name: 'Nawara Solutions', ownerId: DEMO_OWNER_ID },
    platforms: [
      {
        id: S,
        companyId: DEMO_COMPANY_ID,
        name: 'Nawara School',
        key: 'nawara-school',
        product: 'school',
      },
      {
        id: D,
        companyId: DEMO_COMPANY_ID,
        name: 'Nawara Drive',
        key: 'nawara-drive',
        product: 'drive',
      },
    ],
    organizations,
    identities: [
      { id: DEMO_OWNER_ID, kind: 'owner' },
      ...Object.values(DEMO_OPERATOR_IDS).map((id) => ({ id, kind: 'operator' as const })),
    ],
    assignments: [
      { operatorId: DEMO_OPERATOR_IDS.school, platformId: S },
      { operatorId: DEMO_OPERATOR_IDS.multi, platformId: S },
      { operatorId: DEMO_OPERATOR_IDS.multi, platformId: D },
      { operatorId: DEMO_OPERATOR_IDS.phone, platformId: D },
      { operatorId: DEMO_OPERATOR_IDS.awaitingConfirmation, platformId: S },
    ],
    subscriptions: ORGANIZATIONS.flatMap((o) =>
      o.subscriptionEndsInHours === undefined
        ? []
        : [{ organizationId: org(o.n), endsAt: at(o.subscriptionEndsInHours) }],
    ),
    adminInvitations: [
      { id: 'admin-invitation-1', organizationId: org(1) },
      { id: 'admin-invitation-2', organizationId: org(1) },
      { id: 'admin-invitation-3', organizationId: org(3) },
      { id: 'admin-invitation-4', organizationId: org(4) },
      { id: 'admin-invitation-5', organizationId: org(6) },
      { id: 'admin-invitation-6', organizationId: org(18) },
      { id: 'admin-invitation-7', organizationId: org(19) },
    ],
    paymentIssues: [
      { id: 'payment-issue-1', organizationId: org(3), kind: 'failed' },
      { id: 'payment-issue-2', organizationId: org(21), kind: 'awaiting_action' },
    ],
    platformCommercial: [
      { platformId: S, personalPremium: 21, assistedPayments: 'enabled' },
      { platformId: D, personalPremium: 9, assistedPayments: 'disabled' },
    ],
    activity: ACTIVITY.map(({ hoursAgo, ...event }) => ({ ...event, occurredAt: at(-hoursAgo) })),
    inboxes: [{ identityId: DEMO_OWNER_ID, unread: 4 }],
  };
}
