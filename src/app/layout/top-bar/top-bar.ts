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
import { NwIconButton } from '../../shared/ui/icon-button/icon-button';
import { NwMenuTrigger } from '../../shared/ui/menu/menu';
import { AccountMenu } from '../account-menu/account-menu';
import { Breadcrumbs } from '../breadcrumbs/breadcrumbs';
import { ContextSwitcher } from '../context-switcher/context-switcher';
import { GlobalSearch } from '../global-search/global-search';
import { NotificationCenter } from '../notification-center/notification-center';
import { profileOf } from '../sidebar/profile';

/**
 * Top bar of the owner design: navigation toggle (drawer mode), breadcrumbs, search (not built: disabled), scope
 * switcher, the unread-notification bell and the signed-in avatar, which opens the account menu.
 * Sticky, over a translucent wash.
 */
@Component({
  selector: 'adm-top-bar',
  imports: [
    TranslocoPipe,
    NwIconButton,
    NwMenuTrigger,
    Breadcrumbs,
    GlobalSearch,
    NotificationCenter,
    ContextSwitcher,
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
  protected readonly profile = computed(() => profileOf(this.session.actor()));
  protected readonly signingOut = inject(SignOut).busy;

  private readonly menuButton = viewChild('menuButton', { read: ElementRef<HTMLButtonElement> });

  focusMenuButton(): void {
    this.menuButton()?.nativeElement.focus();
  }
}
