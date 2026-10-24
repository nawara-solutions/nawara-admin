import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Params, Router } from '@angular/router';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { ActivityGateway } from '../data-access/activity.gateway';
import {
  ActivityAction,
  ActivityEntry,
  ActivityOrganization,
  AdministrativeActivity,
} from '../domain/activity.model';

/** What the activity browser shows. `empty`: the Company has no simulated event at all. */
export type ActivityView =
  | { readonly status: 'forbidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | { readonly status: 'empty' }
  | { readonly status: 'ready'; readonly activity: AdministrativeActivity };

/**
 * The filters, as URL query parameters: a Platform id, an Organization id and an action (machine values; never a
 * contact or a payload). An id the Company does not have is reported (`unknown`), never matched.
 */
export interface ActivityQuery {
  readonly platform: string | null;
  readonly organization: string | null;
  readonly action: ActivityAction | null;
}

/** The actions, in the order the action filter lists them. */
export const ACTIVITY_ACTIONS: readonly ActivityAction[] = [
  'organization.created',
  'organization.updated',
  'admin_invitation.created',
  'admin_invitation.revoked',
  'membership.approved',
  'membership.rejected',
  'membership.revoked',
  'organization.admin.granted',
  'organization.admin.revoked',
  'platform.created',
  'operator.assigned',
  'operator.unassigned',
  'operator.created',
  'operator.blocked',
  'operator.unblocked',
];

/** How many events each list shows before "Show more" (a page of the loaded list; nothing is requested). */
export const ACTIVITY_PAGE_SIZE = 20;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value.slice(0, 64) : null;

/** Query parameters → the query; an unknown action is no filter. */
export function parseActivityQuery(params: Params): ActivityQuery {
  const action = text(params['action']);
  return {
    platform: text(params['platform']),
    organization: text(params['organization']),
    action:
      action !== null && (ACTIVITY_ACTIONS as readonly string[]).includes(action)
        ? (action as ActivityAction)
        : null,
  };
}

/** The resolved selection: what the filters name in this Company, or that they name something it does not have. */
export type ActivitySelection =
  | { readonly status: 'all' }
  | { readonly status: 'platform'; readonly platformId: string }
  | {
      readonly status: 'organization';
      readonly platformId: string;
      readonly organization: ActivityOrganization;
    }
  | { readonly status: 'unknown' };

export function resolveSelection(
  activity: AdministrativeActivity,
  query: ActivityQuery,
): ActivitySelection {
  if (query.organization !== null) {
    const organization = activity.organizations.find((o) => o.id === query.organization);
    if (!organization || (query.platform !== null && organization.platformId !== query.platform))
      return { status: 'unknown' };
    return { status: 'organization', platformId: organization.platformId, organization };
  }
  if (query.platform !== null)
    return activity.platforms.some((p) => p.id === query.platform)
      ? { status: 'platform', platformId: query.platform }
      : { status: 'unknown' };
  return { status: 'all' };
}

/**
 * Pure: the Platform and Organization events the selection keeps. An Organization keeps only events that name it
 * (never its Platform's own events); a Platform keeps its Organization and Platform events. Company events are never
 * here: they are their own section.
 */
export function scopedEntries(
  entries: readonly ActivityEntry[],
  selection: ActivitySelection,
  action: ActivityAction | null,
): readonly ActivityEntry[] {
  if (selection.status === 'unknown') return [];
  return entries.filter(
    (e) =>
      e.scope !== 'company' &&
      (action === null || e.action === action) &&
      (selection.status === 'all' ||
        (selection.status === 'platform' && e.platformId === selection.platformId) ||
        (selection.status === 'organization' && e.organizationId === selection.organization.id)),
  );
}

/**
 * View state of the owner's simulated administrative activity (`/audit`; P8-S1). The Company owner only: for anyone
 * else the facade calls no gateway and reports `forbidden` (UX; the route guard sends an operator away first, and the
 * mock refuses them too). Audit authority comes from owning the Company, never from a Platform assignment or an
 * Organization-admin membership. Filters are the URL's; filtering and "Show more" request nothing. Read only.
 */
@Injectable()
export class ActivityFacade {
  private readonly gateway = inject(ActivityGateway);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.audit.view') ? actor.companyId : null;
  });

  private readonly state = toSignal(
    combineLatest([
      toObservable(this.companyId),
      toObservable(this.context.revision),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<AdministrativeActivity>>({ status: 'forbidden' })
          : toViewState(this.gateway.activity(id), (a) => a.entries.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<AdministrativeActivity> },
  );

  readonly view = computed<ActivityView>(() => {
    const state = this.state();
    switch (state.status) {
      case 'success':
        return { status: 'ready', activity: state.data };
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

  readonly query = computed(() =>
    parseActivityQuery(this.router.parseUrl(this.context.url()).queryParams),
  );

  readonly selection = computed<ActivitySelection>(() => {
    const view = this.view();
    return view.status === 'ready'
      ? resolveSelection(view.activity, this.query())
      : { status: 'all' };
  });

  /** The Platform and Organization events the filters keep, newest first. */
  readonly entries = computed(() => {
    const view = this.view();
    return view.status === 'ready'
      ? scopedEntries(view.activity.entries, this.selection(), this.query().action)
      : [];
  });

  /** Company events: shown only when no Platform or Organization is selected (they belong to neither). */
  readonly companyEntries = computed(() => {
    const view = this.view();
    if (view.status !== 'ready' || this.selection().status !== 'all') return [];
    const action = this.query().action;
    return view.activity.entries.filter(
      (e) => e.scope === 'company' && (action === null || e.action === action),
    );
  });

  /** How many of the scoped events are shown (local paging). */
  readonly shown = signal(ACTIVITY_PAGE_SIZE);

  setQuery(change: Partial<ActivityQuery>): void {
    const merged = { ...this.query(), ...change };
    // An Organization belongs to one Platform: changing the Platform alone clears it.
    const next: ActivityQuery =
      change.platform !== undefined && change.organization === undefined
        ? { ...merged, organization: null }
        : merged;
    const queryParams: Params = {};
    if (next.platform !== null) queryParams['platform'] = next.platform;
    if (next.organization !== null) queryParams['organization'] = next.organization;
    if (next.action !== null) queryParams['action'] = next.action;
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = queryParams;
    this.shown.set(ACTIVITY_PAGE_SIZE);
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  showMore(): void {
    this.shown.update((n) => n + ACTIVITY_PAGE_SIZE);
  }

  reload(): void {
    this.reloads.next();
  }
}
