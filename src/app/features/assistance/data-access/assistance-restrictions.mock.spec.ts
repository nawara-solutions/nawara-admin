import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { demoAssistanceCases } from '../../../demo/world/assistance/assistance.seed';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { organizationsOfCompany } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { AssistanceReadContext } from '../domain/assistance-read-context';
import {
  ASSISTANCE_DEMO_SCENARIO,
  AssistanceDemoScenario,
  MockAssistanceGateway,
} from './assistance.mock';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const WORLD = demoWorldSeed(NOW);
const COMPANY: AssistanceReadContext = { companyId: DEMO_COMPANY_ID, platformId: null };
const SCHOOL: AssistanceReadContext = { ...COMPANY, platformId: DEMO_SCHOOL_PLATFORM_ID };
const DRIVE: AssistanceReadContext = { ...COMPANY, platformId: DEMO_DRIVE_PLATFORM_ID };
const CASES = demoAssistanceCases(WORLD, NOW);
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
  return TestBed.runInInjectionContext(() => new MockAssistanceGateway());
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('MockAssistanceGateway (A10): an Organization’s restrictions, as BIL-26 states them', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('answers each row with its source and since, in Core’s order (kind, since, source)', async () => {
    const gateway = setUp();
    // Organization 7: case 11 is overdue (T1, since its settleBy) with an open cash return (T2, since it opened); case 12's
    // return was superseded by an applied late settlement, so it no longer restricts anything.
    const view = await firstValueFrom(gateway.organizationRestrictions(COMPANY, orgOf(11)));
    expect(view).toEqual({
      organizationId: orgOf(11),
      restrictions: [
        {
          kind: 'T1',
          sourceId: caseOf(11).request.id,
          since: caseOf(11).request.collection!.settleBy,
        },
        {
          kind: 'T2',
          sourceId: caseOf(11).cashReturns[0]!.id,
          since: caseOf(11).cashReturns[0]!.openedAt,
        },
      ],
    });
    // Organization 9: an open recovery obligation (T3, since it opened); case 14's recovered obligation never restricts.
    expect(
      (await firstValueFrom(gateway.organizationRestrictions(COMPANY, orgOf(13)))).restrictions,
    ).toEqual([
      { kind: 'T3', sourceId: caseOf(13).recovery!.id, since: caseOf(13).recovery!.openedAt },
    ]);
    // Organization 3: settled, in flight inside its window, and an applied Path B late settlement: no restriction.
    expect(
      (await firstValueFrom(gateway.organizationRestrictions(COMPANY, orgOf(15)))).restrictions,
    ).toEqual([]);
  });

  it('is the same model as the case read: its kinds are exactly the case’s restrictions', async () => {
    const gateway = setUp();
    for (const c of OWN) {
      const detail = await firstValueFrom(gateway.caseDetail(COMPANY, c.request.id));
      const view = await firstValueFrom(
        gateway.organizationRestrictions(COMPANY, c.request.organizationId),
      );
      expect([c.request.id, [...new Set(view.restrictions.map((r) => r.kind))]]).toEqual([
        c.request.id,
        detail.restrictions,
      ]);
    }
  });

  it('accepts an Organization of the Company with no case (no rows), in upper case too', async () => {
    const gateway = setUp();
    const withCases = new Set(OWN.map((c) => c.request.organizationId as string));
    const quiet = organizationsOfCompany(WORLD).find(
      (o) => o.platformId === DEMO_SCHOOL_PLATFORM_ID && !withCases.has(o.id),
    )!;
    expect(
      await firstValueFrom(gateway.organizationRestrictions(SCHOOL, quiet.id.toUpperCase())),
    ).toEqual({ organizationId: quiet.id, restrictions: [] });
  });

  it('answers the collapsed 404 outside the Company or the Platform, and for a malformed id', async () => {
    const gateway = setUp();
    const driveOrganization = organizationsOfCompany(WORLD).find(
      (o) => o.platformId === DEMO_DRIVE_PLATFORM_ID,
    )!;
    for (const [context, id] of [
      [COMPANY, FOREIGN[0]!.request.organizationId],
      [DRIVE, orgOf(11)],
      [SCHOOL, driveOrganization.id],
      [COMPANY, 'not-a-uuid'],
      [COMPANY, '00000000-0000-4000-8000-000000000000'],
    ] as const)
      expect((await error(gateway.organizationRestrictions(context, id))).status).toBe(404);
    expect(
      (
        await error(
          gateway.organizationRestrictions(
            { ...COMPANY, companyId: FOREIGN[0]!.companyId },
            orgOf(11),
          ),
        )
      ).status,
    ).toBe(404);
  });

  it('refuses an operator (403) and a signed-out session (401); a Billing outage is 503', async () => {
    expect(
      (await error(setUp(DEMO_OPERATOR_IDS.multi).organizationRestrictions(COMPANY, orgOf(11))))
        .status,
    ).toBe(403);
    TestBed.resetTestingModule();
    expect((await error(setUp(null).organizationRestrictions(COMPANY, orgOf(11)))).status).toBe(
      401,
    );
    TestBed.resetTestingModule();
    expect(
      (
        await error(
          setUp(DEMO_OWNER_ID, 'unavailable').organizationRestrictions(COMPANY, orgOf(11)),
        )
      ).status,
    ).toBe(503);
  });
});
