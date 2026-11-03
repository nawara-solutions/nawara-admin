import { Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError, timer, switchMap } from 'rxjs';
import { DEMO_OWNER_ID } from '../../demo/world/seed';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { NW_CLOCK } from '../../shared/format/clock';
import { NotificationInboxGateway, NotificationRecord } from './notification-inbox.gateway';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

const SCHOOL = '/platforms/5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01';
const HORIZON = `${SCHOOL}/organizations/3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01`;

/** Demo-only, in-memory inbox state, scoped to the signed-in business identity and reset on page reload. */
export class DemoNotificationInbox {
  private readonly auth = inject(DemoAuthState);
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly clock = inject(NW_CLOCK);
  private readonly inboxes = new Map<string, readonly NotificationRecord[]>();

  records(): readonly NotificationRecord[] {
    const signedIn = this.auth.signedIn();
    if (!signedIn || signedIn.businessIdentityId === null) return [];
    const identity = signedIn.businessIdentityId;
    let records = this.inboxes.get(identity);
    if (!records) {
      records = identity === DEMO_OWNER_ID ? this.ownerFixture() : [];
      this.inboxes.set(identity, records);
    }
    return records;
  }

  update(id: string, unread: boolean): boolean {
    const signedIn = this.auth.signedIn();
    if (!signedIn || signedIn.businessIdentityId === null) return false;
    const identity = signedIn.businessIdentityId;
    const records = this.records();
    if (!records.some((record) => record.id === id)) return false;
    this.inboxes.set(
      identity,
      records.map((record) => (record.id === id ? { ...record, unread } : record)),
    );
    return true;
  }

  markAllRead(): void {
    const signedIn = this.auth.signedIn();
    if (!signedIn || signedIn.businessIdentityId === null) return;
    const identity = signedIn.businessIdentityId;
    this.inboxes.set(
      identity,
      this.records().map((record) => ({ ...record, unread: false })),
    );
  }

  private ownerFixture(): readonly NotificationRecord[] {
    const now = this.clock();
    return [
      {
        id: 'demo-invitation-awaiting-acceptance',
        category: 'invitation',
        titleKey: 'notifications.records.invitation.title',
        descriptionKey: 'notifications.records.invitation.description',
        context: 'École Horizon · Nawara School',
        createdAt: new Date(now - 5 * 60_000).toISOString(),
        priority: 'normal',
        unread: true,
        destination: `${HORIZON}/members`,
      },
      {
        id: 'demo-license-expiring',
        category: 'license',
        titleKey: 'notifications.records.license.title',
        descriptionKey: 'notifications.records.license.description',
        context: 'Nawara School',
        createdAt: new Date(now - 60 * 60_000).toISOString(),
        priority: 'urgent',
        unread: true,
        destination: '/licenses',
      },
      {
        id: 'demo-organization-created',
        category: 'organization',
        titleKey: 'notifications.records.organization.title',
        descriptionKey: 'notifications.records.organization.description',
        context: 'Institut Atlas Savoir · Nawara School',
        createdAt: new Date(now - 3 * 60 * 60_000).toISOString(),
        priority: 'normal',
        unread: false,
        destination: `${SCHOOL}/organizations`,
      },
      {
        id: 'demo-membership-approved',
        category: 'approval',
        titleKey: 'notifications.records.approval.title',
        descriptionKey: 'notifications.records.approval.description',
        context: 'Nawara School · École Horizon',
        createdAt: new Date(now - 5 * 60 * 60_000).toISOString(),
        priority: 'normal',
        unread: true,
        destination: `${HORIZON}/members`,
      },
      {
        id: 'demo-operator-access-request',
        category: 'access',
        titleKey: 'notifications.records.access.title',
        descriptionKey: 'notifications.records.access.description',
        context: 'Nawara Drive',
        createdAt: new Date(now - 24 * 60 * 60_000).toISOString(),
        priority: 'normal',
        unread: true,
        destination: '/operators',
      },
    ];
  }
}

/** Demo adapter only. Each call resolves the current simulated identity; callers cannot request another user's inbox. */
export class MockNotificationInboxGateway extends NotificationInboxGateway {
  private readonly store = inject(DemoNotificationInbox);
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly auth = inject(DemoAuthState);

  inbox(): Observable<readonly NotificationRecord[]> {
    const signedIn = this.auth.signedIn();
    if (!signedIn) {
      const error: AppError = { kind: 'unauthenticated', status: 401 };
      return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    }
    return of(this.store.records()).pipe(delay(this.latency));
  }

  setUnread(id: string, unread: boolean): Observable<void> {
    return this.action(() => {
      if (!this.store.update(id, unread)) throw new Error('Notification is not in this inbox.');
    });
  }

  markAllRead(): Observable<void> {
    return this.action(() => this.store.markAllRead());
  }

  private action(action: () => void): Observable<void> {
    if (!this.auth.signedIn()) {
      const error: AppError = { kind: 'unauthenticated', status: 401 };
      return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    }
    try {
      action();
    } catch {
      const notFound: AppError = { kind: 'not_found', status: 404 };
      return throwError(() => notFound);
    }
    return of(undefined).pipe(delay(this.latency));
  }
}

/** Compatibility summary adapter; its count is derived from the exact same demo inbox records as the UI. */
export class MockNotificationSummaryGateway extends NotificationSummaryGateway {
  private readonly store = inject(DemoNotificationInbox);
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly auth = inject(DemoAuthState);

  summary(): Observable<NotificationSummary> {
    const signedIn = this.auth.signedIn();
    if (!signedIn) {
      const unauthenticated: AppError = { kind: 'unauthenticated', status: 401 };
      return timer(this.latency).pipe(switchMap(() => throwError(() => unauthenticated)));
    }
    const unread = this.store.records().filter((record) => record.unread).length;
    return of({ unread }).pipe(delay(this.latency));
  }
}

export const MOCK_NOTIFICATION_PROVIDERS: readonly Provider[] = [
  DemoNotificationInbox,
  { provide: NotificationInboxGateway, useClass: MockNotificationInboxGateway },
  { provide: NotificationSummaryGateway, useClass: MockNotificationSummaryGateway },
];

/** Keep the previous provider symbol for existing focused adapter tests. */
export const MOCK_NOTIFICATION_SUMMARY_PROVIDERS = MOCK_NOTIFICATION_PROVIDERS;
