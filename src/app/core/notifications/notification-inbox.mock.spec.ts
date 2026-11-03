import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEMO_OWNER_ACCOUNT } from '../auth/auth.fixtures';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { DEMO_OWNER_ID } from '../../demo/world/seed';
import { NW_CLOCK } from '../../shared/format/clock';
import { DemoNotificationInbox, MockNotificationSummaryGateway } from './notification-inbox.mock';

describe('demo notification inbox', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DemoAuthState,
        DemoNotificationInbox,
        MockNotificationSummaryGateway,
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => Date.UTC(2026, 0, 1) },
      ],
    });
  });

  function signInOwner(): DemoAuthState {
    const auth = TestBed.inject(DemoAuthState);
    auth.signedIn.set({
      identity: DEMO_OWNER_ACCOUNT.identity,
      businessIdentityId: DEMO_OWNER_ID,
    });
    return auth;
  }

  it('provides deterministic owner records and derives the badge count from unread records', async () => {
    signInOwner();
    const inbox = TestBed.inject(DemoNotificationInbox);
    const records = inbox.records();
    expect(records.map(({ id }) => id)).toEqual([
      'demo-invitation-awaiting-acceptance',
      'demo-license-expiring',
      'demo-organization-created',
      'demo-membership-approved',
      'demo-operator-access-request',
    ]);
    expect(new Set(records.map(({ createdAt }) => createdAt)).size).toBe(5);
    expect(await firstValueFrom(TestBed.inject(MockNotificationSummaryGateway).summary())).toEqual({
      unread: 4,
    });
  });

  it('keeps each simulated identity in its own inbox and synchronizes read changes', async () => {
    const auth = signInOwner();
    const inbox = TestBed.inject(DemoNotificationInbox);
    const summary = TestBed.inject(MockNotificationSummaryGateway);
    expect(inbox.update('demo-invitation-awaiting-acceptance', false)).toBe(true);
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: 3 });

    auth.signedIn.set({ identity: DEMO_OWNER_ACCOUNT.identity, businessIdentityId: null });
    expect(inbox.records()).toEqual([]);
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: 0 });
  });

  it('returns an empty inbox for a signed-in non-owner identity', () => {
    const auth = TestBed.inject(DemoAuthState);
    auth.signedIn.set({ identity: DEMO_OWNER_ACCOUNT.identity, businessIdentityId: null });
    expect(TestBed.inject(DemoNotificationInbox).records()).toEqual([]);
  });
});
