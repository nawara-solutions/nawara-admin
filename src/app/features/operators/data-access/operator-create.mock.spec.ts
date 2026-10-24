import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DEMO_CONFIRMATION_CODE, DEMO_WORKING_CODE } from '../../../core/auth/auth.fixtures';
import { MockAuthGateway } from '../../../core/auth/auth.mock';
import { CODE_ATTEMPTS, DemoAuthState } from '../../../core/auth/auth.mock-state';
import { OperatorIdentifier } from '../../../core/auth/operator-identifier';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId, adminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { assignmentHistoryOf, operatorProfileOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OperatorContact } from '../domain/operator.model';
import { UnavailableOperatorAccountGateway } from './operator-account.gateway';
import {
  MockOperatorAccountGateway,
  OPERATOR_ACCOUNT_DEMO_SCENARIO,
  OperatorAccountDemoScenario,
} from './operator.mock';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const NEW: OperatorContact = { kind: 'email', email: 'created.operator@demo.nawara.invalid' };
const CONFLICT = { kind: 'conflict', code: 'account_already_exists', status: 409 };

function setup(scenario: OperatorAccountDemoScenario = 'normal') {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: OPERATOR_ACCOUNT_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  const auth = TestBed.inject(DemoAuthState);
  const world = TestBed.inject(DemoWorld);
  const asOwner = () =>
    auth.signedIn.set({
      identity: { userId: DEMO_OWNER_ID, email: 'o@x.invalid', phone: null, adminTier: 'owner' },
      businessIdentityId: DEMO_OWNER_ID,
    });
  asOwner();
  const signIn = createEnvironmentInjector(
    [MockAuthGateway],
    TestBed.inject(EnvironmentInjector),
  ).get(MockAuthGateway);
  return {
    gateway: TestBed.runInInjectionContext(() => new MockOperatorAccountGateway()),
    signIn,
    auth,
    world,
    asOwner,
    /** A live owner grant for `purpose` (what `MockStepUpGateway` would issue for the right code). */
    grant: (purpose = 'operator.create', userId: string = DEMO_OWNER_ID) =>
      auth.issueStepUp(purpose, userId, NOW + 60_000),
    profile: (id: string) => operatorProfileOf(world.snapshot(), adminIdentityId(id)),
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

describe('MockOperatorAccountGateway: create (P6-S4)', () => {
  it('creates one unconfirmed operator with no Platform access, spends the step-up and issues a code', async () => {
    const s = setup();
    const token = s.grant();
    const before = s.world.snapshot();
    const created = await firstValueFrom(s.gateway.create(NEW, { stepUpToken: token }));
    expect(created).toEqual({
      id: expect.any(String),
      email: 'created.operator@demo.nawara.invalid',
      phone: null,
      isActive: true,
    });
    const after = s.world.snapshot();
    expect(after.operators.length).toBe(before.operators.length + 1);
    expect(s.profile(created.id)).toMatchObject({ contactConfirmedAt: null, blocked: false });
    expect(assignmentHistoryOf(after, adminIdentityId(created.id))).toEqual([]);
    expect(after.activity.at(-1)).toMatchObject({
      action: 'operator.created',
      subjectId: created.id,
      platformId: null,
    });
    // Single use, and spent only now.
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(false);
    // The confirmation code is sign-in state; the world never holds it.
    expect(s.auth.confirmationCodes.get(created.id)).toBe(CODE_ATTEMPTS);
    expect(JSON.stringify(after)).not.toContain(DEMO_CONFIRMATION_CODE);
  });

  it('refuses a step-up that is missing, for another purpose, another user, or already spent', async () => {
    const s = setup();
    const stepUpRequired = { kind: 'forbidden', code: 'step_up_required', status: 403 };
    for (const stepUpToken of [
      '',
      s.grant('platform_assignment.grant'),
      s.grant('operator.create', 'someone-else'),
    ])
      expect(await error(s.gateway.create(NEW, { stepUpToken }))).toEqual(stepUpRequired);
    const once = s.grant();
    await firstValueFrom(s.gateway.create(NEW, { stepUpToken: once }));
    const other: OperatorContact = { kind: 'email', email: 'another@demo.nawara.invalid' };
    expect(await error(s.gateway.create(other, { stepUpToken: once }))).toEqual(stepUpRequired);
    expect(s.world.snapshot().operators.some((o) => o.email === other.email)).toBe(false);
  });

  it('refuses an operator (even assigned) with 403 and a caller without a session with 401', async () => {
    const s = setup();
    const token = s.grant();
    s.auth.signedIn.set({
      identity: {
        userId: DEMO_OPERATOR_IDS.multi,
        email: 'p@x.invalid',
        phone: null,
        adminTier: 'operator',
      },
      businessIdentityId: DEMO_OPERATOR_IDS.multi,
    });
    expect(await error(s.gateway.create(NEW, { stepUpToken: token }))).toMatchObject({
      kind: 'forbidden',
      status: 403,
    });
    s.auth.signedIn.set(null);
    expect(await error(s.gateway.create(NEW, { stepUpToken: token }))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
    expect(s.world.snapshot().operators.some((o) => o.email === NEW.email)).toBe(false);
  });

  it('answers the same 409 for a contact of any account kind, and leaves the step-up unspent', async () => {
    const s = setup();
    const member = s.world.snapshot().members.find((m) => m.email !== null)!;
    const taken: OperatorContact[] = [
      // Company staff (the world): an operator, by email and by formatted phone, and a member.
      { kind: 'email', email: 'Operator.School@demo.nawara.invalid' },
      { kind: 'phone', phone: '+999 (0000) 0001' },
      { kind: 'email', email: member.email! },
      // Sign-in fixtures the world does not keep: the owner, the member account, an enrollment owner, scenario operators.
      { kind: 'email', email: 'owner@demo.nawara.invalid' },
      { kind: 'email', email: 'member@demo.nawara.invalid' },
      { kind: 'email', email: 'enrollment.limited@demo.nawara.invalid' },
      { kind: 'email', email: 'operator.busy@demo.nawara.invalid' },
      { kind: 'email', email: 'operator.new.offline@demo.nawara.invalid' },
    ];
    const token = s.grant();
    const before = s.world.snapshot();
    for (const contact of taken)
      expect(await error(s.gateway.create(contact, { stepUpToken: token }))).toEqual(CONFLICT);
    expect(s.world.snapshot()).toBe(before);
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(true);
  });

  it('refuses a malformed contact with 400, unspent', async () => {
    const s = setup();
    const token = s.grant();
    expect(
      await error(s.gateway.create({ kind: 'email', email: 'nope' }, { stepUpToken: token })),
    ).toMatchObject({ kind: 'validation', status: 400 });
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(true);
  });

  it('auditFailure: Core’s 500 rolls back; nothing is created, spent or issued', async () => {
    const s = setup('auditFailure');
    const token = s.grant();
    const before = s.world.snapshot();
    expect(await error(s.gateway.create(NEW, { stepUpToken: token }))).toMatchObject({
      kind: 'unexpected',
      status: 500,
    });
    expect(s.world.snapshot()).toBe(before);
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(true);
    expect(s.auth.confirmationCodes.size).toBe(new DemoAuthState().confirmationCodes.size);
  });

  it('unavailable: 503 before anything is checked or applied', async () => {
    const s = setup('unavailable');
    const token = s.grant();
    const before = s.world.snapshot();
    expect(await error(s.gateway.create(NEW, { stepUpToken: token }))).toMatchObject({
      kind: 'unavailable',
      status: 503,
    });
    expect(s.world.snapshot()).toBe(before);
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(true);
  });

  it('outcomeUnknown: the creation commits but its answer is lost; a resend would be the ambiguous 409', async () => {
    const s = setup('outcomeUnknown');
    const token = s.grant();
    expect(await error(s.gateway.create(NEW, { stepUpToken: token }))).toMatchObject({
      kind: 'network',
    });
    const created = s.world.snapshot().operators.find((o) => o.email === NEW.email);
    expect(created).toBeDefined();
    expect(s.auth.checkStepUp(token, 'operator.create', DEMO_OWNER_ID, NOW)).toBe(false);
    expect(s.auth.confirmationCodes.get(created!.id)).toBe(CODE_ATTEMPTS);
    // Nothing is replayed by the mock; an explicit new attempt (fresh step-up) is told the contact is taken.
    expect(await error(s.gateway.create(NEW, { stepUpToken: s.grant() }))).toEqual(CONFLICT);
    expect(s.world.snapshot().operators.filter((o) => o.email === NEW.email).length).toBe(1);
  });

  it('is never offered or sent in a build without the mock (unavailable adapter)', async () => {
    const unavailable = new UnavailableOperatorAccountGateway();
    expect(unavailable.available).toBe(false);
    expect(await error(unavailable.create())).toMatchObject({ kind: 'unavailable' });
  });
});

describe('A created operator at sign-in (P6-S4, the demo world as the one source)', () => {
  async function created(s: ReturnType<typeof setup>, contact: OperatorContact = NEW) {
    const result = await firstValueFrom(s.gateway.create(contact, { stepUpToken: s.grant() }));
    return adminIdentityId(result.id);
  }

  const identifier = (contact: OperatorContact): OperatorIdentifier => contact;

  it('confirms the contact with the demo code, then signs in with a working code and has no Platform', async () => {
    const s = setup();
    const id = await created(s);
    s.auth.signedIn.set(null);
    const who = identifier(NEW);
    // Unconfirmed: Core sends no working code.
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    expect(await error(s.signIn.verifyWorkingCode(who, DEMO_WORKING_CODE))).toMatchObject({
      status: 401,
    });
    // A wrong confirmation code uses one attempt.
    expect(await error(s.signIn.confirmOperatorContact(who, '000000'))).toMatchObject({
      code: 'operator_code_invalid',
    });
    expect(s.auth.confirmationCodes.get(id)).toBe(CODE_ATTEMPTS - 1);
    await firstValueFrom(s.signIn.confirmOperatorContact(who, DEMO_CONFIRMATION_CODE));
    // The canonical account is confirmed (the directory shows the same); the code is used up.
    expect(s.profile(id)?.contactConfirmedAt).toBe(new Date(NOW).toISOString());
    expect(s.auth.confirmationCodes.has(id)).toBe(false);
    expect(s.auth.confirmedOperators.has(id)).toBe(false);
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    await firstValueFrom(s.signIn.verifyWorkingCode(who, DEMO_WORKING_CODE));
    expect(s.auth.signedIn()).toMatchObject({
      identity: { userId: id, adminTier: 'operator', email: NEW.email },
      businessIdentityId: id,
    });
    expect(await firstValueFrom(s.signIn.grants())).toEqual({
      companyId: null,
      platformAssignments: [],
    });
  });

  it('finds a phone-only created operator whatever formatting is typed', async () => {
    const s = setup();
    const id = await created(s, { kind: 'phone', phone: '+999 (0000) 0077' });
    await firstValueFrom(
      s.signIn.confirmOperatorContact(
        { kind: 'phone', phone: '+99900000077' },
        DEMO_CONFIRMATION_CODE,
      ),
    );
    expect(s.profile(id)?.contactConfirmedAt).not.toBeNull();
  });

  it('never lets an arbitrary contact confirm or sign in because it was typed', async () => {
    const s = setup();
    s.auth.signedIn.set(null);
    const stranger: OperatorIdentifier = { kind: 'email', email: 'stranger@demo.nawara.invalid' };
    expect(
      await error(s.signIn.confirmOperatorContact(stranger, DEMO_CONFIRMATION_CODE)),
    ).toMatchObject({ status: 401 });
    await firstValueFrom(s.signIn.requestWorkingCode(stranger));
    expect(await error(s.signIn.verifyWorkingCode(stranger, DEMO_WORKING_CODE))).toMatchObject({
      status: 401,
    });
    expect(s.auth.signedIn()).toBeNull();
  });

  it('blocked before confirmation: the code is cancelled for good; unblocking confirms nothing', async () => {
    const s = setup();
    const id = await created(s);
    await firstValueFrom(s.gateway.block(id));
    expect(s.auth.confirmationCodes.has(id)).toBe(false);
    await firstValueFrom(s.gateway.unblock(id));
    expect(s.profile(id)).toMatchObject({ blocked: false, contactConfirmedAt: null });
    // The cancelled code stays invalid after the unblock, and nothing reissues one (CF-16).
    expect(
      await error(s.signIn.confirmOperatorContact(identifier(NEW), DEMO_CONFIRMATION_CODE)),
    ).toMatchObject({ code: 'operator_code_invalid' });
    expect(s.profile(id)?.contactConfirmedAt).toBeNull();
    expect(s.auth.confirmationCodes.has(id)).toBe(false);
  });

  it('blocked after confirmation: the unused working code is cancelled and stays invalid after unblock', async () => {
    const s = setup();
    const id = await created(s);
    const who = identifier(NEW);
    await firstValueFrom(s.signIn.confirmOperatorContact(who, DEMO_CONFIRMATION_CODE));
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    expect(s.auth.workingCodes.get(id)).toBe(CODE_ATTEMPTS);
    await firstValueFrom(s.gateway.block(id));
    expect(s.auth.workingCodes.has(id)).toBe(false);
    // While blocked, no code is issued.
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    expect(s.auth.workingCodes.has(id)).toBe(false);
    await firstValueFrom(s.gateway.unblock(id));
    expect(await error(s.signIn.verifyWorkingCode(who, DEMO_WORKING_CODE))).toMatchObject({
      status: 401,
    });
    // Unblocked and still confirmed: a NEW working code works.
    expect(s.profile(id)?.contactConfirmedAt).not.toBeNull();
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    await firstValueFrom(s.signIn.verifyWorkingCode(who, DEMO_WORKING_CODE));
    expect(s.auth.signedIn()?.businessIdentityId).toBe(id);
  });

  it('a block ends the created operator’s simulated session', async () => {
    const s = setup();
    const id: AdminIdentityId = await created(s);
    const who = identifier(NEW);
    await firstValueFrom(s.signIn.confirmOperatorContact(who, DEMO_CONFIRMATION_CODE));
    await firstValueFrom(s.signIn.requestWorkingCode(who));
    await firstValueFrom(s.signIn.verifyWorkingCode(who, DEMO_WORKING_CODE));
    expect(s.auth.signedIn()?.businessIdentityId).toBe(id);
    s.auth.endOperatorSignIn(id);
    expect(s.auth.signedIn()).toBeNull();
  });
});
