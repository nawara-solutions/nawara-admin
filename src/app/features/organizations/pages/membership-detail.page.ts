import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { membersPath } from '../../../core/context/scope-context';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { publishOrganizationLabel } from '../application/organization-label';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { OrganizationStates } from '../components/organization-states/organization-states';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';
import { ListableMembershipStatus, memberIdentity } from '../domain/membership.model';

/** Catalog keys and tones, listed in full (never built at runtime). */
const STATUS = {
  active: { tone: 'success', key: 'organizations.members.status.active' },
  pending: { tone: 'warning', key: 'organizations.members.detail.statusPending' },
  rejected: { tone: 'danger', key: 'organizations.members.status.rejected' },
} as const satisfies Record<
  ListableMembershipStatus,
  { readonly tone: NwStatusTone; readonly key: string }
>;

/**
 * One membership (`…/members/:membershipId`; P5-S1 design, artboard 3), read only. Resolved from the Organization's
 * membership lists (Core has no single-membership read); an id in none of them (unknown, another Organization's,
 * revoked) is one "not found". Shows only Core's fields: no name, no admission provenance, no other memberships.
 */
@Component({
  selector: 'adm-membership-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwStatusBadge,
    OrganizationStates,
    OrganizationsHeader,
  ],
  templateUrl: './membership-detail.page.html',
  styleUrl: './membership-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'membership-detail' },
})
export class MembershipDetailPage {
  protected readonly facade = inject(OrganizationMembersFacade);
  protected readonly status = STATUS;
  protected readonly membersPath = membersPath;
  protected readonly identity = memberIdentity;

  protected readonly resolution = this.facade.membership;

  constructor() {
    publishOrganizationLabel(
      computed(() => {
        const view = this.facade.view();
        return 'organization' in view ? view.organization.name : null;
      }),
    );
  }
}
