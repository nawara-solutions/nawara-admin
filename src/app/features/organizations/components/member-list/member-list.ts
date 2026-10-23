import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { MembershipDecision } from '../../domain/membership-decision.model';
import {
  ListableMembershipStatus,
  Membership,
  decidedAt,
  memberIdentity,
} from '../../domain/membership.model';

/** Catalog keys, listed in full (never built at runtime). */
const DECIDED_KEYS = {
  active: 'organizations.members.table.activeSince',
  rejected: 'organizations.members.table.rejected',
  pending: null,
} as const satisfies Record<ListableMembershipStatus, string | null>;

/** A decision asked for on one row. */
export interface DecisionRequest {
  readonly membership: Membership;
  readonly decision: MembershipDecision;
}

/**
 * The memberships of one tab (P5-S1 design, artboards 1, 5, 6): a table on a wide card, cards below 40rem. Each row
 * links to its membership. The identity is the email, else the phone, else a short neutral reference (never a name),
 * written left to right and isolated; the organization-admin privilege is said in words.
 *
 * Rows the actor may decide (P5-S2, `offers`) get "Approve" and "Reject", named with the member they are about. While
 * a decision is sent (`sendingId`), that row says so and every other decision control waits (`aria-disabled`, with
 * the reason). The list only asks (`decide`): the page confirms and sends.
 */
@Component({
  selector: 'adm-member-list',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, NwButton, NwDatePipe, NwIcon, NwSpinner],
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
  /** Whether the actor may be offered a decision on a row (P5-S2); none by default. */
  readonly offers = input<(membership: Membership) => boolean>(() => false);
  /** The membership whose decision is being sent, if any. */
  readonly sendingId = input<string | null>(null);
  /** Whether any decision is being sent (every decision control waits). */
  readonly sending = input(false);
  readonly decide = output<DecisionRequest>();

  protected readonly decisions = computed(() => this.rows().some((row) => this.offers()(row)));

  protected readonly identity = memberIdentity;
  protected readonly decidedAt = decidedAt;
  protected readonly decidedKeys = DECIDED_KEYS;

  protected ask(membership: Membership, decision: MembershipDecision): void {
    if (this.sending()) return;
    this.decide.emit({ membership, decision });
  }
}
