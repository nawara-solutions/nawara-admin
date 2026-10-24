import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../core/auth/auth-session';
import { SignOut } from '../../core/auth/sign-out';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem } from '../../shared/ui/menu/menu';
import { profileOf } from '../sidebar/profile';

/** The Settings hub and its personal appearance section (features/settings). */
export const SETTINGS_PATH = '/settings';
export const APPEARANCE_SETTINGS_PATH = '/settings/appearance';

/**
 * The account menu's content (A3-S3 design), opened by the sidebar profile card and by the top-bar avatar
 * (`nwMenuTriggerFor`): who is signed in, Settings (the hub, P9-S1), Appearance and Sign out. The header repeats what
 * the trigger's accessible name already says, so it is hidden from assistive technology; the identifier (email or
 * phone) is a machine value, kept left-to-right and never translated. Sign out is not styled as dangerous: nothing is
 * lost by it.
 */
@Component({
  selector: 'adm-account-menu',
  imports: [TranslocoPipe, NwIcon, NwMenu, NwMenuItem],
  templateUrl: './account-menu.html',
  styleUrl: './account-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountMenu {
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  protected readonly signOut = inject(SignOut);

  protected readonly profile = computed(() => profileOf(this.session.actor()));

  /** The email, or the phone of a phone-only operator; left out when it is already the name shown. */
  protected readonly identifier = computed(() => {
    const actor = this.session.actor();
    const id = actor?.email ?? actor?.phone ?? null;
    return id !== null && id !== this.profile()?.name ? id : null;
  });

  /** The name is itself an email or a phone (no display name): shown as a machine value, LTR. */
  protected readonly nameIsIdentifier = computed(() => {
    const actor = this.session.actor();
    return actor !== null && actor.displayName === undefined;
  });

  protected openSettings(): void {
    void this.router.navigateByUrl(SETTINGS_PATH);
  }

  protected openAppearance(): void {
    void this.router.navigateByUrl(APPEARANCE_SETTINGS_PATH);
  }

  protected signOutNow(): void {
    void this.signOut.run();
  }
}
