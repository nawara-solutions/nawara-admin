import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import {
  AccountSecurity,
  AccountSecurityGateway,
  SecurityFactor,
} from '../data-access/account-security.gateway';

/** What the Security page shows. */
export type AccountSecurityView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | {
      readonly status: 'ready';
      /** Confirmed factors first, then unfinished setups; each group in its order of creation. */
      readonly factors: readonly SecurityFactor[];
      readonly confirmedCount: number;
      /** A confirmed authenticator exists: the one factor S4b can confirm "it's you" with (passkeys: later). */
      readonly hasAuthenticator: boolean;
    };

/** What the Security page says once after the add-authenticator page (P9-S4b): never a key, code or grant. */
export type AccountSecurityNotice = 'added' | 'cancelled';

/**
 * View state of the owner's Security overview (`/settings/security`; P9-S4a), read only. For anyone but the owner the
 * facade calls no gateway and reports `forbidden` (UX; the route guard sends an operator away first, and the mock
 * refuses them too). It reloads per signed-in owner (a new session never sees the previous one's factors), and each
 * time the page is entered (`reload()`), so a return from adding an authenticator shows the current list. In a
 * production build the gateway is unavailable, so the page says so.
 */
@Injectable()
export class AccountSecurityFacade {
  private readonly gateway = inject(AccountSecurityGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();
  private readonly pendingNotice = signal<AccountSecurityNotice | null>(null);

  private readonly ownerId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'account.security.view') ? actor.userId : null;
  });

  private readonly state = toSignal(
    combineLatest([toObservable(this.ownerId), this.reloads]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<AccountSecurity>>({ status: 'forbidden' })
          : toViewState(this.gateway.load(), (s) => s.factors.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<AccountSecurity> },
  );

  readonly view = computed<AccountSecurityView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success': {
        const factors = [
          ...state.data.factors.filter((f) => f.confirmed),
          ...state.data.factors.filter((f) => !f.confirmed),
        ];
        return {
          status: 'ready',
          factors,
          confirmedCount: factors.filter((f) => f.confirmed).length,
          hasAuthenticator: factors.some((f) => f.type === 'totp' && f.confirmed),
        };
      }
      case 'empty':
        return { status: 'empty' };
      case 'forbidden':
        return { status: 'forbidden' };
      case 'error':
        if (state.error.kind === 'forbidden') return { status: 'forbidden' };
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild' }
          : { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  /** Loads the factors (again): the page calls it when it is entered, and on "Try again". */
  reload(): void {
    this.reloads.next();
  }

  /** Leaves a notice for the Security page, shown once (D7: back on Security after adding an authenticator). */
  announce(notice: AccountSecurityNotice): void {
    this.pendingNotice.set(notice);
  }

  /** The notice left for the page, if any; taking it clears it. */
  takeNotice(): AccountSecurityNotice | null {
    const notice = this.pendingNotice();
    this.pendingNotice.set(null);
    return notice;
  }
}
