import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import {
  ListableMembershipStatus,
  Membership,
  decidedAt,
  memberIdentity,
} from '../../domain/membership.model';

/** Catalog keys, listed in full (never built at runtime). */
const DECIDED_KEYS = {
  active: 'organizations.members.table.approved',
  rejected: 'organizations.members.table.rejected',
  pending: null,
} as const satisfies Record<ListableMembershipStatus, string | null>;

/**
 * The memberships of one tab (P5-S1 design, artboards 1, 5, 6): a table on a wide card, cards below 40rem. Each row
 * links to its membership. The identity is the email, else the phone, else a short neutral reference (never a name),
 * written left to right and isolated; the organization-admin privilege is said in words.
 */
@Component({
  selector: 'adm-member-list',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, NwDatePipe, NwIcon],
  templateUrl: './member-list.html',
  styleUrl: './member-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'member-list' },
})
export class MemberList {
  readonly rows = input.required<readonly Membership[]>();
  readonly status = input.required<ListableMembershipStatus>();
  readonly listId = input.required<string>();
  /** The detail link of a membership. */
  readonly pathOf = input.required<(membership: Membership) => string>();

  protected readonly identity = memberIdentity;
  protected readonly decidedAt = decidedAt;
  protected readonly decidedKeys = DECIDED_KEYS;
}
