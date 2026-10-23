import { OrganizationId, PlatformId, organizationId } from './scope.model';
import { DEMO_DRIVE_PLATFORM_ID, DEMO_SCHOOL_PLATFORM_ID } from './scope-directory.fixtures';

/**
 * FICTIONAL demo Organizations of the two demo Platforms (docs/ARCHITECTURE.md §3), demo builds only. Not Core data and
 * not a Core contract. One record per Organization, with stable UUID-shaped ids, so that every demo figure about
 * Organizations is DERIVED from them (the Platform directory and the Platform dashboard agree by construction), and
 * so that the P2.5 Demo World can adopt them as they are.
 *
 * `subscription` and `assistedPayments` are frontend view values for the demo, not Core enums.
 */
export interface DemoOrganization {
  readonly id: OrganizationId;
  readonly platformId: PlatformId;
  /** User data: never translated. */
  readonly name: string;
  /** How long ago it was created, in hours (the mock turns it into an instant from the clock). */
  readonly createdHoursAgo: number;
  readonly memberships: number;
  /** Membership requests awaiting approval. */
  readonly pendingRequests: number;
  readonly subscription: 'active' | 'grace' | 'none';
  /** The Organization's assisted-payments override: inherit the Platform's setting, or disabled. */
  readonly assistedPayments: 'inherit' | 'disabled';
}

const DAY = 24;
const id = (n: number) =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${n.toString().padStart(2, '0')}`);

const org = (
  n: number,
  platformId: PlatformId,
  name: string,
  createdHoursAgo: number,
  memberships: number,
  pendingRequests: number,
  subscription: DemoOrganization['subscription'] = 'active',
  assistedPayments: DemoOrganization['assistedPayments'] = 'inherit',
): DemoOrganization => ({
  id: id(n),
  platformId,
  name,
  createdHoursAgo,
  memberships,
  pendingRequests,
  subscription,
  assistedPayments,
});

const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;

/** 16 School Organizations (920 memberships) and 8 Drive Organizations (460), the directory's figures. */
export const DEMO_ORGANIZATIONS: readonly DemoOrganization[] = [
  org(1, S, 'École Horizon', 2, 64, 3),
  org(2, S, 'Lycée Al Amal', 9 * DAY, 118, 0, 'grace'),
  org(3, S, 'Collège Riad', 38 * DAY, 87, 5),
  org(4, S, 'Institut Nour', 52 * DAY, 41, 1, 'none', 'disabled'),
  org(5, S, 'École Les Oliviers', 75 * DAY, 72, 0),
  org(6, S, 'École Ibn Sina', 120 * DAY, 52, 3),
  org(7, S, 'Lycée Averroès', 160 * DAY, 48, 0),
  org(8, S, 'Collège Al Andalous', 210 * DAY, 61, 0, 'active', 'disabled'),
  org(9, S, 'École Bab Al Bahr', 260 * DAY, 39, 0, 'none'),
  org(10, S, 'Institut Atlas Savoir', 300 * DAY, 55, 0),
  org(11, S, 'École Yasmine', 340 * DAY, 44, 0),
  org(12, S, 'Lycée Ibn Khaldoun', 390 * DAY, 50, 0),
  org(13, S, 'Collège Zitouna', 430 * DAY, 47, 0),
  org(14, S, 'École Les Palmiers', 480 * DAY, 58, 0),
  org(15, S, 'Institut Al Qalam', 530 * DAY, 43, 0),
  org(16, S, 'École Andalousia', 600 * DAY, 41, 0),
  org(17, D, 'Auto-École Atlas', 18 * DAY, 74, 2),
  org(18, D, 'Permis Express', 45 * DAY, 52, 0),
  org(19, D, 'Auto-École Sahara', 95 * DAY, 61, 2),
  org(20, D, 'Conduite Plus', 150 * DAY, 58, 0),
  org(21, D, 'Auto-École du Port', 220 * DAY, 55, 0, 'none'),
  org(22, D, 'Auto-École Médina', 280 * DAY, 57, 0),
  org(23, D, 'Route Sûre', 350 * DAY, 48, 0),
  org(24, D, 'Auto-École Andalous', 420 * DAY, 55, 0),
];

export const demoOrganizationsOf = (platform: PlatformId): readonly DemoOrganization[] =>
  DEMO_ORGANIZATIONS.filter((o) => o.platformId === platform);

/**
 * FICTIONAL per-Platform facts that are not about one Organization: active operator assignments (the directory's
 * figures), organization-admin invitations awaiting acceptance (7 in all, as on the Company Overview), people's
 * Personal Premium subscriptions in the product, payment issues, and the Platform's assisted-payments setting.
 */
export interface DemoPlatformFacts {
  readonly operatorAssignments: number;
  readonly adminInvitationsAwaiting: number;
  readonly personalPremium: number;
  /** Organizations with a payment that failed or awaits action (Payment facts). */
  readonly paymentIssues: readonly OrganizationId[];
  readonly assistedPayments: 'enabled' | 'disabled';
  /** Hours until an Organization in grace loses access (its 24-hour grace started 24 − this hours ago). */
  readonly graceEndsInHours: number;
  readonly activity: readonly {
    readonly id: string;
    readonly action:
      | 'organization.created'
      | 'admin_invitation.sent'
      | 'membership.approved'
      | 'operator.assigned';
    readonly organization: OrganizationId | null;
    readonly hoursAgo: number;
  }[];
}

export const DEMO_PLATFORM_FACTS: Readonly<Record<string, DemoPlatformFacts>> = {
  [S]: {
    operatorAssignments: 3,
    adminInvitationsAwaiting: 5,
    personalPremium: 21,
    paymentIssues: [id(3)],
    assistedPayments: 'enabled',
    graceEndsInHours: 18,
    activity: [
      {
        id: 'platform-activity-s1',
        action: 'organization.created',
        organization: id(1),
        hoursAgo: 2,
      },
      {
        id: 'platform-activity-s2',
        action: 'admin_invitation.sent',
        organization: id(3),
        hoursAgo: 26,
      },
      {
        id: 'platform-activity-s3',
        action: 'membership.approved',
        organization: id(2),
        hoursAgo: 50,
      },
      { id: 'platform-activity-s4', action: 'operator.assigned', organization: null, hoursAgo: 75 },
    ],
  },
  [D]: {
    operatorAssignments: 2,
    adminInvitationsAwaiting: 2,
    personalPremium: 9,
    paymentIssues: [id(21)],
    assistedPayments: 'disabled',
    graceEndsInHours: 18,
    activity: [
      {
        id: 'platform-activity-d1',
        action: 'membership.approved',
        organization: id(19),
        hoursAgo: 5,
      },
      {
        id: 'platform-activity-d2',
        action: 'admin_invitation.sent',
        organization: id(18),
        hoursAgo: 100,
      },
      {
        id: 'platform-activity-d3',
        action: 'organization.created',
        organization: id(17),
        hoursAgo: 18 * DAY,
      },
    ],
  },
};
