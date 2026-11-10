import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { combineLatest, of, startWith, Subject, switchMap } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../errors/app-error';
import { ViewState, toViewState } from '../state/view-state';
import { NotificationInboxGateway, NotificationRecord } from './notification-inbox.gateway';
import { NotificationIndicator } from './notification-indicator';

const IDLE: ViewState<readonly NotificationRecord[]> = { status: 'idle' };

/** One shell-scoped owner for the inbox state, filters' source data and mock actions. */
@Injectable()
export class NotificationCenter {
  private readonly gateway = inject(NotificationInboxGateway);
  private readonly indicator = inject(NotificationIndicator);
  private readonly session = inject(AuthSession);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloads = new Subject<void>();
  readonly actionPending = signal(false);
  readonly actionError = signal(false);

  readonly state = toSignal(
    combineLatest([toObservable(this.session.actor), this.reloads.pipe(startWith(undefined))]).pipe(
      switchMap(([actor]) => (actor === null ? of(IDLE) : toViewState(this.gateway.inbox()))),
    ),
    { initialValue: IDLE },
  );

  readonly records = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.data : [];
  });
  readonly unread = computed(() => {
    const state = this.state();
    return state.status === 'success' ? state.data.filter((record) => record.unread).length : null;
  });
  readonly unavailable = computed(() => {
    const state = this.state();
    return (
      state.status === 'error' &&
      state.error.kind === 'unavailable' &&
      state.error.code === ADAPTER_UNAVAILABLE
    );
  });

  markRead(id: string): void {
    this.perform(this.gateway.setUnread(id, false));
  }

  keepUnread(id: string): void {
    this.perform(this.gateway.setUnread(id, true));
  }

  markAllRead(): void {
    this.perform(this.gateway.markAllRead());
  }

  reload(): void {
    this.reloads.next();
  }

  private perform(action: ReturnType<NotificationInboxGateway['markAllRead']>): void {
    if (this.actionPending()) return;
    this.actionPending.set(true);
    this.actionError.set(false);
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.reload();
        this.indicator.reload();
      },
      error: () => {
        this.actionError.set(true);
        this.actionPending.set(false);
      },
      complete: () => this.actionPending.set(false),
    });
  }
}
