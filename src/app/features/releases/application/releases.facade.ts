import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ReleaseInformation } from '../domain/release-information.model';
import { ReleaseInformationGateway } from '../data-access/release-information.gateway';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';

/** What the Releases page shows. */
export type ReleasesView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly information: ReleaseInformation };

/**
 * View state of Releases (`/releases`; P8-S4): the documented standing of Core's Release capabilities, owner only. For
 * anyone else the facade calls no gateway and reports `forbidden` (UX; the route guard sends an operator away first,
 * and the mock refuses them too). Read only: there is no release to list and no command to run.
 */
@Injectable()
export class ReleasesFacade {
  private readonly gateway = inject(ReleaseInformationGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.releases.view') ? actor.companyId : null;
  });

  private readonly state = toSignal(
    combineLatest([toObservable(this.companyId), this.reloads.pipe(startWith(undefined))]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<ReleaseInformation>>({ status: 'forbidden' })
          : toViewState(this.gateway.information(id), (i) => i.capabilities.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<ReleaseInformation> },
  );

  readonly view = computed<ReleasesView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', information: state.data };
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

  reload(): void {
    this.reloads.next();
  }
}
