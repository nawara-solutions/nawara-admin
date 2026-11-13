import { Provider, inject } from '@angular/core';
import { Observable, delay, of, throwError, timer, switchMap } from 'rxjs';
import { DemoWorld } from '../../demo/world/demo-world';
import { DEMO_OWNER_ID } from '../../demo/world/seed';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { NW_CLOCK } from '../../shared/format/clock';
import { derivedNotificationsOf } from './demo-notifications.mock';
import { NotificationInboxGateway, NotificationRecord } from './notification-inbox.gateway';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

/**
 * Demo-only inbox (WP-3.4): its notifications are DERIVED from the shared demo world on every read
 * (`derivedNotificationsOf`), so one exists exactly while its condition holds. The Company owner sees them; every other
 * identity sees none (unchanged). Only the read state is kept here, in memory, per business identity, reset on page reload.
 */
export class DemoNotificationInbox {
  private readonly auth = inject(DemoAuthState);
  private readonly clock = inject(NW_CLOCK);
  private readonly world = inject(DemoWorld);
  /** Per identity: the notifications read so far (`false`) or marked unread again (`true`). */
  private readonly readState = new Map<string, ReadonlyMap<string, boolean>>();

  records(): readonly NotificationRecord[] {
    const identity = this.identity();
    if (identity === null || identity !== DEMO_OWNER_ID) return [];
    const state = this.readState.get(identity);
    return derivedNotificationsOf(this.world.snapshot(), this.clock()).map((n) => ({
      ...n,
      unread: state?.get(n.id) ?? true,
    }));
  }

  update(id: string, unread: boolean): boolean {
    const identity = this.identity();
    if (identity === null || !this.records().some((record) => record.id === id)) return false;
    this.readState.set(identity, new Map(this.readState.get(identity)).set(id, unread));
    return true;
  }

  markAllRead(): void {
    const identity = this.identity();
    if (identity === null) return;
    const state = new Map(this.readState.get(identity));
    for (const record of this.records()) state.set(record.id, false);
    this.readState.set(identity, state);
  }

  private identity(): string | null {
    const signedIn = this.auth.signedIn();
    return signedIn?.businessIdentityId ?? null;
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
