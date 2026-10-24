import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { companyId } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE, AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { UnavailableOperatorAssignmentGateway } from './operator-assignment.gateway';
import { UnavailableOperatorDirectoryGateway } from './operator-directory.gateway';
import {
  MockOperatorAssignmentGateway,
  MockOperatorDirectoryGateway,
  OPERATOR_DIRECTORY_DEMO_SCENARIO,
  OPERATOR_HISTORY_DEMO_SCENARIO,
} from './operator.mock';

const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;
const ID = DEMO_OPERATOR_IDS;

function setup(
  signedInAs: AdminIdentityId | null = DEMO_OWNER_ID,
  { directory = 'normal', history = 'normal' } = {} as {
    directory?: 'normal' | 'empty' | 'error';
    history?: 'normal' | 'error';
  },
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: OPERATOR_DIRECTORY_DEMO_SCENARIO, useValue: directory },
      { provide: OPERATOR_HISTORY_DEMO_SCENARIO, useValue: history },
    ],
  });
  if (signedInAs !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: { userId: signedInAs, email: 'x@x.invalid', phone: null, adminTier: 'owner' },
      businessIdentityId: signedInAs,
    });
  return {
    directory: TestBed.runInInjectionContext(() => new MockOperatorDirectoryGateway()),
    history: TestBed.runInInjectionContext(() => new MockOperatorAssignmentGateway()),
    world: TestBed.inject(DemoWorld),
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

describe('MockOperatorDirectoryGateway (provisional, CF-03)', () => {
  it('lists every operator of the Company, deterministically, with active Platforms only', async () => {
    const { directory } = setup();
    const list = await firstValueFrom(directory.list(DEMO_COMPANY_ID));
    expect(list.map((o) => o.id)).toEqual([
      ID.school,
      ID.multi,
      ID.phone,
      ID.unassigned,
      ID.awaitingConfirmation,
      ID.blocked,
    ]);
    const by = new Map(list.map((o) => [o.id, o]));
    expect(by.get(ID.school)?.activePlatformIds).toEqual([S]);
    expect(by.get(ID.multi)?.activePlatformIds).toEqual([S, D]);
    // The removed Drive record does not count; the re-grant does.
    expect(by.get(ID.phone)?.activePlatformIds).toEqual([D]);
    expect(by.get(ID.unassigned)?.activePlatformIds).toEqual([]);
    expect(by.get(ID.blocked)?.activePlatformIds).toEqual([]);
    expect(by.get(ID.phone)?.contact).toEqual({ kind: 'phone', phone: '+99900000001' });
    expect(list.map((o) => o.accountState)).toEqual([
      'canSignIn',
      'canSignIn',
      'canSignIn',
      'canSignIn',
      'awaitingConfirmation',
      'blocked',
    ]);
    expect(await firstValueFrom(directory.list(DEMO_COMPANY_ID))).toEqual(list);
  });

  it('reads one operator, and answers the collapsed 404 for an unknown one or another Company', async () => {
    const { directory } = setup();
    expect((await firstValueFrom(directory.load(DEMO_COMPANY_ID, ID.multi))).contact).toEqual({
      kind: 'email',
      email: 'operator.multi@demo.nawara.invalid',
    });
    expect((await error(directory.load(DEMO_COMPANY_ID, 'nobody'))).status).toBe(404);
    // The owner is not an operator.
    expect((await error(directory.load(DEMO_COMPANY_ID, DEMO_OWNER_ID))).status).toBe(404);
    const other = companyId('another-company');
    expect((await error(directory.list(other))).status).toBe(404);
    expect((await error(directory.load(other, ID.multi))).status).toBe(404);
  });

  it('answers the owner only: 403 for an operator (whatever their assignments), 401 without a session', async () => {
    const { directory } = setup(ID.multi);
    expect((await error(directory.list(DEMO_COMPANY_ID))).status).toBe(403);
    expect((await error(directory.load(DEMO_COMPANY_ID, ID.multi))).status).toBe(403);
    TestBed.inject(DemoAuthState).signedIn.set(null);
    expect((await error(directory.list(DEMO_COMPANY_ID))).status).toBe(401);
  });

  it('simulates an empty Company and an outage', async () => {
    expect(
      await firstValueFrom(
        setup(DEMO_OWNER_ID, { directory: 'empty' }).directory.list(DEMO_COMPANY_ID),
      ),
    ).toEqual([]);
    TestBed.resetTestingModule();
    expect(
      (await error(setup(DEMO_OWNER_ID, { directory: 'error' }).directory.list(DEMO_COMPANY_ID)))
        .status,
    ).toBe(503);
  });

  it('shows a contact the operator confirmed through sign-in (the world is the one source)', async () => {
    const { directory, world } = setup();
    world.commit((tables) => ({
      ok: true,
      world: {
        ...tables,
        operators: tables.operators.map((o) =>
          o.id === ID.awaitingConfirmation
            ? { ...o, contactConfirmedAt: '2026-10-23T11:00:00.000Z' }
            : o,
        ),
      },
      result: undefined,
    }));
    expect(
      (await firstValueFrom(directory.load(DEMO_COMPANY_ID, ID.awaitingConfirmation))).accountState,
    ).toBe('canSignIn');
  });
});

describe('MockOperatorAssignmentGateway (Core GET /auth/admin/operators/:id/platform-assignments)', () => {
  it('answers every record, active and removed, oldest first, in Core’s field names', async () => {
    const { history } = setup();
    const records = await firstValueFrom(history.history(ID.phone));
    expect(records).toHaveLength(2);
    expect(Object.keys(records[0] ?? {}).sort()).toEqual(
      ['active', 'assignedAt', 'assignedBy', 'id', 'platformId', 'revokedAt', 'revokedBy'].sort(),
    );
    const [removed, current] = records;
    expect(removed).toMatchObject({
      platformId: D,
      active: false,
      revokedBy: DEMO_OWNER_ID,
      assignedBy: DEMO_OWNER_ID,
    });
    expect(removed?.revokedAt).toMatch(/Z$/);
    expect(current).toMatchObject({
      platformId: D,
      active: true,
      revokedAt: null,
      revokedBy: null,
    });
    expect((removed?.assignedAt ?? '') < (current?.assignedAt ?? '')).toBe(true);
    expect(
      (await firstValueFrom(history.history(ID.multi))).map((a) => [a.platformId, a.active]),
    ).toEqual([
      [S, true],
      [D, true],
    ]);
    expect(await firstValueFrom(history.history(ID.unassigned))).toHaveLength(1);
  });

  it('is the owner’s only, and the collapsed 404 for an operator that is not the Company’s', async () => {
    const { history } = setup();
    expect((await error(history.history('nobody'))).status).toBe(404);
    TestBed.resetTestingModule();
    const asOperator = setup(ID.school);
    expect((await error(asOperator.history.history(ID.school))).status).toBe(403);
  });
});

describe('unavailable operator adapters (every non-demo build)', () => {
  it('answer adapter_unavailable for the directory, one operator and the history, with no request made', async () => {
    const directory = new UnavailableOperatorDirectoryGateway();
    const history = new UnavailableOperatorAssignmentGateway();
    for (const source of [
      directory.list(),
      directory.load(),
      history.history(),
    ] as Observable<unknown>[]) {
      const e = await error(source);
      expect(e).toMatchObject({ kind: 'unavailable', code: ADAPTER_UNAVAILABLE, status: 0 });
    }
  });
});
