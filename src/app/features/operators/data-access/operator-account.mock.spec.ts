import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DEMO_CONFIRMATION_CODE, DEMO_WORKING_CODE } from '../../../core/auth/auth.fixtures';
import { MockAuthGateway } from '../../../core/auth/auth.mock';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { OperatorIdentifier } from '../../../core/auth/operator-identifier';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { UnavailableOperatorAccountGateway } from './operator-account.gateway';
import {
  MockOperatorAccountGateway,
  OPERATOR_ACCOUNT_DEMO_SCENARIO,
  OperatorAccountDemoScenario,
} from './operator.mock';

const ID = DEMO_OPERATOR_IDS;
const SCHOOL_OP: OperatorIdentifier = {
  kind: 'email',
  email: 'operator.school@demo.nawara.invalid',
};
const NEW_OP: OperatorIdentifier = { kind: 'email', email: 'operator.new@demo.nawara.invalid' };

function setup(
  signedInAs: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: OperatorAccountDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-24T12:00:00Z') },
      { provide: OPERATOR_ACCOUNT_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  const asOwner = () =>
    auth.signedIn.set({
      identity: { userId: DEMO_OWNER_ID, email: 'o@x.invalid', phone: null, adminTier: 'owner' },
      businessIdentityId: DEMO_OWNER_ID,
    });
  if (signedInAs === DEMO_OWNER_ID) asOwner();
  else if (signedInAs !== null)
    auth.signedIn.set({
      identity: { userId: signedInAs, email: 'p@x.invalid', phone: null, adminTier: 'operator' },
      businessIdentityId: signedInAs,
    });
  const signIn = createEnvironmentInjector(
    [MockAuthGateway],
    TestBed.inject(EnvironmentInjector),
  ).get(MockAuthGateway);
  return {
    gateway: TestBed.runInInjectionContext(() => new MockOperatorAccountGateway()),
    signIn,
    auth,
    asOwner,
    world: TestBed.inject(DemoWorld),
    blocked: (id: AdminIdentityId) =>
      TestBed.inject(DemoWorld)
        .snapshot()
        .operators.find((o) => o.id === id)?.blocked,
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

describe('MockOperatorAccountGateway: block and unblock (P6-S3)', () => {
  it('blocks and unblocks with no step-up, the owner only, answering 204', async () => {
    const s = setup();
    await firstValueFrom(s.gateway.block(ID.school));
    expect(s.blocked(ID.school)).toBe(true);
    // A repeat is accepted (Core: 204 again, another audit record).
    await firstValueFrom(s.gateway.block(ID.school));
    await firstValueFrom(s.gateway.unblock(ID.school));
    expect(s.blocked(ID.school)).toBe(false);
    await firstValueFrom(s.gateway.unblock(ID.school));
    const records = s.world.snapshot().activity.filter((e) => e.platformId === null);
    expect(records.map((e) => e.action)).toEqual([
      'operator.blocked',
      'operator.blocked',
      'operator.unblocked',
      'operator.unblocked',
    ]);
  });

  it('refuses an operator (their own record included) with 403, no session with 401, a foreign id with 404', async () => {
    const asOperator = setup(ID.school);
    expect((await error(asOperator.gateway.block(ID.school))).status).toBe(403);
    expect((await error(asOperator.gateway.block(ID.multi))).status).toBe(403);
    asOperator.auth.signedIn.set(null);
    expect((await error(asOperator.gateway.unblock(ID.multi))).status).toBe(401);
    asOperator.asOwner();
    expect((await error(asOperator.gateway.block('another-company-operator'))).status).toBe(404);
    expect(asOperator.blocked(ID.school)).toBe(false);
  });

  it('cancels a working code issued before the block, and it stays invalid after the unblock', async () => {
    const s = setup();
    await firstValueFrom(s.signIn.requestWorkingCode(SCHOOL_OP));
    expect(s.auth.workingCodes.size).toBe(1);
    await firstValueFrom(s.gateway.block(ID.school));
    expect(s.auth.workingCodes.size).toBe(0);
    // Blocked: no code is issued, none redeemed.
    await firstValueFrom(s.signIn.requestWorkingCode(SCHOOL_OP));
    expect(s.auth.workingCodes.size).toBe(0);
    await firstValueFrom(s.gateway.unblock(ID.school));
    expect((await error(s.signIn.verifyWorkingCode(SCHOOL_OP, DEMO_WORKING_CODE))).status).toBe(
      401,
    );
    // A fresh sign-in works: a new code.
    await firstValueFrom(s.signIn.requestWorkingCode(SCHOOL_OP));
    await firstValueFrom(s.signIn.verifyWorkingCode(SCHOOL_OP, DEMO_WORKING_CODE));
    expect(s.auth.signedIn()?.businessIdentityId).toBe(ID.school);
  });

  it('cancels an unconfirmed operator’s confirmation code for good (CF-16): unblocking does not restore it', async () => {
    const s = setup();
    const userId = '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e18';
    expect(s.auth.confirmationCodes.has(userId)).toBe(true);
    await firstValueFrom(s.gateway.block(ID.awaitingConfirmation));
    expect(s.auth.confirmationCodes.has(userId)).toBe(false);
    await firstValueFrom(s.gateway.unblock(ID.awaitingConfirmation));
    expect(
      (await error(s.signIn.confirmOperatorContact(NEW_OP, DEMO_CONFIRMATION_CODE))).status,
    ).toBe(401);
    expect(
      s.world.snapshot().operators.find((o) => o.id === ID.awaitingConfirmation)
        ?.contactConfirmedAt,
    ).toBeNull();
  });

  it('ends the blocked operator’s own simulated session, never another one', () => {
    const s = setup(ID.multi);
    s.auth.endOperatorSignIn(ID.school);
    expect(s.auth.signedIn()?.businessIdentityId).toBe(ID.multi);
    s.auth.endOperatorSignIn(ID.multi);
    expect(s.auth.signedIn()).toBeNull();
  });

  it('commits nothing on an audit failure (500) or 503, and commits on a lost answer', async () => {
    const audit = setup(DEMO_OWNER_ID, 'auditFailure');
    expect((await error(audit.gateway.block(ID.school))).status).toBe(500);
    expect(audit.blocked(ID.school)).toBe(false);
    TestBed.resetTestingModule();
    const down = setup(DEMO_OWNER_ID, 'unavailable');
    expect((await error(down.gateway.block(ID.school))).status).toBe(503);
    expect(down.blocked(ID.school)).toBe(false);
    TestBed.resetTestingModule();
    const lost = setup(DEMO_OWNER_ID, 'outcomeUnknown');
    expect((await error(lost.gateway.block(ID.school))).kind).toBe('network');
    expect(lost.blocked(ID.school)).toBe(true);
  });
});

describe('UnavailableOperatorAccountGateway (every non-demo build)', () => {
  it('offers nothing and answers adapter_unavailable', async () => {
    const gateway = new UnavailableOperatorAccountGateway();
    expect(gateway.available).toBe(false);
    for (const source of [gateway.block(), gateway.unblock()])
      expect(await error(source)).toMatchObject({
        kind: 'unavailable',
        code: 'adapter_unavailable',
      });
  });
});
