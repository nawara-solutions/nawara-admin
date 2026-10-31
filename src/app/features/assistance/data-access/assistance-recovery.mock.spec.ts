import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  DEMO_FOREIGN_COMPANY_ID,
  DEMO_FOREIGN_PLATFORM_ID,
  demoAssistanceCases,
} from '../../../demo/world/assistance/assistance.seed';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { AssistanceReadContext } from '../domain/assistance-read-context';
import { FIRST_ASSISTANCE_PAGE, RecoveryFilter } from '../domain/assistance-read.model';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from './assistance.mock';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const COMPANY: AssistanceReadContext = { companyId: DEMO_COMPANY_ID, platformId: null };
const SCHOOL: AssistanceReadContext = { ...COMPANY, platformId: DEMO_SCHOOL_PLATFORM_ID };
const DRIVE: AssistanceReadContext = { ...COMPANY, platformId: DEMO_DRIVE_PLATFORM_ID };
const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = CASES.filter((c) => c.companyId === DEMO_COMPANY_ID);
const FOREIGN = CASES.filter((c) => c.companyId !== DEMO_COMPANY_ID);
const caseOf = (n: number) => OWN[n - 1]!;
const recoveryOf = (n: number) => caseOf(n).recovery!;

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: AssistanceDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ASSISTANCE_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  if (as !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: {
        userId: as,
        email: null,
        phone: null,
        adminTier: as === DEMO_OWNER_ID ? 'owner' : 'operator',
      },
      businessIdentityId: as,
    });
  return {
    gateway: TestBed.runInInjectionContext(() => new MockAssistanceGateway()),
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

const ids = async (gateway: MockAssistanceGateway, filter: RecoveryFilter, context = COMPANY) =>
  (
    await firstValueFrom(gateway.recoveryObligations(context, filter, FIRST_ASSISTANCE_PAGE))
  ).items.map((o) => o.id);

describe('MockAssistanceGateway (A9): recovery discovery and the owner read', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists the Company's obligations newest opened first; the by-id read is Core's BIL-28 shape, unchanged", async () => {
    const { gateway } = setUp();
    expect(await ids(gateway, {})).toEqual([13, 14].map((n) => recoveryOf(n).id));
    const detail = await firstValueFrom(gateway.recoveryObligation(COMPANY, recoveryOf(14).id));
    expect(detail).toEqual(recoveryOf(14));
    expect(detail.channels.map((c) => [c.paymentRequestStatus, c.active])).toEqual([
      ['failed', false],
      ['expired', false],
    ]);
  });

  it('filters by state and by a surplus still owed (Core’s only owner discovery path, CF-68)', async () => {
    const { gateway } = setUp();
    expect(await ids(gateway, { state: 'open' })).toEqual([recoveryOf(13).id]);
    expect(await ids(gateway, { state: 'recovered' })).toEqual([recoveryOf(14).id]);
    expect(await ids(gateway, { surplusOwed: true })).toEqual([recoveryOf(14).id]);
    expect(await ids(gateway, { surplusOwed: false })).toEqual([recoveryOf(13).id]);
    expect(await ids(gateway, { state: 'open', surplusOwed: true })).toEqual([]);
  });

  it('pages by keyset and refuses a limit, cursor or filter Core would refuse', async () => {
    const { gateway } = setUp();
    const first = await firstValueFrom(
      gateway.recoveryObligations(COMPANY, {}, { after: null, limit: 1 }),
    );
    const second = await firstValueFrom(
      gateway.recoveryObligations(COMPANY, {}, { after: first.next, limit: 1 }),
    );
    expect([...first.items, ...second.items].map((o) => o.id)).toEqual(
      [13, 14].map((n) => recoveryOf(n).id),
    );
    expect(second.next).toBeNull();
    for (const request of [
      { after: null, limit: 0 },
      { after: FOREIGN.find((c) => c.recovery)!.recovery!.id, limit: 10 },
    ])
      expect((await error(gateway.recoveryObligations(COMPANY, {}, request))).status).toBe(400);
    for (const filter of [
      { state: 'written_off' },
      { state: 'partially_recovered' },
      { surplusOwed: 'yes' },
    ] as unknown as RecoveryFilter[])
      expect(
        (await error(gateway.recoveryObligations(COMPANY, filter, FIRST_ASSISTANCE_PAGE))).status,
      ).toBe(400);
  });

  it("never returns another Company's obligation; a Platform scope narrows; cross-scope ids are the collapsed 404", async () => {
    const { gateway } = setUp();
    const foreign = FOREIGN.flatMap((c) => (c.recovery ? [c.recovery.id] : []));
    expect(foreign.length).toBeGreaterThan(0);
    const visible = await ids(gateway, {});
    for (const id of foreign) expect(visible).not.toContain(id);
    expect(await ids(gateway, {}, SCHOOL)).toEqual(visible);
    expect(await ids(gateway, {}, DRIVE)).toEqual([]);
    for (const [context, id] of [
      [COMPANY, foreign[0]!],
      [DRIVE, recoveryOf(13).id],
      [COMPANY, 'a551c0de-0000-4000-8000-0000000fffff'],
      [COMPANY, 'not-a-uuid'],
    ] as const)
      expect((await error(gateway.recoveryObligation(context, id))).status).toBe(404);
    const other: AssistanceReadContext = { companyId: DEMO_FOREIGN_COMPANY_ID, platformId: null };
    expect(
      (await error(gateway.recoveryObligations(other, {}, FIRST_ASSISTANCE_PAGE))).status,
    ).toBe(404);
    const outside: AssistanceReadContext = { ...COMPANY, platformId: DEMO_FOREIGN_PLATFORM_ID };
    expect(
      (await error(gateway.recoveryObligations(outside, {}, FIRST_ASSISTANCE_PAGE))).status,
    ).toBe(404);
  });

  it('the owner only: signed out 401, an operator 403', async () => {
    let { gateway } = setUp(null);
    expect(
      (await error(gateway.recoveryObligations(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status,
    ).toBe(401);
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OPERATOR_IDS.multi));
    expect((await error(gateway.recoveryObligation(COMPANY, recoveryOf(13).id))).status).toBe(403);
  });

  it('empty and unavailable scenarios', async () => {
    let { gateway } = setUp(DEMO_OWNER_ID, 'empty');
    expect(
      await firstValueFrom(gateway.recoveryObligations(COMPANY, {}, FIRST_ASSISTANCE_PAGE)),
    ).toEqual({ items: [], next: null });
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OWNER_ID, 'unavailable'));
    expect(
      (await error(gateway.recoveryObligations(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status,
    ).toBe(503);
  });

  it('reads change nothing and send nothing: zero financial mutations', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { gateway, world } = setUp();
    const before = world.snapshot();
    for (const id of await ids(gateway, {}))
      await firstValueFrom(gateway.recoveryObligation(COMPANY, id));
    expect(world.snapshot()).toBe(before);
    expect(demoAssistanceCases(world.snapshot(), NOW)).toEqual(CASES);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
