import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { can } from '../../core/access/capability-policy';
import { AuthSession } from '../../core/auth/auth-session';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import { NwNumberPipe } from '../../shared/format/format.pipes';
import { NwBrandMark } from '../../shared/ui/brand-mark/brand-mark';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconButton } from '../../shared/ui/icon-button/icon-button';
import { NAVIGATION, NavigationItem, SETTINGS_ITEM } from './navigation';
import { profileOf } from './profile';

/**
 * The sidebar of the owner's Company Overview design: the Nawara lockup, the navigation over a soft blush wash with a
 * floral illustration, and the signed-in profile. The illustration is a CSS background (decorative, invisible to
 * assistive technology). As a drawer it carries its own close button.
 */
@Component({
  selector: 'adm-sidebar',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TranslocoPipe,
    NwNumberPipe,
    NwBrandMark,
    NwIcon,
    NwIconButton,
  ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sidebar', role: 'region', '[attr.aria-label]': 'label()' },
})
export class Sidebar {
  private readonly session = inject(AuthSession);
  protected readonly label = translateSignal('shell.sidebarLabel');
  protected readonly unread = inject(NotificationIndicator).unread;

  /** Rendered as the navigation drawer (narrow and tablet viewports): shows the close button. */
  readonly drawer = input(false, { transform: booleanAttribute });
  readonly closeRequested = output<void>();

  protected readonly groups = computed(() => {
    const actor = this.session.actor();
    const visible = (item: NavigationItem) => !item.requires || can(actor, item.requires);
    return NAVIGATION.map((group) => ({ ...group, items: group.items.filter(visible) })).filter(
      (group) => group.items.length > 0,
    );
  });
  protected readonly settings = SETTINGS_ITEM;
  protected readonly profile = computed(() => profileOf(this.session.actor()));
}
