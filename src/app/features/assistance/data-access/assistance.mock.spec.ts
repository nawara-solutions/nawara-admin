import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { companyId } from '../../../core/context/scope.model';
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
import {
  AssistanceCaseSummary,
  AssistancePage,
  AssistancePageRequest,
  FIRST_ASSISTANCE_PAGE,
} from '../domain/assistance-read.model';
import { assistanceReadFailureOf } from './assistance-read-failure';
import { AssistanceGateway, UnavailableAssistanceGateway } from './assistance.gateway';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
  demoRestrictionsOf,
} from './assistance.mock';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const COMPANY: AssistanceReadContext = { companyId: DEMO_COMPANY_ID, platformId: null };
const SCHOOL: AssistanceReadContext = { ...COMPANY, platformId: DEMO_SCHOOL_PLATFORM_ID };
const DRIVE: AssistanceReadContext = { ...COMPANY, platformId: DEMO_DRIVE_PLATFORM_ID };
const CASES = demoAssistanceCases(demoWorldSeed(NOW), NOW);
const OWN = CASES.filter((c) => c.companyId === DEMO_COMPANY_ID);
const FOREIGN = CASES.filter((c) => c.companyId !== DEMO_COMPANY_ID);
const caseOf = (n: number) => OWN[n - 1]!;
const orgOf = (n: number) => caseOf(n).request.organizationId;

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

/** Every page of the case directory, following `next`. */
async function allPages(
  gateway: AssistanceGateway,
  context: AssistanceReadContext,
  limit: number,
): Promise<AssistancePage<AssistanceCaseSummary>[]> {
  const pages: AssistancePage<AssistanceCaseSummary>[] = [];
  let request: AssistancePageRequest = { after: null, limit };
  for (;;) {
    const page = await firstValueFrom(gateway.cases(context, {}, request));
    pages.push(page);
    if (page.next === null) return pages;
    request = { after: page.next, limit };
  }
}

