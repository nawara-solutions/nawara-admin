import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { membershipPath, organizationPath } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { isolated } from '../../platforms/domain/create-platform.model';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { MembershipRevokeAction } from '../application/membership-revoke.action';
import { OrganizationAdminRoleAction } from '../application/organization-admin-role.action';
import { publishOrganizationLabel } from '../application/organization-label';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { DecisionRequest, MemberList, RoleRequest } from '../components/member-list/member-list';
import { OrganizationStates } from '../components/organization-states/organization-states';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';
import {
  LISTABLE_STATUSES,
  ListableMembershipStatus,
  MEMBER_SORTS,
  MemberSort,
  Membership,
} from '../domain/membership.model';

/** Catalog keys, listed in full (never built at runtime). */
const STATUS_KEYS = {
  active: 'organizations.members.status.active',
  pending: 'organizations.members.status.pending',
  rejected: 'organizations.members.status.rejected',
} as const satisfies Record<ListableMembershipStatus, string>;

const EMPTY_KEYS = {
  active: 'organizations.members.empty.active',
  pending: 'organizations.members.empty.pending',
  rejected: 'organizations.members.empty.rejected',
} as const satisfies Record<ListableMembershipStatus, string>;

const SORT_KEYS = {
  newest: 'organizations.members.sort.newest',
  oldest: 'organizations.members.sort.oldest',
  identity: 'organizations.members.sort.identity',
} as const satisfies Record<MemberSort, string>;

/**
 * An Organization's members (`/platforms/:platformId/organizations/:organizationId/members`; P5-S1 design, artboards
 * 1, 5, 6), for the owner and an operator assigned to the Platform. Read only. Tabs for Core's listable statuses
 * (Active, Requests, Rejected) with their counts; search over the loaded tab (never in the URL); the admins filter on
 * the Active tab; a client-side sort. Breadcrumbs show the Organization's name, never a contact.
 *
 * Requests can be approved or rejected (P5-S2), and active memberships revoked (P5-S3a), by whoever may read them
 * here (Core decides): the row asks, the action confirms and sends. After a success the row leaves the tab and focus
 * moves to the same control of the next row, else to the count, else to the tab. Back from a revocation made on a
 * membership's details, focus starts on the count. The owner also changes the organization-admin role (P5-S3b) from
 * the row's "Actions" menu; the row stays, and focus returns to its "Actions" button once its badge has changed.
 */
@Component({
  selector: 'adm-organization-members-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MemberList,
    NwButton,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    OrganizationStates,
    OrganizationsHeader,
  ],
  templateUrl: './organization-members.page.html',
  styleUrl: './organization-members.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-members' },
})
export class OrganizationMembersPage {
  protected readonly facade = inject(OrganizationMembersFacade);
  protected readonly decisions = inject(MembershipDecisionAction);
  protected readonly revocations = inject(MembershipRevokeAction);
  protected readonly roles = inject(OrganizationAdminRoleAction);
  private readonly session = inject(AuthSession);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Where the row was, and which control it had, while its action (made on this page) is under way. */
  private decidedIndex: number | null = null;
  private decidedControl = '[data-decide="approve"]';
  /** The row whose role change (made on this page) is under way, and the role wanted. */
  private roleChange: { readonly membershipId: string; readonly admin: boolean } | null = null;
  protected readonly statuses = LISTABLE_STATUSES;
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly emptyKeys = EMPTY_KEYS;
  protected readonly sorts = MEMBER_SORTS;
  protected readonly sortKeys = SORT_KEYS;
  protected readonly organizationPath = organizationPath;
  protected readonly isolated = isolated;

  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  private readonly count = viewChild<ElementRef<HTMLElement>>('count');

  /** Who decides here, for the authority line (UX; Core checks every decision). */
  protected readonly authority = computed(() =>
    this.decisions.available ? (this.session.actor()?.kind ?? null) : null,
  );

  /** Who revokes here, for the Active tab's authority line (UX; Core checks every revocation). */
  protected readonly revokeAuthority = computed(() =>
    this.revocations.available ? (this.session.actor()?.kind ?? null) : null,
  );

  protected readonly offers = (membership: Membership) => this.decisions.offers(membership);
  protected readonly revokeOffers = (membership: Membership) => this.revocations.offers(membership);
  protected readonly roleOffers = (membership: Membership) => this.roles.offers(membership);

  protected readonly filtered = computed(
    () => this.facade.search().trim() !== '' || this.facade.query().admins,
  );

  protected readonly pathOf = computed(() => {
    const view = this.facade.view();
    return (membership: Membership) =>
      view.status === 'ready'
        ? membershipPath(view.platform.id, view.organization.id, membership.id)
        : '';
  });

