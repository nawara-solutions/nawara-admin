import {
  CompanyId,
  OrganizationId,
  PlatformId,
  companyId,
  organizationId,
  platformId,
} from '../../core/context/scope.model';
import {
  PlatformActivityRecord,
  AdminIdentityId,
  DemoWorldTables,
  OrganizationRecord,
  adminIdentityId,
} from './records';
import { seedMemberships } from './seed-memberships';

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
  /** Blocked by the owner after their Drive access was removed: staff, but with no sign-in account in the demo. */
  blocked: adminIdentityId(`${USER}21`),
} as const;

type DemoOperatorKey = keyof typeof DEMO_OPERATOR_IDS;

/** An operator's one contact (Core: exactly one email or one phone). */
export type DemoOperatorContact = { readonly email: string } | { readonly phone: string };

/**
 * The operators' FICTIONAL contacts: reserved `.invalid` emails and the unassigned `+999` country code. The sign-in
 * fixtures read the staff operators' contacts from here (core/auth/auth.fixtures.ts), so there is one source.
 */
export const DEMO_OPERATOR_CONTACTS: Readonly<Record<DemoOperatorKey, DemoOperatorContact>> = {
  school: { email: 'operator.school@demo.nawara.invalid' },
  multi: { email: 'operator.multi@demo.nawara.invalid' },
  phone: { phone: '+99900000001' },
  unassigned: { email: 'operator.unassigned@demo.nawara.invalid' },
  awaitingConfirmation: { email: 'operator.new@demo.nawara.invalid' },
  blocked: { email: 'operator.blocked@demo.nawara.invalid' },
};

/** Whether each operator's contact starts confirmed (Core issues working codes only to confirmed operators). */
export const DEMO_OPERATOR_CONFIRMED: Readonly<Record<DemoOperatorKey, boolean>> = {
  school: true,
  multi: true,
  phone: true,
  unassigned: true,
  awaitingConfirmation: false,
  blocked: true,
};

/** When each operator's account was created, in hours before the clock (its contact confirmed one hour later). */
const OPERATOR_CREATED_HOURS_AGO: Readonly<Record<DemoOperatorKey, number>> = {
  school: 200 * 24,
  multi: 170 * 24,
  phone: 220 * 24,
  unassigned: 165 * 24,
  awaitingConfirmation: 76,
  blocked: 120 * 24,
};

/**
 * The assignment history (append-only, like Core's): who was given which Platform, when, and when it was removed. Only
 * the active ones count anywhere (5 assignments, 4 operators): the phone operator's Drive access was removed, then given
 * again (a new record); the unassigned and the blocked operators kept only removed ones.
 */
const ASSIGNMENTS: readonly {
  readonly n: number;
  readonly operator: DemoOperatorKey;
  readonly platformId: PlatformId;
  readonly assignedHoursAgo: number;
  readonly revokedHoursAgo?: number;
}[] = [
  {
    n: 1,
    operator: 'phone',
    platformId: DEMO_DRIVE_PLATFORM_ID,
    assignedHoursAgo: 210 * 24,
    revokedHoursAgo: 120 * 24,
  },
  { n: 2, operator: 'school', platformId: DEMO_SCHOOL_PLATFORM_ID, assignedHoursAgo: 180 * 24 },
  {
    n: 3,
    operator: 'unassigned',
    platformId: DEMO_SCHOOL_PLATFORM_ID,
    assignedHoursAgo: 160 * 24,
    revokedHoursAgo: 30 * 24,
  },
  { n: 4, operator: 'multi', platformId: DEMO_SCHOOL_PLATFORM_ID, assignedHoursAgo: 150 * 24 },
  {
    n: 5,
    operator: 'blocked',
    platformId: DEMO_DRIVE_PLATFORM_ID,
    assignedHoursAgo: 100 * 24,
    revokedHoursAgo: 10 * 24,
  },
  { n: 6, operator: 'multi', platformId: DEMO_DRIVE_PLATFORM_ID, assignedHoursAgo: 90 * 24 },
  { n: 7, operator: 'phone', platformId: DEMO_DRIVE_PLATFORM_ID, assignedHoursAgo: 60 * 24 },
  // The seeded `operator.assigned` activity (platform-activity-s4).
  {
    n: 8,
    operator: 'awaitingConfirmation',
    platformId: DEMO_SCHOOL_PLATFORM_ID,
    assignedHoursAgo: 75,
  },
];