describe('MockAssistanceGateway (A3): the case directory', () => {
  it("lists the Company's cases newest consent first, with Core's values only", async () => {
    const { gateway } = setUp();
    const page = await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(page.next).toBeNull();
    expect(page.items.map((s) => s.requestId)).toEqual(
      [...OWN]
        .sort((a, b) => b.request.consentAt.localeCompare(a.request.consentAt))
        .map((c) => c.request.id),
    );
    const summary = page.items.find((s) => s.requestId === caseOf(8).request.id)!;
    expect(summary).toEqual({
      requestId: caseOf(8).request.id,
      platformId: DEMO_SCHOOL_PLATFORM_ID,
      organizationId: orgOf(8),
      productId: caseOf(8).request.productId,
      state: 'cash_collected',
      total: { amount: 46_500, currency: 'TND' },
      settleBy: caseOf(8).request.collection!.settleBy,
      overdue: true,
      openDispute: true,
      channel: 'closed',
      lateSettlement: null,
      recovery: null,
      cashReturn: 'open',
    });
    expect(page.items.find((s) => s.requestId === caseOf(1).request.id)).toMatchObject({
      state: 'pending',
      settleBy: null,
      overdue: false,
    });
  });

  it('pages deterministically by keyset; every page joins to the whole list', async () => {
    const { gateway } = setUp();
    const pages = await allPages(gateway, COMPANY, 5);
    expect(pages.map((p) => p.items.length)).toEqual([5, 5, 4]);
    const whole = await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(pages.flatMap((p) => p.items)).toEqual(whole.items);
    expect(await allPages(gateway, COMPANY, 5)).toEqual(pages);
    // A page that ends exactly at the last case says so: no empty extra page.
    expect(
      (await allPages(gateway, COMPANY, 7)).map((p) => [p.items.length, p.next === null]),
    ).toEqual([
      [7, false],
      [7, true],
    ]);
    expect((await allPages(gateway, COMPANY, OWN.length)).map((p) => p.next)).toEqual([null]);
    for (let i = 0; i + 1 < pages.length; i += 1)
      expect(pages[i]!.next).toBe(pages[i]!.items.at(-1)!.requestId);
  });

  it('refuses a limit outside 1–200 and a cursor it never gave', async () => {
    const { gateway } = setUp();
    for (const request of [
      { after: null, limit: 0 },
      { after: null, limit: 201 },
      { after: null, limit: 1.5 },
      { after: FOREIGN[0]!.request.id, limit: 5 },
      { after: 'not-a-cursor', limit: 5 },
    ])
      expect(assistanceReadFailureOf(await error(gateway.cases(COMPANY, {}, request))).kind).toBe(
        'invalidRequest',
      );
  });

  it('filters predictably by state, Organization, overdue and open dispute', async () => {
    const { gateway } = setUp();
    const ids = async (filter: Parameters<AssistanceGateway['cases']>[1]) =>
      (await firstValueFrom(gateway.cases(COMPANY, filter, FIRST_ASSISTANCE_PAGE))).items
        .map((s) => s.requestId)
        .sort();
    const own = (predicate: (n: number) => boolean) =>
      OWN.filter((_, i) => predicate(i + 1))
        .map((c) => c.request.id)
        .sort();
    expect(await ids({ state: 'settled' })).toEqual(own((n) => [5, 9, 12, 13, 14].includes(n)));
    expect(await ids({ state: 'declined' })).toEqual(own((n) => n === 2 || n === 3));
    expect(await ids({ organizationId: orgOf(7) })).toEqual(own((n) => n === 7 || n === 8));
    expect(await ids({ overdue: true })).toEqual(own((n) => [8, 10, 11].includes(n)));
    expect(await ids({ disputed: true })).toEqual(own((n) => [4, 8, 10].includes(n)));
    expect(await ids({ state: 'returned', overdue: true })).toEqual([]);
  });

  it('carries settlement, late-settlement and recovery indicators from the case records', async () => {
    const { gateway } = setUp();
    const rows = (await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).items;
    const row = (n: number) => rows.find((s) => s.requestId === caseOf(n).request.id)!;
    expect([row(1).channel, row(6).channel, row(5).channel]).toEqual([
      null,
      'uncertain',
      'settled',
    ]);
    expect([row(11).lateSettlement, row(12).lateSettlement, row(4).lateSettlement]).toEqual([
      'unapplied',
      'applied',
      null,
    ]);
    expect([row(13).recovery, row(14).recovery, row(8).recovery]).toEqual([
      'open',
      'recovered',
      null,
    ]);
  });

  it('finds one case by its exact reference, in scope only; orders both ways', async () => {
    const { gateway } = setUp();
    const find = async (context: AssistanceReadContext, requestId: string) =>
      (
        await firstValueFrom(gateway.cases(context, { requestId }, FIRST_ASSISTANCE_PAGE))
      ).items.map((s) => s.requestId);
    const id = caseOf(9).request.id;
    expect(await find(COMPANY, id.toUpperCase())).toEqual([id]);
    expect(await find(DRIVE, id)).toEqual([]);
    expect(await find(COMPANY, FOREIGN[0]!.request.id)).toEqual([]);
    expect(
      (await error(gateway.cases(COMPANY, { requestId: id.slice(0, 8) }, FIRST_ASSISTANCE_PAGE)))
        .kind,
    ).toBe('validation');
    const newest = (await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).items;
    const oldest = (
      await firstValueFrom(
        gateway.cases(COMPANY, { order: 'consentOldest' }, FIRST_ASSISTANCE_PAGE),
      )
    ).items;
    expect(oldest.map((s) => s.requestId)).toEqual(newest.map((s) => s.requestId).reverse());
  });

  it('refuses a state Core does not have (from untrusted input)', async () => {
    const { gateway } = setUp();
    const filter = JSON.parse('{"state":"paid"}') as Parameters<AssistanceGateway['cases']>[1];
    expect((await error(gateway.cases(COMPANY, filter, FIRST_ASSISTANCE_PAGE))).kind).toBe(
      'validation',
    );
  });
});

