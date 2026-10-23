import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../core/auth/auth-session';
import { SignOut } from '../../core/auth/sign-out';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconButton } from '../../shared/ui/icon-button/icon-button';
import { NwMenuTrigger } from '../../shared/ui/menu/menu';
import { AccountMenu } from '../account-menu/account-menu';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';
import { ContextSwitcher } from '../context-switcher/context-switcher';
import { PreferenceMenus } from '../preference-menus/preference-menus';
import { profileOf } from '../sidebar/profile';

/**
 * Top bar of the owner design: navigation toggle (drawer mode), breadcrumbs, search (not built: disabled), scope
 * switcher, language, theme, the unread-notification bell and the signed-in avatar, which opens the account menu.
 * Sticky, over a translucent wash.
 */
@Component({
  selector: 'adm-top-bar',
  imports: [
    TranslocoPipe,
    NwIcon,
    NwIconButton,
    NwMenuTrigger,
    Breadcrumbs,
    ContextSwitcher,
    PreferenceMenus,
    AccountMenu,
  ],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'top-bar', role: 'banner' },
})
export class TopBar {
  readonly showMenuButton = input(false);
  readonly menuExpanded = input(false);
  readonly menuRequested = output<void>();

  private readonly session = inject(AuthSession);
  protected readonly unread = inject(NotificationIndicator).unread;
  protected readonly profile = computed(() => profileOf(this.session.actor()));
  protected readonly signingOut = inject(SignOut).busy;

  private readonly menuButton = viewChild('menuButton', { read: ElementRef<HTMLButtonElement> });

  focusMenuButton(): void {
    this.menuButton()?.nativeElement.focus();
  }
}
