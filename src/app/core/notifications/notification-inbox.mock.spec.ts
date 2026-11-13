import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { DEMO_OWNER_ACCOUNT } from '../auth/auth.fixtures';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { DemoWorld } from '../../demo/world/demo-world';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../demo/world/seed';
import { NW_CLOCK } from '../../shared/format/clock';
import { derivedNotificationsOf } from './demo-notifications.mock';
import { DemoNotificationInbox, MockNotificationSummaryGateway } from './notification-inbox.mock';

const NOW = Date.UTC(2026, 9, 23, 12);

describe('demo notification inbox (derived, WP-3.4)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DemoAuthState,
        DemoNotificationInbox,
        MockNotificationSummaryGateway,
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: NW_CLOCK, useValue: () => NOW },
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

  it('shows the owner exactly the notifications the world derives, all unread at first, counted by the badge', async () => {
    signInOwner();
    const inbox = TestBed.inject(DemoNotificationInbox);
    const derived = derivedNotificationsOf(TestBed.inject(DemoWorld).snapshot(), NOW);
    expect(derived.length).toBeGreaterThan(0);
    expect(inbox.records().map(({ id }) => id)).toEqual(derived.map(({ id }) => id));
    expect(inbox.records().every((r) => r.unread)).toBe(true);
    expect(await firstValueFrom(TestBed.inject(MockNotificationSummaryGateway).summary())).toEqual({
      unread: derived.length,
    });
  });

  it('keeps read state per identity, in memory, and synchronizes the badge', async () => {
    const auth = signInOwner();
    const inbox = TestBed.inject(DemoNotificationInbox);
    const summary = TestBed.inject(MockNotificationSummaryGateway);
    const [first] = inbox.records();
    const total = inbox.records().length;
    expect(inbox.update(first!.id, false)).toBe(true);
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: total - 1 });
    expect(inbox.update('not-a-notification', false)).toBe(false);
    inbox.markAllRead();
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: 0 });
    expect(inbox.update(first!.id, true)).toBe(true);
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: 1 });

    auth.signedIn.set({ identity: DEMO_OWNER_ACCOUNT.identity, businessIdentityId: null });
    expect(inbox.records()).toEqual([]);
    expect(await firstValueFrom(summary.summary())).toEqual({ unread: 0 });
  });

  it('drops a notification once its condition ends, and never brings it back from read state', () => {
    signInOwner();
    const inbox = TestBed.inject(DemoNotificationInbox);
    const world = TestBed.inject(DemoWorld);
    const requests = inbox.records().find((r) => r.id.startsWith('membership-requests:'))!;
    inbox.update(requests.id, false);
    const organizationId = requests.id.split(':')[1];
    world.commit((current) => ({
      ok: true,
      world: {
        ...current,
        memberships: current.memberships.map((m) =>
          m.organizationId === organizationId && m.status === 'pending'
            ? { ...m, status: 'rejected', rejectedAt: new Date(NOW).toISOString() }
            : m,
        ),
      },
      result: null,
    }));
    expect(inbox.records().map((r) => r.id)).not.toContain(requests.id);
    expect(inbox.update(requests.id, true)).toBe(false);
  });

  it('gives an operator and any non-owner identity an empty inbox (unchanged)', () => {
    const auth = TestBed.inject(DemoAuthState);
    auth.signedIn.set({ identity: DEMO_OWNER_ACCOUNT.identity, businessIdentityId: null });
    expect(TestBed.inject(DemoNotificationInbox).records()).toEqual([]);
    auth.signedIn.set({
      identity: DEMO_OWNER_ACCOUNT.identity,
      businessIdentityId: DEMO_OPERATOR_IDS.multi,
    });
    expect(TestBed.inject(DemoNotificationInbox).records()).toEqual([]);
  });
});