/** Stable, UUID-shaped assignment ids, like Core's. */
const assignmentId = (n: number) =>
  `6a2e9c40-1b3d-4e5f-8a7b-0c1d2e3f40${n.toString().padStart(2, '0')}`;

const HOUR_MS = 3_600_000;
const DAY = 24;

const org = (n: number): OrganizationId =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${n.toString().padStart(2, '0')}`);

/**
 * One Organization of the seed: its number (stable id), when it was created, and the figures its membership records are
 * generated from (`seedMemberships`): `memberships` active ones, `pendingRequests` pending ones. The figures are not kept
 * on the record: every view derives them from the memberships.
 */
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

/**
 * The main owner account's session user id (auth.fixtures, `DEMO_OWNER_ACCOUNT`): Core's `createdBy` is a user id, not
 * the business identity. A spec checks the two stay equal.
 */
export const DEMO_OWNER_USER_ID = '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e01';
/** A fictional organization admin of École Horizon (a member, not an Admin actor): a creator Admin cannot name. */
const ORG_ADMIN_USER_ID = '6a2f1c90-4d3e-4b2a-9c8d-7e6f5a4b3c21';

/**
 * Organization-admin invitations. Seven are ACTIVE (the counts every view shows: 2 at École Horizon, 1 each at five
 * other Organizations); École Horizon also has one of each other status, so its list shows every state without
 * changing the active counts. No code and no contact is ever kept. Every invitation is younger than its Organization
 * (École Horizon was created 2 hours before the seed's "now").
 */
const ADMIN_INVITATIONS: readonly {
  readonly id: string;
  readonly n: number;
  readonly invitationType: string;
  readonly contactBound: boolean;
  readonly createdHoursAgo: number;
  readonly lifetimeHours: number;
  readonly createdBy: string;
  readonly consumedHoursAgo?: number;
  readonly revokedHoursAgo?: number;
}[] = [
  {
    id: 'admin-invitation-1',
    n: 1,
    invitationType: 'org_admin',
    contactBound: true,
    createdHoursAgo: 0.5,
    lifetimeHours: 7 * DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  {
    id: 'admin-invitation-2',
    n: 1,
    invitationType: 'manager',
    contactBound: false,
    createdHoursAgo: 1,
    lifetimeHours: 3 * DAY,
    createdBy: ORG_ADMIN_USER_ID,
  },
  {
    id: 'admin-invitation-3',
    n: 3,
    invitationType: 'org_admin',
    contactBound: true,
    createdHoursAgo: 26,
    lifetimeHours: 7 * DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  {
    id: 'admin-invitation-4',
    n: 4,
    invitationType: 'org_admin',
    contactBound: false,
    createdHoursAgo: 30,
    lifetimeHours: 3 * DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  {
    id: 'admin-invitation-5',
    n: 6,
    invitationType: 'org_admin',
    contactBound: true,
    createdHoursAgo: 8,
    lifetimeHours: DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  {
    id: 'admin-invitation-6',
    n: 18,
    invitationType: 'fleet_manager',
    contactBound: true,
    createdHoursAgo: 100,
    lifetimeHours: 7 * DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  {
    id: 'admin-invitation-7',
    n: 19,
    invitationType: 'fleet_manager',
    contactBound: false,
    createdHoursAgo: 40,
    lifetimeHours: 3 * DAY,
    createdBy: DEMO_OWNER_USER_ID,
  },
  // École Horizon's history: used, revoked, expired (none of them active).
  {
    id: 'admin-invitation-8',
    n: 1,
    invitationType: 'org_admin',
    contactBound: true,
    createdHoursAgo: 1.75,
    lifetimeHours: DAY,
    createdBy: DEMO_OWNER_USER_ID,
    consumedHoursAgo: 1.6,
  },
  {
    id: 'admin-invitation-9',
    n: 1,
    invitationType: 'org_admin',
    contactBound: false,
    createdHoursAgo: 1.5,
    lifetimeHours: DAY,
    createdBy: DEMO_OWNER_USER_ID,
    revokedHoursAgo: 1.25,
  },
  {
    id: 'admin-invitation-10',
    n: 1,
    invitationType: 'manager',
    contactBound: false,
    createdHoursAgo: 1.9,
    lifetimeHours: 1,
    createdBy: DEMO_OWNER_USER_ID,
  },
];

const ACTIVITY: readonly (Omit<PlatformActivityRecord, 'occurredAt'> & {
  readonly hoursAgo: number;
})[] = [
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
    action: 'admin_invitation.created',
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
    action: 'admin_invitation.created',
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
    assistedPayments: o.assistedPayments ?? 'inherit',
    taxCode: null,
    address: null,
    phone: null,
    type: null,
    updatedAt: at(-o.createdHoursAgo),
  }));
  // École Horizon's admin is the person who accepted its used invitation (admin-invitation-8).
  const horizonAdmin = ADMIN_INVITATIONS.find((i) => i.consumedHoursAgo !== undefined);
  const { members, memberships } = seedMemberships(
    ORGANIZATIONS.map((o) => ({
      organizationId: org(o.n),
      platformId: o.platformId,
      createdAt: now - o.createdHoursAgo * HOUR_MS,
      active: o.memberships,
      pending: o.pendingRequests,
      rejected: o.n % 4 === 1 ? 1 : 0,
      revoked: o.n === 1 ? 1 : 0,
      ...(o.n === horizonAdmin?.n && horizonAdmin.consumedHoursAgo !== undefined
        ? { adminJoinedAt: now - horizonAdmin.consumedHoursAgo * HOUR_MS }
        : {}),
    })),
    S,
    now,
  );
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
    operators: (Object.keys(DEMO_OPERATOR_IDS) as DemoOperatorKey[]).map((key) => {
      const contact = DEMO_OPERATOR_CONTACTS[key];
      const created = OPERATOR_CREATED_HOURS_AGO[key];
      return {
        id: DEMO_OPERATOR_IDS[key],
        email: 'email' in contact ? contact.email : null,
        phone: 'phone' in contact ? contact.phone : null,
        createdAt: at(-created),
        contactConfirmedAt: DEMO_OPERATOR_CONFIRMED[key] ? at(-created + 1) : null,
        blocked: key === 'blocked',
      };
    }),
    assignments: ASSIGNMENTS.map((a) => ({
      id: assignmentId(a.n),
      operatorId: DEMO_OPERATOR_IDS[a.operator],
      platformId: a.platformId,
      assignedBy: DEMO_OWNER_ID,
      assignedAt: at(-a.assignedHoursAgo),
      revokedAt: a.revokedHoursAgo === undefined ? null : at(-a.revokedHoursAgo),
      revokedBy: a.revokedHoursAgo === undefined ? null : DEMO_OWNER_ID,
    })),
    subscriptions: ORGANIZATIONS.flatMap((o) =>
      o.subscriptionEndsInHours === undefined
        ? []
        : [{ organizationId: org(o.n), endsAt: at(o.subscriptionEndsInHours) }],
    ),
    adminInvitations: ADMIN_INVITATIONS.map((i) => ({
      id: i.id,
      organizationId: org(i.n),
      invitationType: i.invitationType,
      contactBound: i.contactBound,
      createdAt: at(-i.createdHoursAgo),
      expiresAt: at(-i.createdHoursAgo + i.lifetimeHours),
      createdBy: i.createdBy,
      consumedAt: i.consumedHoursAgo === undefined ? null : at(-i.consumedHoursAgo),
      revokedAt: i.revokedHoursAgo === undefined ? null : at(-i.revokedHoursAgo),
      revokedBy: i.revokedHoursAgo === undefined ? null : DEMO_OWNER_USER_ID,
    })),
    members,
    memberships,
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
    sequence: 0,
    idempotency: [],
  };
}
