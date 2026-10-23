import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { ViewState, toViewState } from '../state/view-state';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

const IDLE: ViewState<NotificationSummary> = { status: 'idle' };

/**
 * The unread count behind the shell's notification badge and dot, for the signed-in person. Loaded again whenever the
 * signed-in actor changes and dropped on sign-out, so one person's count is never shown to the next. `null` while
 * loading, signed out, or when no count exists in this build: the shell then shows no indicator rather than a made-up
 * zero.
 */
@Injectable()
export class NotificationIndicator {
  private readonly gateway = inject(NotificationSummaryGateway);

  private readonly state = toSignal(
    toObservable(inject(AuthSession).actor).pipe(
      // A new actor is a new request; the previous one's answer is discarded (`switchMap`).
      switchMap((actor) => (actor === null ? of(IDLE) : toViewState(this.gateway.summary()))),
    ),
    { initialValue: IDLE },
  );

  readonly unread = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.data.unread : null;
  });
}
