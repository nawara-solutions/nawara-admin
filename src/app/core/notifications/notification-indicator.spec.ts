import { TestBed } from '@angular/core/testing';
import { Observable, Subject } from 'rxjs';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { companyId, platformId } from '../context/scope.model';
import { NotificationIndicator } from './notification-indicator';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [platformId('school')],
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
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    memberships: [],
    operators: [],
    stepUp: [],
  },
};

/** Each request is a subject the test answers, so the order of answers is under control. */
class ScriptedSummary extends NotificationSummaryGateway {
  readonly requests: Subject<NotificationSummary>[] = [];
  summary(): Observable<NotificationSummary> {
    const request = new Subject<NotificationSummary>();
    this.requests.push(request);
    return request;
  }
}

function setUp() {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: NotificationSummaryGateway, useClass: ScriptedSummary },
      NotificationIndicator,
    ],
  });
  const indicator = TestBed.inject(NotificationIndicator);
  return {
    indicator,
    session: TestBed.inject(AuthSession),
    gateway: TestBed.inject(NotificationSummaryGateway) as ScriptedSummary,
  };
}

const answer = (request: Subject<NotificationSummary> | undefined, unread: number) => {
  request?.next({ unread });
  request?.complete();
};

describe('NotificationIndicator', () => {
  it('asks nothing while nobody is signed in', () => {
    const { indicator, gateway } = setUp();
    TestBed.tick();
    expect(gateway.requests).toHaveLength(0);
    expect(indicator.unread()).toBeNull();
  });

  it('loads the count of whoever signs in, and drops it on sign-out', () => {
    const { indicator, session, gateway } = setUp();
    session.establish(owner);
    TestBed.tick();
    expect(gateway.requests).toHaveLength(1);
    answer(gateway.requests[0], 4);
    expect(indicator.unread()).toBe(4);
    session.signOut();
    TestBed.tick();
    expect(indicator.unread()).toBeNull();
  });

  it('never shows one person’s count to the next: a new identity is a new request', () => {
    const { indicator, session, gateway } = setUp();
    session.establish(owner);
    TestBed.tick();
    answer(gateway.requests[0], 4);
    session.signOut();
    TestBed.tick();
    session.establish(operator);
    TestBed.tick();
    expect(gateway.requests).toHaveLength(2);
    expect(indicator.unread()).toBeNull();
    answer(gateway.requests[1], 0);
    expect(indicator.unread()).toBe(0);
  });

  it('discards a late answer for the previous identity', () => {
    const { indicator, session, gateway } = setUp();
    session.establish(owner);
    TestBed.tick();
    session.signOut();
    TestBed.tick();
    session.establish(operator);
    TestBed.tick();
    answer(gateway.requests[0], 4); // the owner's request, answered after they left
    expect(indicator.unread()).toBeNull();
    answer(gateway.requests[1], 0);
    expect(indicator.unread()).toBe(0);
  });
});
