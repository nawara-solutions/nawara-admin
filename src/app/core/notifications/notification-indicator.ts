import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ViewState, toViewState } from '../state/view-state';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

/**
 * The unread count behind the shell's notification badge and dot, loaded once per shell. `null` while loading or when
 * no count exists in this build: the shell then shows no indicator rather than a made-up zero.
 */
@Injectable()
export class NotificationIndicator {
  private readonly state = toSignal(toViewState(inject(NotificationSummaryGateway).summary()), {
    initialValue: { status: 'idle' } as ViewState<NotificationSummary>,
  });

  readonly unread = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.data.unread : null;
  });
}
