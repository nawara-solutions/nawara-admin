import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { Router, RouterLink } from '@angular/router';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { NotificationRecord } from '../../core/notifications/notification-inbox.gateway';
import { NotificationCenter as NotificationState } from '../../core/notifications/notification-center';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import { AuthSession } from '../../core/auth/auth-session';
import {
  NOTIFICATION_FILTERS,
  NotificationFilterId,
} from '../../core/notifications/notification-filters';
import { NwDatePipe, NwNumberPipe } from '../../shared/format/format.pipes';
import { NwIcon } from '../../shared/ui/icon/icon';
import type { NwIconName } from '../../shared/ui/icon/icon.registry';

const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
];

@Component({
  selector: 'adm-notification-center',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    RouterLink,
    TranslocoPipe,
    NwIcon,
    NwDatePipe,
    NwNumberPipe,
  ],
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'notification-center' },
})
export class NotificationCenter {
  protected readonly state = inject(NotificationState);
  protected readonly unread = inject(NotificationIndicator).unread;
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly open = signal(false);
  protected readonly filter = signal<NotificationFilterId>('all');
  protected readonly preferencesOpen = signal(false);
  protected readonly filters = NOTIFICATION_FILTERS;
  protected readonly positions = POSITIONS;
  private readonly router = inject(Router);
  private readonly trigger = viewChild('trigger', { read: ElementRef<HTMLButtonElement> });
  private readonly panel = viewChild('panel', { read: ElementRef<HTMLElement> });

  protected readonly visibleRecords = computed(() => {
    const selected = NOTIFICATION_FILTERS.find((filter) => filter.id === this.filter())!;
    return this.state
      .records()
      .filter((record) => selected.id === 'all' || selected.categories.includes(record.category));
  });

  protected categoryIcon(record: NotificationRecord): NwIconName {
    switch (record.category) {
      case 'invitation':
        return 'mail';
      case 'approval':
        return 'badge-check';
      case 'license':
        return 'key-round';
      case 'organization':
        return 'building-2';
      case 'access':
        return 'shield-check';
      case 'system':
        return 'info';
    }
  }

  protected toggle(): void {
    this.open.update((value) => !value);
    if (this.open()) queueMicrotask(() => this.panel()?.nativeElement.focus());
  }

  protected close(restoreFocus = true): void {
    this.open.set(false);
    if (restoreFocus) queueMicrotask(() => this.trigger()?.nativeElement.focus());
  }

  protected outsideClick(event: MouseEvent): void {
    if (!this.trigger()?.nativeElement.contains(event.target as Node)) this.close(false);
  }

  protected keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  protected activateRecord(record: NotificationRecord): void {
    if (!record.destination) return;
    if (record.unread) this.state.markRead(record.id);
    this.close(false);
  }

  protected viewAll(): void {
    this.close(false);
    void this.router.navigateByUrl('/notifications');
  }

  protected togglePreferences(): void {
    this.preferencesOpen.update((value) => !value);
  }
}
