import { Provider, inject } from '@angular/core';
import { Observable, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoWorld } from '../../demo/world/demo-world';
import { unreadOf } from '../../demo/world/selectors';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

/**
 * Mock adapter (demo builds only). It answers for whoever the simulated Core session belongs to (`DemoAuthState`), as a
 * bearer-scoped Core route would: that business identity's unread count in the demo world (the owner has 4, the
 * operators none), or `401` when nobody is signed in.
 */
export class MockNotificationSummaryGateway extends NotificationSummaryGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  summary(): Observable<NotificationSummary> {
    const signedIn = this.auth.signedIn();
    if (signedIn === null) {
      const unauthenticated: AppError = { kind: 'unauthenticated', status: 401 };
      return timer(this.latency).pipe(switchMap(() => throwError(() => unauthenticated)));
    }
    const summary: NotificationSummary = {
      unread: unreadOf(this.world.snapshot(), signedIn.businessIdentityId),
    };
    return of(summary).pipe(delay(this.latency));
  }
}

export const MOCK_NOTIFICATION_SUMMARY_PROVIDERS: readonly Provider[] = [
  { provide: NotificationSummaryGateway, useClass: MockNotificationSummaryGateway },
];
