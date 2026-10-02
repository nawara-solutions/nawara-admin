import { Provider, inject } from '@angular/core';
import { Observable, delay, of } from 'rxjs';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

/** FICTIONAL unread count of the demo owner (owner design, 2026-10-02). Not Core data. */
export const DEMO_NOTIFICATION_SUMMARY: NotificationSummary = { unread: 4 };

/** Mock adapter (demo builds only). */
export class MockNotificationSummaryGateway extends NotificationSummaryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);

  summary(): Observable<NotificationSummary> {
    return of(DEMO_NOTIFICATION_SUMMARY).pipe(delay(this.latency));
  }
}

export const MOCK_NOTIFICATION_SUMMARY_PROVIDERS: readonly Provider[] = [
  { provide: NotificationSummaryGateway, useClass: MockNotificationSummaryGateway },
];
