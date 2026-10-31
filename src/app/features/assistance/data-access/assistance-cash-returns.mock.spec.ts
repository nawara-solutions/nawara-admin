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
import { CashReturnFilter, FIRST_ASSISTANCE_PAGE } from '../domain/assistance-read.model';
import { CASH_RETURN_STATES } from '../domain/assistance.model';
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
const obligationOf = (n: number) => caseOf(n).cashReturns[0]!;

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

const ids = async (gateway: MockAssistanceGateway, filter: CashReturnFilter, context = COMPANY) =>
  (await firstValueFrom(gateway.cashReturnCases(context, filter, FIRST_ASSISTANCE_PAGE))).items.map(
    (r) => r.obligation.id,
  );

describe('MockAssistanceGateway (A8): the cash-return projection', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists the Company's obligations, newest opened first, each with its own case's row", async () => {
    const { gateway } = setUp();
    const page = await firstValueFrom(gateway.cashReturnCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(page.next).toBeNull();
    // Opened: case 11 at -46 h, 8 at -76 h, 12 at -144 h, 10 at -183 h, 7 at -224 h.
    expect(page.items.map((r) => r.obligation.id)).toEqual(
      [11, 8, 12, 10, 7].map((n) => obligationOf(n).id),
    );
    for (const row of page.items)
      expect(row.case.requestId).toBe(row.obligation.assistanceRequestId);
    // Exactly the seeded record: nothing added, nothing recomputed.
    expect(page.items[0]!.obligation).toEqual(obligationOf(11));
  });

  it('filters by each of the four Core states, and by an open dispute', async () => {
    const { gateway } = setUp();
    const byState = {
      open: [11, 8],
      return_reported: [10],
      confirmed_returned: [7],
      superseded_by_settlement: [12],
    } as const;
    for (const state of CASH_RETURN_STATES)
      expect([state, await ids(gateway, { state })]).toEqual([
        state,
        byState[state].map((n) => obligationOf(n).id),
      ]);
    expect(await ids(gateway, { disputed: true })).toEqual([8, 10].map((n) => obligationOf(n).id));
    expect(await ids(gateway, { disputed: false })).toEqual(
      [11, 12, 7].map((n) => obligationOf(n).id),
    );
    expect(await ids(gateway, { state: 'return_reported', disputed: true })).toEqual([
      obligationOf(10).id,
    ]);
  });

  it('pages by keyset and refuses a limit or cursor Core would refuse', async () => {
    const { gateway } = setUp();
    const first = await firstValueFrom(
      gateway.cashReturnCases(COMPANY, {}, { after: null, limit: 2 }),
    );
    const second = await firstValueFrom(
      gateway.cashReturnCases(COMPANY, {}, { after: first.next, limit: 2 }),
    );
    const third = await firstValueFrom(
      gateway.cashReturnCases(COMPANY, {}, { after: second.next, limit: 2 }),
    );
    expect([first, second, third].map((p) => p.items.length)).toEqual([2, 2, 1]);
    expect(third.next).toBeNull();
    expect([...first.items, ...second.items, ...third.items].map((r) => r.obligation.id)).toEqual(
      [11, 8, 12, 10, 7].map((n) => obligationOf(n).id),
    );
    for (const request of [
      { after: null, limit: 0 },
      { after: null, limit: 201 },
      { after: FOREIGN[0]!.cashReturns[0]!.id, limit: 10 },
    ])
      expect((await error(gateway.cashReturnCases(COMPANY, {}, request))).status).toBe(400);
  });

  it("never returns another Company's obligation, and keeps a Platform scope", async () => {
    const { gateway } = setUp();
    const foreign = FOREIGN.flatMap((c) => c.cashReturns.map((o) => o.id));
    expect(foreign.length).toBeGreaterThan(0);
    const visible = await ids(gateway, {});
    for (const id of foreign) expect(visible).not.toContain(id);
    expect(await ids(gateway, {}, SCHOOL)).toEqual(visible);
    expect(await ids(gateway, {}, DRIVE)).toEqual([]);
    const other: AssistanceReadContext = { companyId: DEMO_FOREIGN_COMPANY_ID, platformId: null };
    expect((await error(gateway.cashReturnCases(other, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      404,
    );
    const outside: AssistanceReadContext = { ...COMPANY, platformId: DEMO_FOREIGN_PLATFORM_ID };
    expect((await error(gateway.cashReturnCases(outside, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      404,
    );
    expect(
      (
        await error(
          gateway.cashReturnCases(
            DRIVE,
            { platformId: DEMO_SCHOOL_PLATFORM_ID },
            FIRST_ASSISTANCE_PAGE,
          ),
        )
      ).status,
    ).toBe(400);
  });

  it('refuses a state Core does not have (untrusted input): no partial or refunded return', async () => {
    const { gateway } = setUp();
    for (const filter of [
      { state: 'partially_returned' },
      { state: 'refunded' },
      { state: 'OPEN' },
      { disputed: 'yes' },
    ] as unknown as CashReturnFilter[])
      expect(
        (await error(gateway.cashReturnCases(COMPANY, filter, FIRST_ASSISTANCE_PAGE))).status,
      ).toBe(400);
    // The late-settlement list refuses an unknown decision status the same way.
    expect(
      (
        await error(
          gateway.lateSettlements(
            COMPANY,
            { status: 'automatic' } as unknown as { status: 'applied' },
            FIRST_ASSISTANCE_PAGE,
          ),
        )
      ).status,
    ).toBe(400);
  });

  it('the owner only: signed out 401, an operator 403', async () => {
    let { gateway } = setUp(null);
    expect((await error(gateway.cashReturnCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      401,
    );
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OPERATOR_IDS.multi));
    expect((await error(gateway.cashReturnCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      403,
    );
  });

  it('empty and unavailable scenarios', async () => {
    let { gateway } = setUp(DEMO_OWNER_ID, 'empty');
    expect(
      await firstValueFrom(gateway.cashReturnCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE)),
    ).toEqual({ items: [], next: null });
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OWNER_ID, 'unavailable'));
    expect((await error(gateway.cashReturnCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      503,
    );
  });

  it('reads change nothing and send nothing: zero financial mutations', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { gateway, world } = setUp();
    const before = world.snapshot();
    for (const state of CASH_RETURN_STATES)
      await firstValueFrom(gateway.cashReturnCases(COMPANY, { state }, FIRST_ASSISTANCE_PAGE));
    for (const l of (
      await firstValueFrom(gateway.lateSettlements(COMPANY, {}, FIRST_ASSISTANCE_PAGE))
    ).items)
      await firstValueFrom(gateway.lateSettlement(COMPANY, l.id));
    expect(world.snapshot()).toBe(before);
    expect(demoAssistanceCases(world.snapshot(), NOW)).toEqual(CASES);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
