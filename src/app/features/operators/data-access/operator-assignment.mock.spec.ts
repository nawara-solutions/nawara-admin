import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState, DemoStepUpMethod } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { platformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { grantsOf, platformViewerOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { UnavailableOperatorAssignmentGateway } from './operator-assignment.gateway';
import {
  MockOperatorAssignmentGateway,
  OPERATOR_ASSIGNMENT_DEMO_SCENARIO,
  OperatorAssignmentDemoScenario,
} from './operator.mock';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;
const ID = DEMO_OPERATOR_IDS;
const GRANT = 'platform_assignment.grant';
const REVOKE = 'platform_assignment.revoke';

function setup(
  signedInAs: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: OperatorAssignmentDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: OPERATOR_ASSIGNMENT_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  if (signedInAs !== null)
    auth.signedIn.set({
      identity: {
        userId: signedInAs,
        email: 'x@x.invalid',
        phone: null,
        adminTier: signedInAs === DEMO_OWNER_ID ? 'owner' : 'operator',
      },
      businessIdentityId: signedInAs,
    });
  const user = signedInAs ?? 'nobody';
  return {
    gateway: TestBed.runInInjectionContext(() => new MockOperatorAssignmentGateway()),
    world: TestBed.inject(DemoWorld),
    auth,
    /** A live step-up of `purpose` for the signed-in user, proved with `method`. */
    stepUp: (purpose: string, method: DemoStepUpMethod = 'totp', userId = user) =>
      auth.issueStepUp(purpose, userId, NOW + 60_000, method),
    live: (token: string, purpose: string) => auth.checkStepUp(token, purpose, user, NOW),
  };
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockOperatorAssignmentGateway: grant and revoke (P6-S2)', () => {
  it('grants with the grant step-up, answers Core’s record and spends the step-up only then', async () => {
    const s = setup();
    const token = s.stepUp(GRANT);
    const record = await firstValueFrom(s.gateway.grant(ID.unassigned, S, { stepUpToken: token }));
    expect(record).toMatchObject({
      platformId: S,
      active: true,
      revokedAt: null,
      assignedBy: DEMO_OWNER_ID,
    });
    expect(s.live(token, GRANT)).toBe(false);
    expect(grantsOf(s.world.snapshot(), ID.unassigned).platformAssignments).toEqual([S]);
    // The same, already spent, step-up is refused for a second change.
    expect((await error(s.gateway.revoke(ID.unassigned, S, { stepUpToken: token }))).status).toBe(
      403,
    );
  });

  it('revokes with the revoke step-up (204), after which the operator’s requests on that Platform are refused', async () => {
    const s = setup();
    expect(platformViewerOf(s.world.snapshot(), ID.phone, D)).toBe('operator');
    await firstValueFrom(s.gateway.revoke(ID.phone, D, { stepUpToken: s.stepUp(REVOKE) }));
    expect(platformViewerOf(s.world.snapshot(), ID.phone, D)).toBeNull();
    const history = await firstValueFrom(s.gateway.history(ID.phone));
    expect(history.map((a) => a.active)).toEqual([false, false]);
  });

  it('accepts each of Core’s three factors for both purposes', async () => {
    for (const method of ['totp', 'webauthn', 'secret_key'] as const) {
      TestBed.resetTestingModule();
      const s = setup();
      await firstValueFrom(
        s.gateway.grant(ID.unassigned, D, { stepUpToken: s.stepUp(GRANT, method) }),
      );
      await firstValueFrom(
        s.gateway.revoke(ID.unassigned, D, { stepUpToken: s.stepUp(REVOKE, method) }),
      );
    }
  });

  it('refuses a step-up of the other purpose, another user’s, an expired one or none, spending nothing', async () => {
    const s = setup();
    const revokeToken = s.stepUp(REVOKE);
    const refused = await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: revokeToken }));
    expect(refused).toEqual({ kind: 'forbidden', code: 'step_up_required', status: 403 });
    expect(s.live(revokeToken, REVOKE)).toBe(true);
    const grantToken = s.stepUp(GRANT);
    expect((await error(s.gateway.revoke(ID.school, S, { stepUpToken: grantToken }))).status).toBe(
      403,
    );
    expect(s.live(grantToken, GRANT)).toBe(true);
    const others = s.stepUp(GRANT, 'totp', 'someone-else');
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: others }))).status).toBe(
      403,
    );
    const expired = s.auth.issueStepUp(GRANT, DEMO_OWNER_ID, NOW - 1, 'totp');
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: expired }))).status).toBe(
      403,
    );
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: '' }))).status).toBe(403);
    expect(s.world.snapshot().assignments).toHaveLength(8);
  });

  it('leaves the step-up unspent on a 409 (already active) and a 404 (nothing active)', async () => {
    const s = setup();
    const grant = s.stepUp(GRANT);
    expect(await error(s.gateway.grant(ID.school, S, { stepUpToken: grant }))).toEqual({
      kind: 'conflict',
      code: 'assignment_conflict',
      status: 409,
    });
    expect(s.live(grant, GRANT)).toBe(true);
    const revoke = s.stepUp(REVOKE);
    expect((await error(s.gateway.revoke(ID.unassigned, S, { stepUpToken: revoke }))).status).toBe(
      404,
    );
    expect(s.live(revoke, REVOKE)).toBe(true);
  });

  it('gives exactly one active record to two concurrent grants: one 201, one 409', async () => {
    const s = setup();
    const results = await Promise.allSettled([
      firstValueFrom(s.gateway.grant(ID.unassigned, S, { stepUpToken: s.stepUp(GRANT) })),
      firstValueFrom(s.gateway.grant(ID.unassigned, S, { stepUpToken: s.stepUp(GRANT) })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    const active = s.world
      .snapshot()
      .assignments.filter(
        (a) => a.operatorId === ID.unassigned && a.platformId === S && a.revokedAt === null,
      );
    expect(active).toHaveLength(1);
  });

  it('refuses a repeated removal with the collapsed 404', async () => {
    const s = setup();
    await firstValueFrom(s.gateway.revoke(ID.school, S, { stepUpToken: s.stepUp(REVOKE) }));
    expect(
      (await error(s.gateway.revoke(ID.school, S, { stepUpToken: s.stepUp(REVOKE) }))).status,
    ).toBe(404);
  });

  it('refuses an operator (on any record, their own included) with 403, and no session with 401', async () => {
    const s = setup(ID.multi);
    const own = s.stepUp(GRANT);
    expect((await error(s.gateway.grant(ID.multi, D, { stepUpToken: own }))).status).toBe(403);
    expect(
      (await error(s.gateway.revoke(ID.multi, S, { stepUpToken: s.stepUp(REVOKE) }))).status,
    ).toBe(403);
    expect(grantsOf(s.world.snapshot(), ID.multi).platformAssignments).toEqual([S, D]);
    s.auth.signedIn.set(null);
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: own }))).status).toBe(401);
  });

  it('collapses an unknown or foreign operator or Platform into 404 before checking the step-up', async () => {
    const s = setup();
    const token = s.stepUp(GRANT);
    expect((await error(s.gateway.grant('nobody', S, { stepUpToken: token }))).status).toBe(404);
    const foreign = platformId('5b8d2a10-0000-4000-8000-000000000000');
    expect(
      (await error(s.gateway.grant(ID.unassigned, foreign, { stepUpToken: token }))).status,
    ).toBe(404);
    expect(s.live(token, GRANT)).toBe(true);
  });

  it('simulates a change made elsewhere first (409 / 404) without spending the step-up', async () => {
    const s = setup(DEMO_OWNER_ID, 'changedElsewhere');
    const grant = s.stepUp(GRANT);
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: grant }))).status).toBe(
      409,
    );
    expect(s.live(grant, GRANT)).toBe(true);
    const revoke = s.stepUp(REVOKE);
    expect((await error(s.gateway.revoke(ID.school, S, { stepUpToken: revoke }))).status).toBe(404);
    expect(s.live(revoke, REVOKE)).toBe(true);
  });

  it('simulates a lost answer: committed and spent, reported as a network error', async () => {
    const s = setup(DEMO_OWNER_ID, 'outcomeUnknown');
    const token = s.stepUp(GRANT);
    expect((await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: token }))).kind).toBe(
      'network',
    );
    expect(s.live(token, GRANT)).toBe(false);
    expect(grantsOf(s.world.snapshot(), ID.unassigned).platformAssignments).toEqual([S]);
  });

  it('simulates hierarchy_unavailable for a grant only, before anything is checked or written', async () => {
    const s = setup(DEMO_OWNER_ID, 'hierarchyUnavailable');
    const token = s.stepUp(GRANT);
    expect(await error(s.gateway.grant(ID.unassigned, S, { stepUpToken: token }))).toEqual({
      kind: 'unavailable',
      code: 'hierarchy_unavailable',
      status: 503,
    });
    expect(s.live(token, GRANT)).toBe(true);
    await firstValueFrom(s.gateway.revoke(ID.school, S, { stepUpToken: s.stepUp(REVOKE) }));
  });

  it('simulates a refusal before anything (503) and throttling (429 without detail)', async () => {
    const down = setup(DEMO_OWNER_ID, 'unavailable');
    expect(
      (await error(down.gateway.revoke(ID.school, S, { stepUpToken: down.stepUp(REVOKE) }))).status,
    ).toBe(503);
    TestBed.resetTestingModule();
    const limited = setup(DEMO_OWNER_ID, 'rateLimited');
    expect(
      await error(limited.gateway.grant(ID.unassigned, S, { stepUpToken: limited.stepUp(GRANT) })),
    ).toEqual({
      kind: 'rate_limited',
      status: 429,
    });
    expect(limited.world.snapshot().assignments).toHaveLength(8);
  });
});

describe('UnavailableOperatorAssignmentGateway (every non-demo build)', () => {
  it('offers no change and answers adapter_unavailable without a request', async () => {
    const gateway = new UnavailableOperatorAssignmentGateway();
    expect(gateway.available).toBe(false);
    for (const source of [gateway.grant(), gateway.revoke()] as Observable<unknown>[])
      expect(await error(source)).toMatchObject({
        kind: 'unavailable',
        code: 'adapter_unavailable',
      });
  });
});
