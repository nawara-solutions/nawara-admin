import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { ListableMembershipStatus } from '../domain/membership.model';
import { MockMembershipGateway } from './membership.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');

function setUp(actor: AdminIdentityId | null, tier: 'owner' | 'operator' = 'owner') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      MockMembershipGateway,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set(
    actor === null
      ? null
      : {
          identity: { userId: `u-${actor}`, email: null, phone: null, adminTier: tier },
          businessIdentityId: actor,
        },
  );
  const gateway = TestBed.inject(MockMembershipGateway);
  return {
    world: TestBed.inject(DemoWorld),
    list: (status: ListableMembershipStatus, organization = HORIZON) =>
      firstValueFrom(gateway.list(organization, status)),
  };
}

async function error(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (e: unknown) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockMembershipGateway (Core’s membership list over the demo world)', () => {
  it('lists one status of one Organization, oldest request first, with exactly Core’s fields', async () => {
    const { list } = setUp(DEMO_OWNER_ID);
    const active = await list('active');
    expect(active.memberships).toHaveLength(64);
    expect(Object.keys(active.memberships[0]!).sort()).toEqual(
      [
        'approvedAt',
        'audience',
        'contactVerified',
        'email',
        'id',
        'isOrganizationAdmin',
        'phone',
        'rejectedAt',
        'requestedAt',
        'status',
        'userId',
      ].sort(),
    );
    const times = active.memberships.map((m) => m.requestedAt);
    expect([...times].sort()).toEqual(times);
    expect((await list('pending')).memberships).toHaveLength(3);
    expect((await list('rejected')).memberships).toHaveLength(1);
    expect(active.memberships.every((m) => m.status === 'active')).toBe(true);
  });

  it('never lists a revoked membership, and refuses a status Core cannot list', async () => {
    const { list, world } = setUp(DEMO_OWNER_ID);
    const revoked = world
      .snapshot()
      .memberships.filter((m) => m.organizationId === HORIZON && m.status === 'revoked');
    expect(revoked).toHaveLength(1);
    const listed = [
      ...(await list('active')).memberships,
      ...(await list('pending')).memberships,
      ...(await list('rejected')).memberships,
    ];
    expect(listed.some((m) => m.id === revoked[0]!.id)).toBe(false);
    expect((await error(list('revoked' as ListableMembershipStatus))).status).toBe(400);
  });

  it('lets an assigned operator read their Platform’s Organizations only; others get one collapsed 404', async () => {
    const operator = setUp(DEMO_OPERATOR_IDS.school, 'operator');
    expect((await operator.list('active')).memberships).toHaveLength(64);
    expect(await error(operator.list('active', ANDALOUS))).toMatchObject({
      status: 404,
      code: 'not_found',
    });
    TestBed.resetTestingModule();
    const unassigned = setUp(DEMO_OPERATOR_IDS.unassigned, 'operator');
    expect((await error(unassigned.list('active'))).status).toBe(404);
    TestBed.resetTestingModule();
    const owner = setUp(DEMO_OWNER_ID);
    expect(
      (await error(owner.list('active', organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3cff'))))
        .status,
    ).toBe(404);
    TestBed.resetTestingModule();
    const nobody = setUp(null);
    expect((await error(nobody.list('active'))).status).toBe(401);
  });
});