  constructor() {
    publishOrganizationLabel(
      computed(() => {
        const view = this.facade.view();
        return 'organization' in view ? view.organization.name : null;
      }),
    );

    // Once an action made here succeeded and its row has left the list, focus the next row's same control.
    effect(() => {
      const done = this.decisions.succeeded() ?? this.revocations.succeeded();
      const rows = this.facade.rows();
      if (done === null || this.decidedIndex === null) return;
      if (rows.some((m) => m.id === done.membershipId)) return;
      const index = this.decidedIndex;
      this.decidedIndex = null;
      untracked(() => {
        this.decisions.succeeded.set(null);
        this.revocations.succeeded.set(null);
      });
      afterNextRender(() => this.focusAfterDecision(index), { injector: this.injector });
    });

    // Once a role change made here succeeded and the reloaded row shows it, focus that row's "Actions" button.
    effect(() => {
      const done = this.roles.succeeded();
      const change = this.roleChange;
      if (done === null || change === null || done.membershipId !== change.membershipId) return;
      const row = this.facade.rows().find((m) => m.id === change.membershipId);
      if (row !== undefined && row.isOrganizationAdmin !== change.admin) return;
      this.roleChange = null;
      untracked(() => this.roles.succeeded.set(null));
      afterNextRender(() => this.focusActionsOf(change.membershipId), { injector: this.injector });
    });

    // Back from a revocation made on a membership's details: focus the count once the list is shown.
    effect(() => {
      if (!this.revocations.returnedFromDetails()) return;
      const count = this.count();
      if (count === undefined) return;
      untracked(() => this.revocations.returnedFromDetails.set(false));
      afterNextRender(() => count.nativeElement.focus(), { injector: this.injector });
    });
  }

  protected revoke(
    membership: Membership,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.decidedIndex = this.facade.rows().findIndex((m) => m.id === membership.id);
    // The owner's rows carry an "Actions" menu (the role and Revoke); an operator's a direct "Revoke…".
    this.decidedControl =
      this.roles.offers(membership) !== null ? '[data-actions]' : '[data-revoke]';
    this.revocations.succeeded.set(null);
    this.revocations.open({ target: { platformId, organizationId, organizationName }, membership });
  }

  protected decide(
    request: DecisionRequest,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.decidedIndex = this.facade.rows().findIndex((m) => m.id === request.membership.id);
    this.decidedControl = '[data-decide="approve"]';
    this.decisions.succeeded.set(null);
    this.decisions.open({
      target: { platformId, organizationId, organizationName },
      membership: request.membership,
      decision: request.decision,
    });
  }

  protected changeRole(
    request: RoleRequest,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.roleChange = { membershipId: request.membership.id, admin: request.admin };
    this.roles.succeeded.set(null);
    this.roles.open({
      target: { platformId, organizationId, organizationName },
      membership: request.membership,
      admin: request.admin,
    });
  }

  private focusActionsOf(membershipId: string): void {
    this.shownList()
      ?.querySelector<HTMLElement>(`[data-actions][data-membership="${CSS.escape(membershipId)}"]`)
      ?.focus();
  }

  /** Table and cards are both rendered, one of them hidden by the container query: the displayed one. */
  private shownList(): HTMLElement | undefined {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>(
        '.member-list__table, .member-list__cards',
      ),
    ].find((list) => getComputedStyle(list).display !== 'none');
  }

  private focusAfterDecision(index: number): void {
    const shown = this.shownList();
    const controls = [...(shown?.querySelectorAll<HTMLElement>(this.decidedControl) ?? [])];
    const target =
      controls[Math.min(index, controls.length - 1)] ??
      this.count()?.nativeElement ??
      this.tabs().find((t) => t.nativeElement.getAttribute('aria-selected') === 'true')
        ?.nativeElement;
    target?.focus();
  }

  protected select(status: ListableMembershipStatus): void {
    this.facade.setQuery({ status, admins: status === 'active' && this.facade.query().admins });
  }

  /** Tabs (WAI-ARIA): arrows move along the reading direction, Home and End to the ends; selection follows focus. */
  protected onTabKey(event: KeyboardEvent, index: number): void {
    const rtl = this.document.documentElement.dir === 'rtl';
    const last = LISTABLE_STATUSES.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
            ? (index + 1) % (last + 1)
            : event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
              ? (index + last) % (last + 1)
              : null;
    if (next === null) return;
    event.preventDefault();
    this.select(LISTABLE_STATUSES[next]!);
    this.tabs()[next]?.nativeElement.focus();
  }

  protected onSearch(event: Event): void {
    this.facade.search.set((event.target as HTMLInputElement).value);
  }

  protected onAdmins(event: Event): void {
    this.facade.setQuery({ admins: (event.target as HTMLInputElement).checked });
  }

  protected onSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const sort = MEMBER_SORTS.find((s) => s === value);
    if (sort) this.facade.setQuery({ sort });
  }

  protected clear(): void {
    this.facade.search.set('');
    this.facade.setQuery({ admins: false });
  }
}
