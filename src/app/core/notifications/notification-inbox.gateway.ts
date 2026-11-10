import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';

/** Admin's client-side inbox view. It is not a Nawara Core API contract. */
export type NotificationCategory =
  'invitation' | 'approval' | 'license' | 'organization' | 'access' | 'system';
export type NotificationPriority = 'normal' | 'urgent';

export interface NotificationRecord {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly context: string;
  readonly createdAt: string;
  readonly priority: NotificationPriority;
  readonly unread: boolean;
  /** Only a known, authorized in-app route; null means the item is informational. */
  readonly destination: string | null;
}

/** Admin's mock-first inbox boundary. The non-demo adapter is unavailable until Core defines a human inbox API. */
export abstract class NotificationInboxGateway {
  abstract inbox(): Observable<readonly NotificationRecord[]>;
  abstract setUnread(id: string, unread: boolean): Observable<void>;
  abstract markAllRead(): Observable<void>;
}

export class UnavailableNotificationInboxGateway extends NotificationInboxGateway {
  inbox(): Observable<readonly NotificationRecord[]> {
    return throwError(adapterUnavailable);
  }

  setUnread(): Observable<void> {
    return throwError(adapterUnavailable);
  }

  markAllRead(): Observable<void> {
    return throwError(adapterUnavailable);
  }
}
