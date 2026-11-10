import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId } from '../../../../core/context/scope.model';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwStatusBadge, NwStatusTone } from '../../../../shared/ui/status-badge/status-badge';
import { OperatorSort } from '../../application/operator-query';
import { OperatorAccountState, OperatorSummary, contactText } from '../../domain/operator.model';

/** Catalog keys and tones of the account states, listed in full (never built at runtime). */
export const ACCOUNT_STATE_DISPLAY = {
  canSignIn: { key: 'operators.state.canSignIn', tone: 'success' },
  awaitingConfirmation: { key: 'operators.state.awaitingConfirmation', tone: 'warning' },
  blocked: { key: 'operators.state.blocked', tone: 'danger' },
} as const satisfies Record<OperatorAccountState, { key: string; tone: NwStatusTone }>;

/**
 * The operators (P6 design, artboards Main and MobileEn): a table on a wide card, cards below 40rem. Each row links to
 * the operator's page by id (a contact never goes into a URL). The contact is written left to right and isolated; the
 * account state is said in words (demo data, CF-03); the Platforms are the ACTIVE assignments only.
 */
@Component({
  selector: 'adm-operator-list',
  imports: [NgTemplateOutlet, TranslocoPipe, NwDatePipe, NwStatusBadge, NwIcon],
  templateUrl: './operator-list.html',
  styleUrl: './operator-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-list' },
})
export class OperatorList {
  readonly sort = input<OperatorSort>('contact');
  readonly sortChange = output<OperatorSort>();
  protected readonly columns: readonly {
    key: string;
    first: OperatorSort;
    second: OperatorSort;
    ascending: OperatorSort;
  }[] = [
    {
      key: 'operators.list.operator',
      first: 'contact',
      second: 'contact-desc',
      ascending: 'contact',
    },
    {
      key: 'operators.list.platforms',
      first: 'platforms',
      second: 'platforms-asc',
      ascending: 'platforms-asc',
    },
    { key: 'operators.list.state', first: 'state', second: 'state-desc', ascending: 'state' },
    { key: 'operators.list.added', first: 'newest', second: 'oldest', ascending: 'oldest' },
  ];
  protected direction(column: (typeof this.columns)[number]): 'ascending' | 'descending' | 'none' {
    return this.sort() === column.ascending
      ? 'ascending'
      : this.sort() === column.first || this.sort() === column.second
        ? 'descending'
        : 'none';
  }
  readonly openOperator = output<OperatorSummary>();
  readonly grantAccess = output<OperatorSummary>();
  readonly changeAccount = output<OperatorSummary>();
  readonly canGrant = input(false);
  readonly canBlock = input(false);
  readonly actionBusy = input(false);
  readonly canGrantRow = input<(operator: OperatorSummary) => boolean>(() => false);
  readonly rows = input.required<readonly OperatorSummary[]>();
  readonly listId = input.required<string>();
  /** A Platform's name, or `null` while it is unknown. */
  readonly platformName = input.required<(id: PlatformId) => string | null>();

  protected readonly contact = contactText;
  protected readonly state = ACCOUNT_STATE_DISPLAY;
  protected initials(email: string): string {
    return (email.split('@')[0] ?? '')
      .split(/[._+-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}
