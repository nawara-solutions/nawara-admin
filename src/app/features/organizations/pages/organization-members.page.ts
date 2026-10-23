import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { membershipPath, organizationPath } from '../../../core/context/scope-context';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { publishOrganizationLabel } from '../application/organization-label';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { MemberList } from '../components/member-list/member-list';
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
  private readonly document = inject(DOCUMENT);
  protected readonly statuses = LISTABLE_STATUSES;
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly emptyKeys = EMPTY_KEYS;
  protected readonly sorts = MEMBER_SORTS;
  protected readonly sortKeys = SORT_KEYS;
  protected readonly organizationPath = organizationPath;

  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

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
