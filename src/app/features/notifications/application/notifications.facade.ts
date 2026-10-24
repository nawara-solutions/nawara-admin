import { Injectable, computed, inject } from '@angular/core';
import { NotificationIndicator } from '../../../core/notifications/notification-indicator';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';

/** What the Notifications page shows. */
export type NotificationsView =
  | { readonly status: 'loading' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly unread: number };

/**
 * View state of the signed-in person's Notifications (`/notifications`; P8-S3). Personal: every signed-in identity
 * sees its own count and nobody else's, through the shell's one `NotificationIndicator` (the sidebar badge and the bell
 * read the same signal), whose gateway answers for the signed-in session and takes no identity. No capability, no
 * Platform assignment and no membership decides it. A count only: no message exists to list, read or dismiss.
 */
@Injectable()
export class NotificationsFacade {
  private readonly indicator = inject(NotificationIndicator);

  readonly view = computed<NotificationsView>(() => {
    const state = this.indicator.summary();
    switch (state.status) {
      case 'success':
        return { status: 'ready', unread: state.data.unread };
      case 'forbidden':
        return { status: 'forbidden' };
      case 'error':
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild' }
          : { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  reload(): void {
    this.indicator.reload();
  }
}
