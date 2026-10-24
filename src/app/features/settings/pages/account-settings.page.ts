import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwSkeleton } from '../../../shared/ui/skeleton/skeleton';
import { accountView } from '../application/account-view';

/**
 * Settings → Account (`/settings/account`, P9-S2; docs/design/p9-settings-architecture.md §12): the signed-in person's
 * own account, read only. Everything comes from the session (`AuthSession`: Core's `/auth/me` and `/auth/grants`) and
 * the shell's `ScopeContext` (the Company's name for an owner; an operator's granted Platforms, named). No identity
 * parameter, gateway or copy of any state: the page cannot show anyone else's account. "Try again" is
 * `ScopeContext.reload()`, which re-reads an operator's grants first (P6-S2b). Nothing here changes anything, and no
 * credential, code, secret, token or challenge is ever shown.
 */
@Component({
  selector: 'adm-account-settings-page',
  imports: [TranslocoPipe, NwButton, NwDataState, NwIcon, NwNumberPipe, NwSkeleton],
  templateUrl: './account-settings.page.html',
  styleUrl: './account-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'account-settings' },
})
export class AccountSettingsPage {
  private readonly session = inject(AuthSession);
  protected readonly context = inject(ScopeContext);
  protected readonly isDemo = this.session.isDemo;

  protected readonly view = computed(() =>
    accountView(this.session.actor(), this.context.directory(), this.context.platforms()),
  );
}
