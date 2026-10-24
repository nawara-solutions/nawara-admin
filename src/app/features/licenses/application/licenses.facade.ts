import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { LicensesGateway } from '../data-access/licenses.gateway';
import { LicensesOverview } from '../domain/licenses.model';

/** What the Licenses page shows. */
export type LicensesView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly overview: LicensesOverview };

/**
 * View state of the Company's Licenses & entitlements overview (`/licenses`; P7-S1). The Company owner only: for anyone
 * else the facade calls no gateway and reports `forbidden` (UX; the route guard already sends an operator away, and the
 * mock refuses them too). Commercial authority comes from owning the Company, never from a Platform assignment or a
 * membership. A hierarchy change (`ScopeContext.revision`) or "Try again" loads it again; a new load cancels the one in
 * flight. Read only.
 */
@Injectable()
export class LicensesFacade {
  private readonly gateway = inject(LicensesGateway);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.commercial.view')
      ? actor.companyId
      : null;
  });

  private readonly state = toSignal(
    combineLatest([
      toObservable(this.companyId),
      toObservable(this.context.revision),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<LicensesOverview>>({ status: 'forbidden' })
          : toViewState(this.gateway.overview(id), (o) => o.company.organizations === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<LicensesOverview> },
  );

  readonly view = computed<LicensesView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', overview: state.data };
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

  /** The name of a Platform from the scope directory, or `null` while it is unknown. */
  platformName(id: PlatformId): string | null {
    const platforms = this.context.platforms();
    return platforms.status === 'success'
      ? (platforms.data.find((p) => p.id === id)?.name ?? null)
      : null;
  }

  reload(): void {
    this.reloads.next();
  }
}
