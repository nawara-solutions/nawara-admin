import { Injectable, Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { CompanyId, PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE, AppError } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { OperatorAssignmentGateway } from '../data-access/operator-assignment.gateway';
import { OperatorDirectoryGateway } from '../data-access/operator-directory.gateway';
import { OperatorSummary, PlatformAssignment } from '../domain/operator.model';
import { OPERATORS_SEGMENT } from './operator-paths';

/** What the detail page shows of the operator's account. `notFound` collapses "unknown" and "not yours". */
export type OperatorDetailView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notFound' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly operator: OperatorSummary };

/** What the page shows of the assignment history: current access and removed access, apart. */
export type AssignmentHistoryView =
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      /** Active assignments, most recent first. */
      readonly current: readonly PlatformAssignment[];
      /** Removed assignments, most recently removed first. */
      readonly removed: readonly PlatformAssignment[];
    };

interface Key {
  readonly company: CompanyId;
  readonly operator: string;
}

/** The operator id of an `/operators/:operatorId` URL, or `null`. */
export function operatorIdFromUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0] ?? '';
  const [first, id, extra] = path.split('/').filter((segment) => segment !== '');
  return first === OPERATORS_SEGMENT && id !== undefined && extra === undefined
    ? decodeURIComponent(id)
    : null;
}

const isUnavailable = (error: AppError) =>
  error.kind === 'unavailable' && error.code === ADAPTER_UNAVAILABLE;

/**
 * View state of one operator (`/operators/:operatorId`; P6-S1): their account from the PROVISIONAL directory read
 * (CF-03), and their Platform assignment history from its own gateway (Core's verified owner read; its HTTP adapter is
 * not authorized yet), asked for once the account is shown; a failed history does not hide the account. Owner only: nothing is requested
 * for anyone else. An unknown operator and another Company's are the same `notFound` (Core's collapsed 404), and the
 * history is never requested for an operator whose account was not found, so nothing about them is shown.
 */
@Injectable()
export class OperatorDetailFacade {
  private readonly directory = inject(OperatorDirectoryGateway);
  private readonly assignments = inject(OperatorAssignmentGateway);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly reloads = new Subject<void>();

  private readonly key = computed<Key | null>(() => {
    const actor = this.session.actor();
    const operator = operatorIdFromUrl(this.context.url());
    if (actor?.kind !== 'owner' || !can(actor, 'company.operators.view') || operator === null)
      return null;
    return { company: actor.companyId, operator };
  });

  private load<T>(key: Signal<Key | null>, request: (key: Key) => Observable<T>) {
    return toSignal(
      combineLatest([
        toObservable(key),
        toObservable(this.context.revision),
        this.reloads.pipe(startWith(undefined)),
      ]).pipe(
        switchMap(([key]) =>
          key === null ? of<ViewState<T>>({ status: 'forbidden' }) : toViewState(request(key)),
        ),
      ),
      { initialValue: { status: 'idle' } as ViewState<T> },
    );
  }

  private readonly account = this.load(this.key, (key) =>
    this.directory.load(key.company, key.operator),
  );

  readonly view = computed<OperatorDetailView>(() => {
    const state = this.account();
    switch (state.status) {
      case 'success':
        // A late answer about another operator (navigation in flight) reads as loading.
        return state.data.id === this.key()?.operator
          ? { status: 'ready', operator: state.data }
          : { status: 'loading' };
      case 'forbidden':
        return { status: 'forbidden' };
      case 'error':
        if (state.error.kind === 'not_found' || state.error.kind === 'forbidden')
          return { status: 'notFound' };
        return isUnavailable(state.error) ? { status: 'notInBuild' } : { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  /** The history is asked for only once the account is shown (never for an operator that was not found). */
  private readonly historyKey = computed<Key | null>(
    () => {
      const key = this.key();
      return this.view().status === 'ready' ? key : null;
    },
    { equal: (a, b) => a?.operator === b?.operator && a?.company === b?.company },
  );

  private readonly history = this.load(this.historyKey, (key) =>
    this.assignments.history(key.operator),
  );

  readonly historyView = computed<AssignmentHistoryView>(() => {
    const state = this.history();
    switch (state.status) {
      case 'success':
        return {
          status: 'ready',
          current: state.data
            .filter((a) => a.active)
            .sort((a, b) => b.assignedAt.localeCompare(a.assignedAt)),
          removed: state.data
            .filter((a) => !a.active)
            .sort((a, b) => (b.revokedAt ?? '').localeCompare(a.revokedAt ?? '')),
        };
      case 'error':
        return isUnavailable(state.error) ? { status: 'notInBuild' } : { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  /** The Company's Platforms, to name assignments (`[]` until they are known). */
  private readonly platforms = computed<readonly PlatformRef[]>(() => {
    const platforms = this.context.platforms();
    return platforms.status === 'success' ? platforms.data : [];
  });

  /** The name of a Platform, or `null` while it is unknown. */
  platformName(id: PlatformId): string | null {
    return this.platforms().find((p) => p.id === id)?.name ?? null;
  }

  reload(): void {
    this.reloads.next();
  }
}