describe('MockAssistanceGateway (A3): scope isolation and the collapsed not found', () => {
  it('a Platform scope sees only its Platform; Drive has no assistance (disabled there)', async () => {
    const { gateway } = setUp();
    const school = await firstValueFrom(gateway.cases(SCHOOL, {}, FIRST_ASSISTANCE_PAGE));
    expect(school.items).toHaveLength(OWN.length);
    expect(await firstValueFrom(gateway.cases(DRIVE, {}, FIRST_ASSISTANCE_PAGE))).toEqual({
      items: [],
      next: null,
    });
    // A filter cannot widen a Platform scope to another Platform.
    expect(
      (
        await error(
          gateway.cases(DRIVE, { platformId: DEMO_SCHOOL_PLATFORM_ID }, FIRST_ASSISTANCE_PAGE),
        )
      ).kind,
    ).toBe('validation');
  });

  it("another Platform's, another Company's, an unknown or a malformed id: one answer, not found", async () => {
    const { gateway } = setUp();
    const foreign = FOREIGN.find((c) => c.recovery !== null)!;
    const late = FOREIGN.flatMap((c) => c.lateSettlements)[0]!;
    const own = caseOf(13);
    const answers = [
      gateway.caseDetail(DRIVE, own.request.id),
      gateway.caseDetail(COMPANY, foreign.request.id),
      gateway.caseDetail(COMPANY, 'a551c0de-0000-4000-8000-0000000fffff'),
      gateway.caseDetail(COMPANY, '../admin'),
      gateway.timeline(DRIVE, own.request.id, FIRST_ASSISTANCE_PAGE),
      gateway.settlement(COMPANY, foreign.request.id),
      gateway.cashReturns(COMPANY, foreign.request.id),
      gateway.disputes(DRIVE, caseOf(8).request.id),
      gateway.lateSettlement(COMPANY, late.id),
      gateway.lateSettlement(DRIVE, caseOf(11).lateSettlements[0]!.id),
      gateway.recoveryObligation(COMPANY, foreign.recovery!.id),
      gateway.recoveryObligation(DRIVE, own.recovery!.id),
    ];
    for (const answer of answers)
      expect(await error(answer)).toEqual({ kind: 'not_found', status: 404 });
  });

  it('another Company, or a Platform outside the Company, as the context: not found', async () => {
    const { gateway } = setUp();
    for (const context of [
      { companyId: DEMO_FOREIGN_COMPANY_ID, platformId: null },
      { companyId: companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a99'), platformId: null },
      { ...COMPANY, platformId: DEMO_FOREIGN_PLATFORM_ID },
    ])
      expect((await error(gateway.cases(context, {}, FIRST_ASSISTANCE_PAGE))).kind).toBe(
        'not_found',
      );
  });

  it('the lists never include another Company', async () => {
    const { gateway } = setUp();
    const late = await firstValueFrom(gateway.lateSettlements(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    const recovery = await firstValueFrom(
      gateway.recoveryObligations(COMPANY, {}, FIRST_ASSISTANCE_PAGE),
    );
    const foreignIds = FOREIGN.flatMap((c) => [
      ...c.lateSettlements.map((l) => l.id),
      ...(c.recovery ? [c.recovery.id] : []),
    ]);
    for (const id of [...late.items, ...recovery.items].map((x) => x.id))
      expect(foreignIds).not.toContain(id);
  });

  it('owner reads only: signed out 401, an operator 403', async () => {
    expect(
      (await error(setUp(null).gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).status,
    ).toBe(401);
    TestBed.resetTestingModule();
    const operator = setUp(DEMO_OPERATOR_IDS.school).gateway;
    const refused = await error(operator.caseDetail(SCHOOL, caseOf(1).request.id));
    expect(refused).toMatchObject({ kind: 'forbidden', status: 403 });
    expect(assistanceReadFailureOf(refused).kind).toBe('forbidden');
  });
});

describe('MockAssistanceGateway (A3): one case and its records', () => {
  it('detail: the request, its records, and the restrictions Core derives for its Organization', async () => {
    const { gateway } = setUp();
    const c = caseOf(8);
    expect(await firstValueFrom(gateway.caseDetail(COMPANY, c.request.id.toUpperCase()))).toEqual({
      request: c.request,
      channel: c.channel,
      cashReturns: c.cashReturns,
      disputes: c.disputes,
      corrections: [],
      lateSettlementIds: [],
      recoveryObligationId: null,
      restrictions: ['T1', 'T2'],
      overdue: true,
    });
  });

  it('restrictions per Organization follow Core (T1 overdue collection, T2 open return, T3 open recovery)', () => {
    const expected: [number, readonly string[]][] = [
      [1, []], // pending and declined only
      [4, []], // collected, inside the window
      [5, []], // settled, uncertain inside the window
      [7, ['T1', 'T2']], // overdue, return owed
      [9, ['T1', 'T2']], // return reported, not confirmed
      [11, ['T1', 'T2']], // late settlement not applied: the return is still owed
      [13, ['T3']], // open recovery
    ];
    for (const [n, kinds] of expected)
      expect(demoRestrictionsOf(OWN, orgOf(n), NOW), `case ${n}`).toEqual(kinds);
  });

  it('timeline: oldest first, paged by id', async () => {
    const { gateway } = setUp();
    const c = caseOf(7);
    const first = await firstValueFrom(
      gateway.timeline(COMPANY, c.request.id, { after: null, limit: 4 }),
    );
    const rest = await firstValueFrom(
      gateway.timeline(COMPANY, c.request.id, { after: first.next, limit: 4 }),
    );
    expect([...first.items, ...rest.items]).toEqual(c.timeline);
    expect(rest.next).toBeNull();
    expect(first.items[0]).toMatchObject({ source: 'report', kind: 'consent', by: 'beneficiary' });
  });

  it('settlement, cash returns and disputes views', async () => {
    const { gateway } = setUp();
    expect(await firstValueFrom(gateway.settlement(COMPANY, caseOf(6).request.id))).toEqual({
      channel: caseOf(6).channel,
      lateSettlements: [],
    });
    expect(
      (await firstValueFrom(gateway.settlement(COMPANY, caseOf(12).request.id))).lateSettlements,
    ).toEqual([
      {
        id: caseOf(12).lateSettlements[0]!.id,
        assistanceRequestId: caseOf(12).request.id,
        reason: 'channel_closed',
        attestation: 'cash_not_returned',
        applied: true,
      },
    ]);
    expect(await firstValueFrom(gateway.cashReturns(COMPANY, caseOf(7).request.id))).toEqual(
      caseOf(7).cashReturns,
    );
    expect(await firstValueFrom(gateway.disputes(COMPANY, caseOf(9).request.id))).toEqual({
      disputes: caseOf(9).disputes,
      corrections: caseOf(9).corrections,
    });
  });

  it('late settlements and recovery: lists, filters and details', async () => {
    const { gateway } = setUp();
    const late = await firstValueFrom(gateway.lateSettlements(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(late.items.map((l) => [l.assistanceRequestId, l.applied])).toEqual([
      [caseOf(11).request.id, false],
      [caseOf(12).request.id, true],
    ]);
    const unapplied = await firstValueFrom(
      gateway.lateSettlements(COMPANY, { status: 'unapplied' }, FIRST_ASSISTANCE_PAGE),
    );
    expect(unapplied.items).toHaveLength(1);
    const detail = await firstValueFrom(gateway.lateSettlement(SCHOOL, unapplied.items[0]!.id));
    expect(detail).toEqual(caseOf(11).lateSettlements[0]);
    // Missing evidence: no attestation and no File evidence, so an L-4 application would be refused.
    expect([detail.attestation, detail.evidence]).toEqual([null, []]);

    const open = await firstValueFrom(
      gateway.recoveryObligations(COMPANY, { state: 'open' }, FIRST_ASSISTANCE_PAGE),
    );
    expect(open.items).toEqual([
      {
        id: caseOf(13).recovery!.id,
        assistanceRequestId: caseOf(13).request.id,
        organizationId: orgOf(13),
        base: { amount: 45_000, currency: 'TND' },
        state: 'open',
      },
    ]);
    const recovered = await firstValueFrom(
      gateway.recoveryObligation(COMPANY, caseOf(14).recovery!.id),
    );
    expect([recovered.recovered, recovered.outstanding, recovered.surpluses[0]!.status]).toEqual([
      { amount: 30_000, currency: 'TND' },
      { amount: 0, currency: 'TND' },
      'owed_to_organization',
    ]);
  });
});

describe('MockAssistanceGateway (A3): view states and safety', () => {
  it('empty: every list is empty and every id is not found', async () => {
    const { gateway } = setUp(DEMO_OWNER_ID, 'empty');
    const empty = { items: [], next: null };
    expect(await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE))).toEqual(empty);
    expect(
      await firstValueFrom(gateway.lateSettlements(COMPANY, {}, FIRST_ASSISTANCE_PAGE)),
    ).toEqual(empty);
    expect(
      await firstValueFrom(gateway.recoveryObligations(COMPANY, {}, FIRST_ASSISTANCE_PAGE)),
    ).toEqual(empty);
    expect((await error(gateway.caseDetail(COMPANY, caseOf(1).request.id))).kind).toBe('not_found');
  });

  it('unavailable: Billing answers 503 and nothing is read', async () => {
    const { gateway } = setUp(DEMO_OWNER_ID, 'unavailable');
    const failure = await error(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    expect(failure.status).toBe(503);
    expect(assistanceReadFailureOf(failure)).toEqual({ kind: 'unavailable' });
  });

  it('reads change nothing, send nothing, and offer no command', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const { gateway, world } = setUp();
    const before = world.snapshot();
    await firstValueFrom(gateway.cases(COMPANY, {}, FIRST_ASSISTANCE_PAGE));
    for (const c of OWN) {
      await firstValueFrom(gateway.caseDetail(COMPANY, c.request.id));
      await firstValueFrom(gateway.timeline(COMPANY, c.request.id, FIRST_ASSISTANCE_PAGE));
    }
    expect(world.snapshot()).toBe(before);
    expect(demoAssistanceCases(world.snapshot(), NOW)).toEqual(CASES);
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    const names = (proto: object) =>
      Object.getOwnPropertyNames(proto)
        .filter((n) => n !== 'constructor')
        .sort();
    // Exactly the A2 reads (plus private helpers): no apply, resolve, correct, write-off or record method.
    const publicNames = names(MockAssistanceGateway.prototype).filter(
      (n) => !['caseOf', 'read', 'fail'].includes(n),
    );
    expect(publicNames).toEqual(names(UnavailableAssistanceGateway.prototype));
    vi.restoreAllMocks();
  });
});
