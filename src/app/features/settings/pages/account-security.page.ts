import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwInlineAlert } from '../../../shared/ui/inline-alert/inline-alert';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AccountSecurityFacade } from '../application/account-security.facade';
import { SecurityFactor } from '../data-access/account-security.gateway';

const FACTOR_TYPES = {
  totp: { icon: 'key-round', labelKey: 'settings.security.factors.totp' },
  webauthn: { icon: 'fingerprint', labelKey: 'settings.security.factors.webauthn' },
} as const satisfies Record<SecurityFactor['type'], { icon: NwIconName; labelKey: string }>;

/**
 * Settings → Security (`/settings/security`, P9-S4a; docs/design/p9-s4-account-security.md), the owner only: their
 * factors (type, confirmed or an unfinished setup, when added and last used, as far as known), how factors protect
 * sensitive actions, and what recovery needs, stated without promises. Whether a secret key exists is not shown: Core
 * has no read of it (CF-54). Two actions, each offered only when a confirmed authenticator exists to confirm it's you
 * with (otherwise disabled, with the reason): "Add an authenticator app" (P9-S4b) and "Create a new secret key"
 * (P9-S4c); after either, a one-time notice. No seed, code, key, token or grant is ever part of what this page reads.
 */
@Component({
  selector: 'adm-account-security-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwIcon,
    NwInlineAlert,
    NwStatusBadge,
    NwDatePipe,
    NwNumberPipe,
  ],
  templateUrl: './account-security.page.html',
  styleUrl: './account-security.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'account-security' },
})
export class AccountSecurityPage {
  protected readonly facade = inject(AccountSecurityFacade);
  private readonly session = inject(AuthSession);
  protected readonly isDemo = this.session.isDemo;
  protected readonly types = FACTOR_TYPES;
  protected readonly canAdd = computed(() => can(this.session.actor(), 'account.factor.add'));
  protected readonly canCreateKey = computed(() =>
    can(this.session.actor(), 'account.secret_key.rotate'),
  );
  /** Left by the add-authenticator page, shown once. */
  protected readonly notice = this.facade.takeNotice();

  constructor() {
    // Entering the page reads the current factors (a return from adding one included).
    this.facade.reload();
  }
}
