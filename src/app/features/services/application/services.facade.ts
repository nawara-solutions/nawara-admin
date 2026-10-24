import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ServiceInventory } from '../../../core/core-services/core-service.model';
import { ServiceInventoryGateway } from '../../../core/core-services/service-inventory.gateway';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';

/** What the Services & health page shows. */
export type ServicesView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly inventory: ServiceInventory };

/**
 * View state of Services & health (`/services`; P8-S2): the documented Core services, owner only. For anyone else the
 * facade calls no gateway and reports `forbidden` (UX; the route guard sends an operator away first, and the mock
 * refuses them too). It loads once, and again only on "Try again": nothing polls, because nothing is observed.
 */
@Injectable()
export class ServicesFacade {
  private readonly gateway = inject(ServiceInventoryGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.services.view') ? actor.companyId : null;
  });

  private readonly state = toSignal(
    combineLatest([toObservable(this.companyId), this.reloads.pipe(startWith(undefined))]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<ServiceInventory>>({ status: 'forbidden' })
          : toViewState(this.gateway.inventory(id), (i) => i.services.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<ServiceInventory> },
  );

  readonly view = computed<ServicesView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', inventory: state.data };
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
