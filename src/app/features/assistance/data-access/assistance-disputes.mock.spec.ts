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
import { AssistanceDisputeFilter, FIRST_ASSISTANCE_PAGE } from '../domain/assistance-read.model';
import { ASSISTANCE_DISPUTE_REASONS } from '../domain/assistance.model';
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
const disputeOf = (n: number) => caseOf(n).disputes[0]!;

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

const ids = async (
  gateway: MockAssistanceGateway,
  filter: AssistanceDisputeFilter,
  context = COMPANY,
) =>
  (await firstValueFrom(gateway.disputeCases(context, filter, FIRST_ASSISTANCE_PAGE))).items.map(
    (r) => r.dispute.id,
  );

describe('MockAssistanceGateway (A7): the dispute overview projection', () => {
  afterEach(() => TestBed.resetTestingModule());

  it("lists the Company's disputes, newest opened first, each with its own case's row", async () => {
    const { gateway } = setUp();
    const page = await firstValueFrom(gateway.disputeCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(page.next).toBeNull();
    // Opened: case 4 at -5 h, case 8 at -30 h, case 9 at -60 h, case 10 at -150 h.
    expect(page.items.map((r) => r.dispute.id)).toEqual([4, 8, 9, 10].map((n) => disputeOf(n).id));
    for (const row of page.items) {
      expect(row.case.requestId).toBe(row.dispute.assistanceRequestId);
      expect(row.case.openDispute).toBe(row.dispute.state === 'open');
    }
    // Exactly the seeded record: nothing added, nothing recomputed.
    expect(page.items[0]!.dispute).toEqual(disputeOf(4));
  });

  it('filters by status and by each of the four reasons', async () => {
    const { gateway } = setUp();
    expect(await ids(gateway, { state: 'open' })).toEqual([4, 8, 10].map((n) => disputeOf(n).id));
    expect(await ids(gateway, { state: 'resolved' })).toEqual([disputeOf(9).id]);
    const byReason = {
      collection_not_made: 4,
      cash_not_returned: 8,
      collection_time_incorrect: 9,
      return_time_incorrect: 10,
    } as const;
    for (const reason of ASSISTANCE_DISPUTE_REASONS)
      expect(await ids(gateway, { reason })).toEqual([disputeOf(byReason[reason]).id]);
    expect(await ids(gateway, { reason: 'cash_not_returned', state: 'resolved' })).toEqual([]);
  });

  it('pages by keyset and refuses a limit or cursor Core would refuse', async () => {
    const { gateway } = setUp();
    const first = await firstValueFrom(
      gateway.disputeCases(COMPANY, {}, { after: null, limit: 3 }),
    );
    expect(first.items).toHaveLength(3);
    const second = await firstValueFrom(
      gateway.disputeCases(COMPANY, {}, { after: first.next, limit: 3 }),
    );
    expect([...first.items, ...second.items].map((r) => r.dispute.id)).toEqual(
      [4, 8, 9, 10].map((n) => disputeOf(n).id),
    );
    expect(second.next).toBeNull();
    for (const request of [
      { after: null, limit: 0 },
      { after: null, limit: 201 },
      { after: FOREIGN[0]!.disputes[0]!.id, limit: 10 },
    ])
      expect((await error(gateway.disputeCases(COMPANY, {}, request))).status).toBe(400);
  });

  it("never returns another Company's dispute, and keeps a Platform scope", async () => {
    const { gateway } = setUp();
    const foreign = FOREIGN.flatMap((c) => c.disputes.map((d) => d.id));
    expect(foreign.length).toBeGreaterThan(0);
    const visible = await ids(gateway, {});
    for (const id of foreign) expect(visible).not.toContain(id);
    expect(await ids(gateway, {}, SCHOOL)).toEqual(visible);
    expect(await ids(gateway, {}, DRIVE)).toEqual([]);
    // Another Company or a Platform outside the Company: the collapsed 404.
    const other: AssistanceReadContext = { companyId: DEMO_FOREIGN_COMPANY_ID, platformId: null };
    expect((await error(gateway.disputeCases(other, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(404);
    const outside: AssistanceReadContext = { ...COMPANY, platformId: DEMO_FOREIGN_PLATFORM_ID };
    expect((await error(gateway.disputeCases(outside, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      404,
    );
    // A filter that would widen a Platform scope: refused, never widened.
    expect(
      (
        await error(
          gateway.disputeCases(
            DRIVE,
            { platformId: DEMO_SCHOOL_PLATFORM_ID },
            FIRST_ASSISTANCE_PAGE,
          ),
        )
      ).status,
    ).toBe(400);
  });

  it('refuses a status or reason Core does not have (untrusted input), never sending it on', async () => {
    const { gateway } = setUp();
    for (const filter of [
      { state: 'rejected' },
      { state: 'refunded' },
      { reason: 'refund_requested' },
      { reason: 'COLLECTION_NOT_MADE' },
    ] as unknown as AssistanceDisputeFilter[])
      expect(
        (await error(gateway.disputeCases(COMPANY, filter, FIRST_ASSISTANCE_PAGE))).status,
      ).toBe(400);
  });

  it('the owner only: signed out 401, an operator 403', async () => {
    let { gateway } = setUp(null);
    expect((await error(gateway.disputeCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      401,
    );
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OPERATOR_IDS.multi));
    expect((await error(gateway.disputeCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      403,
    );
  });

  it('empty and unavailable scenarios', async () => {
    let { gateway } = setUp(DEMO_OWNER_ID, 'empty');
    expect(await firstValueFrom(gateway.disputeCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).toEqual({
      items: [],
      next: null,
    });
    TestBed.resetTestingModule();
    ({ gateway } = setUp(DEMO_OWNER_ID, 'unavailable'));
    expect((await error(gateway.disputeCases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status).toBe(
      503,
    );
  });

  it('reads change nothing and send nothing', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { gateway, world } = setUp();
    const before = world.snapshot();
    for (const state of ['open', 'resolved'] as const)
      await firstValueFrom(gateway.disputeCases(COMPANY, { state }, FIRST_ASSISTANCE_PAGE));
    expect(world.snapshot()).toBe(before);
    expect(demoAssistanceCases(world.snapshot(), NOW)).toEqual(CASES);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
