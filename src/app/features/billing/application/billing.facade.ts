import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { BillingGateway } from '../data-access/billing.gateway';
import { PaymentFollowUps, PaymentIssueKind } from '../domain/billing.model';

/** What the Billing & payments page shows. */
export type BillingView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly followUps: PaymentFollowUps };

/** The issue filter: machine values, never translated. */
export type IssueFilter = 'all' | PaymentIssueKind;

export const ISSUE_FILTERS: readonly IssueFilter[] = ['all', 'failed', 'awaiting_action'];

/**
 * View state of the Company's payment follow-ups (`/billing`; P7-S3). The Company owner only: for anyone else the
 * facade calls no gateway and reports `forbidden` (UX; the route guard already sends an operator away, and the mock
 * refuses them too). Financial authority comes from owning the Company, never from a Platform assignment or a
 * membership. The issue filter is the page's own and requests nothing. Read only.
 */
@Injectable()
export class BillingFacade {
  private readonly gateway = inject(BillingGateway);
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
          ? of<ViewState<PaymentFollowUps>>({ status: 'forbidden' })
          : toViewState(this.gateway.followUps(id), (f) => f.followUps.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<PaymentFollowUps> },
  );

  readonly view = computed<BillingView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', followUps: state.data };
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

  readonly filter = signal<IssueFilter>('all');

  /** The follow-ups the filter keeps, in the gateway's order. */
  readonly rows = computed(() => {
    const view = this.view();
    if (view.status !== 'ready') return [];
    const filter = this.filter();
    return view.followUps.followUps.filter((f) => filter === 'all' || f.kind === filter);
  });

  /** How many follow-ups each filter keeps (from the one loaded list). */
  count(filter: IssueFilter): number {
    const view = this.view();
    if (view.status !== 'ready') return 0;
    return view.followUps.followUps.filter((f) => filter === 'all' || f.kind === filter).length;
  }

  reload(): void {
    this.reloads.next();
  }
}
