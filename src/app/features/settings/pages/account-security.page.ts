import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AccountSecurityFacade } from '../application/account-security.facade';
import { SecurityFactor } from '../data-access/account-security.gateway';

const FACTOR_TYPES = {
  totp: { icon: 'key-round', labelKey: 'settings.security.factors.totp' },
  webauthn: { icon: 'fingerprint', labelKey: 'settings.security.factors.webauthn' },
} as const satisfies Record<SecurityFactor['type'], { icon: NwIconName; labelKey: string }>;

/**
 * Settings → Security (`/settings/security`, P9-S4a; docs/design/p9-s4-account-security.md), the owner only and read
 * only: their factors (type, confirmed or an unfinished setup, when added and last used, as far as known), how factors
 * protect sensitive actions, and what recovery needs, stated without promises. Whether a secret key exists is not
 * shown: Core has no read of it (CF-54). No management control exists, enabled or disabled; no seed, code, key, token
 * or grant is ever part of what this page reads.
 */
@Component({
  selector: 'adm-account-security-page',
  imports: [TranslocoPipe, NwButton, NwDataState, NwIcon, NwStatusBadge, NwDatePipe, NwNumberPipe],
  templateUrl: './account-security.page.html',
  styleUrl: './account-security.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'account-security' },
})
export class AccountSecurityPage {
  protected readonly facade = inject(AccountSecurityFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly types = FACTOR_TYPES;
}
