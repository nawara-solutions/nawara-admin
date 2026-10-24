import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { ViewState, toViewState } from '../state/view-state';
import { NotificationSummary, NotificationSummaryGateway } from './notification-summary.gateway';

const IDLE: ViewState<NotificationSummary> = { status: 'idle' };

/**
 * The signed-in person's unread count: the ONE source of the sidebar badge, the top-bar bell and the Notifications page
 * (`/notifications`, P8-S3), so they cannot disagree. The gateway answers for the signed-in session only: it takes no
 * identity, so nobody can ask for another person's count. Loaded again whenever the signed-in actor changes (or on
 * "Try again") and dropped on sign-out, so one person's count is never shown to the next. `unread` is `null` while
 * loading, signed out, or when no count exists in this build: the shell then shows no number rather than a made-up
 * zero.
 */
@Injectable()
export class NotificationIndicator {
  private readonly gateway = inject(NotificationSummaryGateway);
  private readonly reloads = new Subject<void>();

  /** The count's view state, for the page's loading, error and not-in-build states. */
  readonly summary = toSignal(
    combineLatest([
      toObservable(inject(AuthSession).actor),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      // A new actor is a new request; the previous one's answer is discarded (`switchMap`).
      switchMap(([actor]) => (actor === null ? of(IDLE) : toViewState(this.gateway.summary()))),
    ),
    { initialValue: IDLE },
  );

  readonly unread = computed(() => {
    const state = this.summary();
    return state.status === 'success' ? state.data.unread : null;
  });

  reload(): void {
    this.reloads.next();
  }
}
