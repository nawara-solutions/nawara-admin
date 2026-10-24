import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId } from '../../../../core/context/scope.model';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwStatusBadge, NwStatusTone } from '../../../../shared/ui/status-badge/status-badge';
import { operatorPath } from '../../application/operator-paths';
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
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe, NwDatePipe, NwStatusBadge],
  templateUrl: './operator-list.html',
  styleUrl: './operator-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-list' },
})
export class OperatorList {
  readonly rows = input.required<readonly OperatorSummary[]>();
  readonly listId = input.required<string>();
  /** A Platform's name, or `null` while it is unknown. */
  readonly platformName = input.required<(id: PlatformId) => string | null>();

  protected readonly path = operatorPath;
  protected readonly contact = contactText;
  protected readonly state = ACCOUNT_STATE_DISPLAY;
}
