import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId, organizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { Section } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  MockOrganizationCommercialGateway,
  MockOrganizationGateway,
  ORGANIZATIONS_DEMO_SCENARIO,
  OrganizationsDemoScenario,
} from './organization.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;
const org = (n: number): OrganizationId =>
  organizationId(`3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c${n.toString().padStart(2, '0')}`);
const RIAD = org(3);
const AL_AMAL = org(2);
const NOUR = org(4);
const SAHARA = org(19);

function setUp(identity: AdminIdentityId | null, scenario: OrganizationsDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ORGANIZATIONS_DEMO_SCENARIO, useValue: scenario },
      MockOrganizationGateway,
      MockOrganizationCommercialGateway,
    ],
  });
  if (identity !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: {
        userId: identity,
        email: null,
        phone: null,
        adminTier: identity === DEMO_OWNER_ID ? 'owner' : 'operator',
      },
      businessIdentityId: identity,
    });
  return {
    organizations: TestBed.inject(MockOrganizationGateway),
    commercial: TestBed.inject(MockOrganizationCommercialGateway),
  };
}

async function error(answer: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(answer);
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

const data = <T>(section: Section<T>): T => {
  if (section.status !== 'available') throw new Error('expected an available section');
  return section.data;
};

describe('MockOrganizationGateway (demo world)', () => {
  it('lists the Platform’s Organizations newest first, from the world’s records', async () => {
    const { organizations } = setUp(DEMO_OWNER_ID);
    const school = await firstValueFrom(organizations.list(DEMO_SCHOOL_PLATFORM_ID));
    expect(school.platformId).toBe(DEMO_SCHOOL_PLATFORM_ID);
    expect(school.organizations).toHaveLength(16);
    expect(school.organizations[0]?.name).toBe('École Horizon');
    const created = school.organizations.map((o) => o.createdAt);
    expect(created).toEqual([...created].sort().reverse());
    expect(school.organizations.every((o) => o.platformId === DEMO_SCHOOL_PLATFORM_ID)).toBe(true);
    expect(
      (await firstValueFrom(organizations.list(DEMO_DRIVE_PLATFORM_ID))).organizations,
    ).toHaveLength(8);
  });

  it('gives the owner invitations and the Organization’s own activity', async () => {
    const { organizations } = setUp(DEMO_OWNER_ID);
    const riad = await firstValueFrom(organizations.load(RIAD));
    expect(riad).toMatchObject({
      id: RIAD,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
      name: 'Collège Riad',
    });
    expect(riad.memberships).toEqual({ status: 'available', value: 87 });
    expect(riad.pendingRequests).toEqual({ status: 'available', value: 5 });
    expect(data(riad.adminInvitationsAwaiting)).toEqual({ status: 'available', value: 1 });
    expect(data(riad.activity)).toEqual([
      {
        id: 'platform-activity-s2',
        action: 'admin_invitation.created',
        occurredAt: new Date(NOW - 26 * HOUR).toISOString(),
      },
    ]);
    expect(data((await firstValueFrom(organizations.load(NOUR))).activity)).toEqual([]);
  });

  it('gives an operator the hierarchy facts only', async () => {
    const { organizations } = setUp(DEMO_OPERATOR_IDS.school);
    const riad = await firstValueFrom(organizations.load(RIAD));
    expect(riad.pendingRequests).toEqual({ status: 'available', value: 5 });
    expect(riad.adminInvitationsAwaiting.status).toBe('unavailable');
    expect(riad.activity.status).toBe('unavailable');
  });

  it('answers one collapsed 404 for an unknown Organization and for one of another Platform', async () => {
    const { organizations } = setUp(DEMO_OPERATOR_IDS.school);
    expect((await error(organizations.load(organizationId('nope')))).status).toBe(404);
    expect((await error(organizations.load(SAHARA))).status).toBe(404);
    expect((await error(organizations.list(DEMO_DRIVE_PLATFORM_ID))).status).toBe(404);
  });

  it('answers 401 when nobody is signed in', async () => {
    const { organizations, commercial } = setUp(null);
    expect((await error(organizations.list(DEMO_SCHOOL_PLATFORM_ID))).status).toBe(401);
    expect((await error(organizations.load(RIAD))).status).toBe(401);
    expect((await error(commercial.load(RIAD))).status).toBe(401);
  });

  it('simulates an outage, a Platform without Organizations, and unavailable sections', async () => {
    expect(
      (await error(setUp(DEMO_OWNER_ID, 'error').organizations.list(DEMO_SCHOOL_PLATFORM_ID)))
        .status,
    ).toBe(503);
    TestBed.resetTestingModule();
    const empty = setUp(DEMO_OWNER_ID, 'empty');
    expect(
      (await firstValueFrom(empty.organizations.list(DEMO_SCHOOL_PLATFORM_ID))).organizations,
    ).toEqual([]);
    expect((await error(empty.organizations.load(RIAD))).status).toBe(404);
    TestBed.resetTestingModule();
    const partial = setUp(DEMO_OWNER_ID, 'partial');
    expect((await firstValueFrom(partial.organizations.load(RIAD))).activity.status).toBe(
      'unavailable',
    );
    expect((await firstValueFrom(partial.commercial.load(RIAD))).subscription.status).toBe(
      'unavailable',
    );
    expect((await error(partial.commercial.list(DEMO_SCHOOL_PLATFORM_ID))).status).toBe(503);
  });
});

describe('MockOrganizationCommercialGateway (demo world, owner only)', () => {
  it('refuses an operator', async () => {
    const { commercial } = setUp(DEMO_OPERATOR_IDS.school);
    expect((await error(commercial.list(DEMO_SCHOOL_PLATFORM_ID))).status).toBe(403);
    expect((await error(commercial.load(RIAD))).status).toBe(403);
  });

  it('derives each Organization’s subscription from its end date and the clock', async () => {
    const { commercial } = setUp(DEMO_OWNER_ID);
    const school = await firstValueFrom(commercial.list(DEMO_SCHOOL_PLATFORM_ID));
    expect(school.organizations).toHaveLength(16);
    const states = school.organizations.map((o) => o.subscription.state);
    expect(states.filter((s) => s === 'active')).toHaveLength(13);
    expect(states.filter((s) => s === 'grace')).toHaveLength(1);
    expect(states.filter((s) => s === 'none')).toHaveLength(2);
    const riad = await firstValueFrom(commercial.load(RIAD));
    expect(data(riad.subscription)).toEqual({
      state: 'active',
      endsAt: new Date(NOW + 6 * 24 * HOUR).toISOString(),
    });
    expect(data(riad.paymentIssues)).toEqual({ status: 'available', value: 1 });
    expect(data((await firstValueFrom(commercial.load(AL_AMAL))).subscription)).toEqual({
      state: 'grace',
      graceEndsAt: '2026-10-24T06:00:00.000Z',
    });
  });

  it('reports the effective assisted-payments policy and where it comes from', async () => {
    const { commercial } = setUp(DEMO_OWNER_ID);
    expect(data((await firstValueFrom(commercial.load(RIAD))).assistedPayments)).toEqual({
      effective: 'enabled',
      platform: 'enabled',
      organization: 'inherit',
    });
    expect(data((await firstValueFrom(commercial.load(NOUR))).assistedPayments)).toEqual({
      effective: 'disabled',
      platform: 'enabled',
      organization: 'disabled',
    });
    expect(data((await firstValueFrom(commercial.load(SAHARA))).assistedPayments)).toEqual({
      effective: 'disabled',
      platform: 'disabled',
      organization: 'inherit',
    });
  });
});
