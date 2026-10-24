import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { OperatorDirectoryGateway } from '../data-access/operator-directory.gateway';
import { OperatorSummary } from '../domain/operator.model';
import {
  OperatorQuery,
  applyOperatorQuery,
  parseOperatorQuery,
  toOperatorQueryParams,
} from './operator-query';

/** What the directory page shows. */
export type OperatorDirectoryView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly operators: readonly OperatorSummary[] };

/** The directory's totals, from the loaded list. */
export interface OperatorTotals {
  readonly operators: number;
  /** Active assignments (one operator on two Platforms is two). */
  readonly assignments: number;
  readonly withoutAccess: number;
}

/**
 * View state of the Company's operator directory (`/operators`; P6-S1). Owner only: for anyone else the facade calls
 * no gateway and reports `forbidden` (UX; Core is the authority, and the route guard already sends an operator away).
 * The list is a PROVISIONAL mock read (CF-03); a build without demo data says it is not available. A hierarchy change
 * (`ScopeContext.revision`) or "Try again" loads it again; a new load cancels the one in flight (`switchMap`).
 *
 * Search is local (it matches contacts, which never go into a URL); the Platform filter, the account-state filter and
 * the sort are URL query parameters. None of them requests anything.
 */
@Injectable()
export class OperatorDirectoryFacade {
  private readonly gateway = inject(OperatorDirectoryGateway);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly locale = inject(NW_FORMATTING_LOCALE);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.operators.view') ? actor.companyId : null;
  });

  private readonly state = toSignal(
    combineLatest([
      toObservable(this.companyId),
      toObservable(this.context.revision),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<readonly OperatorSummary[]>>({ status: 'forbidden' })
          : toViewState(this.gateway.list(id), (operators) => operators.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<readonly OperatorSummary[]> },
  );

  readonly view = computed<OperatorDirectoryView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', operators: state.data };
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

  /** The Company's Platforms, to name assignments and offer the Platform filter (`[]` until they are known). */
  readonly platforms = computed<readonly PlatformRef[]>(() => {
    const platforms = this.context.platforms();
    return platforms.status === 'success' ? platforms.data : [];
  });

  /** The name of a Platform, or `null` while it is unknown. */
  platformName(id: PlatformId): string | null {
    return this.platforms().find((p) => p.id === id)?.name ?? null;
  }

  readonly query = computed<OperatorQuery>(() =>
    parseOperatorQuery(this.router.parseUrl(this.context.url()).queryParams),
  );

  /** The search text (contacts): in the page only, never in the URL, storage or logs. */
  readonly search = signal('');

  readonly totals = computed<OperatorTotals | null>(() => {
    const view = this.view();
    if (view.status !== 'ready') return null;
    return {
      operators: view.operators.length,
      assignments: view.operators.reduce((n, o) => n + o.activePlatformIds.length, 0),
      withoutAccess: view.operators.filter((o) => o.activePlatformIds.length === 0).length,
    };
  });

  readonly rows = computed<readonly OperatorSummary[]>(() => {
    const view = this.view();
    if (view.status !== 'ready') return [];
    return applyOperatorQuery(
      view.operators,
      this.query(),
      this.search(),
      new Intl.Collator(this.locale(), { sensitivity: 'base' }),
    );
  });

  /** Whether anything narrows the list (so "Clear filters" is offered when nothing matches). */
  readonly filtered = computed(() => {
    const query = this.query();
    return this.search().trim() !== '' || query.platform !== 'any' || query.state !== 'any';
  });

  /** Changes a filter or the sort: a URL change (replacing the history entry), so the view is shareable. */
  setQuery(change: Partial<OperatorQuery>): void {
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = toOperatorQueryParams({ ...this.query(), ...change });
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  clearFilters(): void {
    this.search.set('');
    this.setQuery({ platform: 'any', state: 'any' });
  }

  reload(): void {
    this.reloads.next();
  }
}
