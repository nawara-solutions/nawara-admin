import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';

/** The signed-in person's notification inbox, as the shell shows it (navigation badge, top-bar dot). */
export interface NotificationSummary {
  readonly unread: number;
}

/**
 * Frontend contract for the notification summary of the shell.
 *
 * Core status 🟡: notification-service delivers messages, but no human route reads a person's inbox or an unread count
 * (docs/CORE-INTEGRATION.md §9, CF-14). Only a mock adapter exists, in demo builds.
 */
export abstract class NotificationSummaryGateway {
  abstract summary(): Observable<NotificationSummary>;
}

/** Every non-demo build: there is no Core contract to call, so there is no count (never mock data). */
export class UnavailableNotificationSummaryGateway extends NotificationSummaryGateway {
  summary(): Observable<NotificationSummary> {
    return throwError(adapterUnavailable);
  }
}
