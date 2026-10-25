import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
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
import { factorLabel, factorNumbers, removalBlock } from '../application/factor-removal';
import { RemoveFactorFacade } from '../application/remove-factor.facade';
import {
  REMOVAL_BLOCKS,
  RemoveFactorDialog,
} from '../components/remove-factor-dialog/remove-factor-dialog';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
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
 * (P9-S4c); after either, a one-time notice. Each confirmed factor offers "Remove" (P9-S4d) in a dialog over the
 * page-scoped `RemoveFactorFacade`, or says why it cannot be removed from Admin (the last confirmed factor, the last
 * authenticator app, a passkey-only owner); factors are told apart by type, position and dates (no names, CF-56). No
 * seed, code, key, token or grant is ever part of what this page reads.
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
  providers: [RemoveFactorFacade],
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
  protected readonly canRemove = computed(() => can(this.session.actor(), 'account.factor.remove'));
  protected readonly canChangePassword = computed(() =>
    can(this.session.actor(), 'account.password.change'),
  );
  protected readonly removal = inject(RemoveFactorFacade);
  protected readonly removalBlocks = REMOVAL_BLOCKS;
  private readonly dialogs = inject(NwDialogService);
  private readonly injector = inject(Injector);
  private readonly removalOutcome = viewChild('removalOutcome', { read: ElementRef<HTMLElement> });

  /** Each confirmed factor's position among those of its type (`null`: the only one). */
  private readonly numbers = computed(() => {
    const view = this.facade.view();
    return factorNumbers(view.status === 'ready' ? view.factors : []);
  });
  /** Why each confirmed factor cannot be removed from Admin, or `null` (Core stays the authority). */
  protected readonly blocks = computed(() => {
    const view = this.facade.view();
    const factors = view.status === 'ready' ? view.factors : [];
    return new Map(factors.filter((f) => f.confirmed).map((f) => [f.id, removalBlock(factors, f)]));
  });

  /** Left by the add-authenticator page, shown once. */
  protected readonly notice = this.facade.takeNotice();

  constructor() {
    // Entering the page reads the current factors (a return from adding one included).
    this.facade.reload();
  }

  protected labelOf(factor: SecurityFactor) {
    return factorLabel(factor.type, this.numbers().get(factor.id) ?? null);
  }

  /** Opens the removal dialog (an alertdialog, focus on Cancel once the fresh read is in). */
  protected remove(factorId: string): void {
    if (!this.removal.open(factorId)) return;
    const ref = this.dialogs.open<void, RemoveFactorFacade>(RemoveFactorDialog, {
      data: this.removal,
      role: 'alertdialog',
      autoFocus: 'dialog',
    });
    ref.closed.subscribe(() => {
      this.removal.close();
      // The factor is gone (its button too): focus the outcome instead of nothing.
      if (this.removal.outcome() !== null)
        afterNextRender(() => this.removalOutcome()?.nativeElement.focus(), {
          injector: this.injector,
        });
    });
  }
}
