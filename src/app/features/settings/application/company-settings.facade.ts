import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { CompanySettings, CompanySettingsGateway } from '../data-access/company-settings.gateway';

/** What the Company settings page shows. */
export type CompanySettingsView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly settings: CompanySettings };

/**
 * View state of Company settings (`/settings/company`; P9-S3), the owner only. For anyone else the facade calls no
 * gateway and reports `forbidden` (UX; the route guard sends an operator away first, and the mock refuses them too).
 * Read only: Core has no Company profile read or command (CF-49). In a production build the gateway is unavailable,
 * so the page says so rather than showing a demo Company.
 */
@Injectable()
export class CompanySettingsFacade {
  private readonly gateway = inject(CompanySettingsGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.settings.view') ? actor.companyId : null;
  });

  private readonly state = toSignal(
    combineLatest([toObservable(this.companyId), this.reloads.pipe(startWith(undefined))]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<CompanySettings>>({ status: 'forbidden' })
          : toViewState(this.gateway.load(id)),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<CompanySettings> },
  );

  readonly view = computed<CompanySettingsView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', settings: state.data };
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

  reload(): void {
    this.reloads.next();
  }
}
