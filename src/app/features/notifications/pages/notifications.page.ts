import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { NotificationCenter } from '../../../core/notifications/notification-center';
import type {
  NotificationCategory,
  NotificationRecord,
} from '../../../core/notifications/notification-inbox.gateway';
import {
  NOTIFICATION_FILTERS,
  NotificationFilterId,
} from '../../../core/notifications/notification-filters';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwIcon } from '../../../shared/ui/icon/icon';
import type { NwIconName } from '../../../shared/ui/icon/icon.registry';

type ReadFilter = 'all' | 'unread' | 'read';

@Component({
  selector: 'adm-notifications-page',
  imports: [TranslocoPipe, NwDatePipe, NwNumberPipe, NwIcon],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'notifications' },
})
export class NotificationsPage {
  protected readonly center = inject(NotificationCenter);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly category = signal<NotificationFilterId>('all');
  protected readonly read = signal<ReadFilter>('all');
  protected readonly preferencesOpen = signal(false);
  protected readonly filters = NOTIFICATION_FILTERS;
  protected readonly readFilters = [
    { id: 'all', key: 'notifications.readFilter.all' },
    { id: 'unread', key: 'notifications.readFilter.unread' },
    { id: 'read', key: 'notifications.readFilter.read' },
  ] as const;
  private readonly router = inject(Router);

  protected readonly visible = computed(() => {
    const selected = NOTIFICATION_FILTERS.find((filter) => filter.id === this.category())!;
    return this.center.records().filter((record) => {
      const categoryMatches =
        selected.id === 'all' || selected.categories.includes(record.category);
      const readMatches =
        this.read() === 'all' || (this.read() === 'unread' ? record.unread : !record.unread);
      return categoryMatches && readMatches;
    });
  });

  protected readonly emptyKey = computed(() => {
    if (this.center.records().length === 0) return 'notifications.empty.noNotifications';
    if (this.read() === 'unread' && this.center.unread() === 0)
      return 'notifications.empty.allCaughtUp';
    return 'notifications.empty.noMatches';
  });

  protected categoryIcon(record: NotificationRecord): NwIconName {
    const icons: Record<NotificationCategory, NwIconName> = {
      invitation: 'mail',
      approval: 'badge-check',
      license: 'key-round',
      organization: 'building-2',
      access: 'shield-check',
      system: 'info',
    };
    return icons[record.category];
  }

  protected openRecord(record: NotificationRecord): void {
    if (!record.destination) return;
    if (record.unread) this.center.markRead(record.id);
    void this.router.navigateByUrl(record.destination);
  }

  protected togglePreferences(): void {
    this.preferencesOpen.update((value) => !value);
  }
}
