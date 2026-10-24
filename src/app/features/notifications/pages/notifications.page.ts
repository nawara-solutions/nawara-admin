import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NotificationsFacade } from '../application/notifications.facade';

/**
 * Notifications (`/notifications`; P8 design, artboard Notifications): the signed-in person's demo unread count and a
 * plain statement that their inbox is not available (CF-14). Not an inbox: no message, sender, time or action is
 * shown, and zero is never presented as "you have no notifications".
 */
@Component({
  selector: 'adm-notifications-page',
  imports: [TranslocoPipe, NwButton, NwDataState, NwIcon, NwNumberPipe],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'notifications' },
})
export class NotificationsPage {
  protected readonly facade = inject(NotificationsFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
}
