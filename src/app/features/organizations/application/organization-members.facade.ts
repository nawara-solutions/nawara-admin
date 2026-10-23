import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, forkJoin, map } from 'rxjs';
import { ScopeContext } from '../../../core/context/scope-context';
import { OrganizationId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { MembershipGateway } from '../data-access/membership.gateway';
import {
  LISTABLE_STATUSES,
  ListableMembershipStatus,
  Membership,
  MembershipLists,
  MembersQuery,
  applyMembersQuery,
  parseMembersQuery,
  toMembersQueryParams,
} from '../domain/membership.model';
import { OrganizationDetail } from '../domain/organization.model';
import { keyedLoad } from './keyed-load';
import { OrganizationDetailFacade, OrganizationDetailView } from './organization-detail.facade';

/** The Organization page states (access, loading, not found…), then the members' own. */
export type OrganizationMembersView =
  | Exclude<OrganizationDetailView, { readonly status: 'ready' }>
  | {
      readonly status: 'membersLoading';
      readonly platform: PlatformRef;
      readonly organization: OrganizationDetail;
    }
  | {
      readonly status: 'membersNotInBuild';
      readonly platform: PlatformRef;
      readonly organization: OrganizationDetail;
    }
  | {
      readonly status: 'membersError';
      readonly platform: PlatformRef;
      readonly organization: OrganizationDetail;
    }
  | {
      readonly status: 'ready';
      readonly platform: PlatformRef;
      readonly organization: OrganizationDetail;
      readonly lists: MembershipLists;
      /** Increases with every answer of the lists (a refresh included): "is this newer than what I saw?". */
      readonly loadSequence: number;
    };

/** Where one membership is in the loaded lists (`null`: in none), as of answer number `loadSequence`. */
export interface MembershipWhereabouts {
  readonly status: ListableMembershipStatus | null;
  /** Its organization-admin role as listed (`null`: in no list). */
  readonly isOrganizationAdmin: boolean | null;
  readonly loadSequence: number;
}

/** One membership of the detail route, resolved from the loaded lists (there is no single-membership read). */
export type MembershipResolution =
  | { readonly status: 'pending' }
  | { readonly status: 'notFound' }
  | { readonly status: 'found'; readonly membership: Membership };

/**
 * View state of an Organization's members (P5-S1; `/platforms/:platformId/organizations/:organizationId/members[/…]`),
 * shared by the list and the detail route (provided on their parent route), read only.
 *
 * - The Organization is the detail page's: its Platform is checked first and it must belong to the Platform in the URL
 *   (`OrganizationDetailFacade`); nothing about members is requested before.
 * - Core lists one status per request, so the three listable statuses are loaded together, exactly as Core offers
 *   them (`?status=active|pending|rejected`, no other parameter); each tab then has its count.
 * - Filtering, search and sort happen here, in the browser, over the loaded rows. The tab, the admins filter and the
 *   sort are URL query parameters; the search text is not (it may hold a contact).
 * - A membership's details come from these lists: an id found in none of them is "not found", whatever the reason.
 */
@Injectable()
export class OrganizationMembersFacade {
  private readonly detail = inject(OrganizationDetailFacade);
  private readonly context = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly gateway = inject(MembershipGateway);
  private readonly locale = inject(NW_FORMATTING_LOCALE);
  private readonly reloads = new Subject<void>();
  private loads = 0;

  private readonly organizationId = computed<OrganizationId | null>(() => {
    const view = this.detail.view();
    return view.status === 'ready' ? view.detail.id : null;
  });

  private readonly raw = keyedLoad(this.organizationId, this.reloads, (id) =>
    forkJoin(
      Object.fromEntries(LISTABLE_STATUSES.map((s) => [s, this.gateway.list(id, s)])) as Record<
        ListableMembershipStatus,
        ReturnType<MembershipGateway['list']>
      >,
    ).pipe(
      map((lists) => ({
        organizationId: id,
        loadSequence: ++this.loads,
        lists: {
          active: lists.active.memberships,
          pending: lists.pending.memberships,
          rejected: lists.rejected.memberships,
        } satisfies MembershipLists,
      })),
    ),
  );

  readonly view = computed<OrganizationMembersView>(() => {
    const view = this.detail.view();
    if (view.status !== 'ready') return view;
    const base = { platform: view.platform, organization: view.detail };
    const state = this.raw();
    switch (state.status) {
      case 'success':
        // A late answer about another Organization (a switch in flight) reads as loading.
        return state.data.organizationId === view.detail.id
          ? {
              status: 'ready',
              ...base,
              lists: state.data.lists,
              loadSequence: state.data.loadSequence,
            }
          : { status: 'membersLoading', ...base };
      case 'error':
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'membersNotInBuild', ...base }
          : { status: 'membersError', ...base };
      case 'forbidden':
        return { status: 'membersError', ...base };
      default:
        return { status: 'membersLoading', ...base };
    }
  });

  /** The tab, the admins filter and the sort, from the URL. */
  readonly query = computed<MembersQuery>(() =>
    parseMembersQuery(this.router.parseUrl(this.context.url()).queryParams),
  );

  /** The search text: page state only, never in the URL, storage or logs (it may hold a contact). */
  readonly search = signal('');

  readonly counts = computed<Readonly<Record<ListableMembershipStatus, number>> | null>(() => {
    const view = this.view();
    return view.status === 'ready'
      ? {
          active: view.lists.active.length,
          pending: view.lists.pending.length,
          rejected: view.lists.rejected.length,
        }
      : null;
  });

  /** The rows of the current tab, filtered, searched and sorted. */
  readonly rows = computed<readonly Membership[]>(() => {
    const view = this.view();
    if (view.status !== 'ready') return [];
    const query = this.query();
    return applyMembersQuery(
      view.lists[query.status],
      query,
      this.search(),
      new Intl.Collator(this.locale(), { sensitivity: 'base' }),
    );
  });

  /** The membership of the detail route, if it is in one of this Organization's lists. */
  readonly membership = computed<MembershipResolution>(() => {
    const page = this.context.platformPage();
    const view = this.view();
    if (page.kind !== 'membership' || view.status !== 'ready') return { status: 'pending' };
    for (const status of LISTABLE_STATUSES) {
      const found = view.lists[status].find((m) => m.id === page.membershipId);
      if (found) return { status: 'found', membership: found };
    }
    return { status: 'notFound' };
  });

  /** Where a membership is now, for a decision whose outcome must be checked (P5-S2); `null` while not loaded. */
  whereabouts(membershipId: string): MembershipWhereabouts | null {
    const view = this.view();
    if (view.status !== 'ready') return null;
    for (const status of LISTABLE_STATUSES) {
      const found = view.lists[status].find((m) => m.id === membershipId);
      if (found)
        return {
          status,
          isOrganizationAdmin: found.isOrganizationAdmin,
          loadSequence: view.loadSequence,
        };
    }
    return { status: null, isOrganizationAdmin: null, loadSequence: view.loadSequence };
  }

  /** How many organization admins the loaded Active list shows (`null` while not loaded): the last-admin warning. */
  readonly adminCount = computed<number | null>(() => {
    const view = this.view();
    return view.status === 'ready'
      ? view.lists.active.filter((m) => m.isOrganizationAdmin).length
      : null;
  });

  /** Changes the tab, the admins filter or the sort: a URL change (replacing the history entry). */
  setQuery(change: Partial<MembersQuery>): void {
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = toMembersQueryParams({ ...this.query(), ...change });
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  /** "Try again": the Organization if it failed, otherwise the members. */
  reload(): void {
    if (this.detail.view().status === 'ready') this.reloads.next();
    else this.detail.reload();
  }
}
