import { TestBed } from '@angular/core/testing';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DEMO_COMPANY_ID } from '../../../core/context/scope-directory.fixtures';
import { companyId, platformId } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import {
  CommercialSummaryGateway,
  UnavailableCommercialSummaryGateway,
} from '../data-access/commercial-summary.gateway';
import {
  CompanyOverviewGateway,
  UnavailableCompanyOverviewGateway,
} from '../data-access/company-overview.gateway';
import {
  COMPANY_OVERVIEW_DEMO_SCENARIO,
  CompanyOverviewDemoScenario,
  MockCommercialSummaryGateway,
  MockCompanyOverviewGateway,
  MockServiceHealthGateway,
} from '../data-access/company-overview.mock';
import {
  ServiceHealthGateway,
  UnavailableServiceHealthGateway,
} from '../data-access/service-health.gateway';
import { CompanyOverviewFacade } from './company-overview.facade';

const owner: Actor = {
  kind: 'owner',
  userId: 'owner',
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: 'operator',
  email: 'operator@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};
const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
  },
};

function setUp(
  actor: Actor,
  adapters: 'mock' | 'unavailable' = 'mock',
  scenario: CompanyOverviewDemoScenario = 'normal',
) {
  const mock = adapters === 'mock';
  TestBed.configureTestingModule({
    providers: [
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: COMPANY_OVERVIEW_DEMO_SCENARIO, useValue: scenario },
      {
        provide: CompanyOverviewGateway,
        useClass: mock ? MockCompanyOverviewGateway : UnavailableCompanyOverviewGateway,
      },
      {
        provide: CommercialSummaryGateway,
        useClass: mock ? MockCommercialSummaryGateway : UnavailableCommercialSummaryGateway,
      },
      {
        provide: ServiceHealthGateway,
        useClass: mock ? MockServiceHealthGateway : UnavailableServiceHealthGateway,
      },
      CompanyOverviewFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  return TestBed.inject(CompanyOverviewFacade);
}

/** Lets the zero-latency mocks (macrotask `delay(0)`) answer: waits until no load is pending, then flushes signals. */
async function settle() {
  const facade = TestBed.inject(CompanyOverviewFacade);
  const pending = () =>
    [facade.state(), facade.commercial(), facade.health()].some(
      (s) => s.status === 'idle' || s.status === 'loading',
    );
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    TestBed.tick();
    if (!pending()) return;
  }
}

describe('CompanyOverviewFacade', () => {
  it('loads the overview, the commercial summary and service health for the owner', async () => {
    const facade = setUp(owner);
    TestBed.tick();
    expect(facade.state().status).toBe('loading');
    await settle();
    expect(facade.state().status).toBe('success');
    expect(facade.commercial().status).toBe('success');
    expect(facade.health().status).toBe('success');
    expect(facade.canSeeCreatePlatform()).toBe(true);
  });

  it('adds "licenses expiring soon" from the commercial summary to the attention items', async () => {
    const facade = setUp(owner);
    await settle();
    const attention = facade.attention();
    expect(attention.status === 'available' && attention.data.map((i) => i.kind)).toEqual([
      'admin_invitations_awaiting',
      'access_assignments_to_review',
      'licenses_expiring',
    ]);
  });

  it('never loads company-wide data of any domain for an operator, whatever their assignments', async () => {
    const calls = [
      vi.spyOn(MockCompanyOverviewGateway.prototype, 'load'),
      vi.spyOn(MockCommercialSummaryGateway.prototype, 'load'),
      vi.spyOn(MockServiceHealthGateway.prototype, 'load'),
    ];
    const facade = setUp(operator);
    await settle();
    expect(facade.state()).toEqual({ status: 'forbidden' });
    expect(facade.commercial()).toEqual({ status: 'forbidden' });
    expect(facade.health()).toEqual({ status: 'forbidden' });
    for (const call of calls) expect(call).not.toHaveBeenCalled();
    expect(facade.canSeeCreatePlatform()).toBe(false);
    calls.forEach((c) => c.mockRestore());
  });

  it('reports unavailable adapters (no Core contract) as errors with their code, never as data', async () => {
    const facade = setUp(owner, 'unavailable');
    await settle();
    const unavailable = {
      status: 'error',
      error: { kind: 'unavailable', code: ADAPTER_UNAVAILABLE, status: 0 },
    };
    expect(facade.state()).toEqual(unavailable);
    expect(facade.commercial()).toEqual(unavailable);
    expect(facade.health()).toEqual(unavailable);
  });

  it('keeps the overview when the commercial and health summaries fail', async () => {
    const facade = setUp(owner, 'mock', 'sections-unavailable');
    await settle();
    expect(facade.state().status).toBe('success');
    expect(facade.commercial().status).toBe('error');
    expect(facade.health().status).toBe('error');
    expect(facade.attention()).toEqual({ status: 'unavailable' });
  });

  it('maps a Core 403 to forbidden and a 503 to a retryable error', async () => {
    const forbidden = setUp(owner, 'mock', 'forbidden');
    await settle();
    expect(forbidden.state()).toEqual({ status: 'forbidden' });

    TestBed.resetTestingModule();
    const failing = setUp(owner, 'mock', 'error');
    await settle();
    expect(failing.state().status).toBe('error');
  });

  it('reloads on demand', async () => {
    const facade = setUp(owner);
    await settle();
    facade.reload();
    TestBed.tick();
    expect(facade.state().status).toBe('loading');
    await settle();
    expect(facade.state().status).toBe('success');
  });

  it('treats another Company like Core’s collapsed 404', async () => {
    const stranger: Actor = { ...owner, companyId: companyId('someone-else') };
    const facade = setUp(stranger);
    await settle();
    const state = facade.state();
    expect(state.status === 'error' && state.error.kind).toBe('not_found');
  });
});
