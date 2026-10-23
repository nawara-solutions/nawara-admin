import { Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

/** FICTIONAL unread count of the demo owner (owner design, 2026-10-02). Not Core data. */
export const DEMO_NOTIFICATION_SUMMARY: NotificationSummary = { unread: 4 };

/** FICTIONAL: the demo operators have nothing unread. */
export const DEMO_OPERATOR_NOTIFICATION_SUMMARY: NotificationSummary = { unread: 0 };

/**
 * Mock adapter (demo builds only). It answers for whoever the simulated Core session belongs to (`DemoAuthState`), as a
 * bearer-scoped Core route would: the owner's count, an operator's, or `401` when nobody is signed in.
 */
export class MockNotificationSummaryGateway extends NotificationSummaryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly auth = inject(DemoAuthState);

  summary(): Observable<NotificationSummary> {
    const signedIn = this.auth.signedIn();
    if (signedIn === null) {
      const unauthenticated: AppError = { kind: 'unauthenticated', status: 401 };
      return timer(this.latency).pipe(switchMap(() => throwError(() => unauthenticated)));
    }
    const summary =
      signedIn.identity.adminTier === 'owner'
        ? DEMO_NOTIFICATION_SUMMARY
        : DEMO_OPERATOR_NOTIFICATION_SUMMARY;
    return of(summary).pipe(delay(this.latency));
  }
}

export const MOCK_NOTIFICATION_SUMMARY_PROVIDERS: readonly Provider[] = [
  { provide: NotificationSummaryGateway, useClass: MockNotificationSummaryGateway },
];
