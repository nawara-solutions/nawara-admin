import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { organizationPath } from '../../../../core/context/scope-context';
import { MetricValue } from '../../../../shared/dashboard/metric-value/metric-value';
import { NW_CLOCK } from '../../../../shared/format/clock';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwStatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { DirectoryRow } from '../../application/organization-query';
import { SUBSCRIPTION_BADGES, policyKeys, subscriptionNote } from '../commercial-display';

/**
 * The Organization directory's rows (feature-local; a generic table waits for a second consumer, P4/P5): a table when
 * its card is wide enough, a list of link cards below that (the card's own width decides, container query). Each
 * Organization's name links to its detail. The subscription and assisted-payments columns are the owner's only:
 * without `commercial` they are not rendered at all.
 */
@Component({
  selector: 'adm-organization-table',
  imports: [RouterLink, TranslocoPipe, MetricValue, NwDatePipe, NwStatusBadge],
  templateUrl: './organization-table.html',
  styleUrl: './organization-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-table' },
})
export class OrganizationTable {
  private readonly now = inject(NW_CLOCK);

  readonly rows = input.required<readonly DirectoryRow[]>();
  /** Owner only: show the commercial columns (a row whose facts are missing shows "—"). */
  readonly commercial = input(false);
  /** The id of the list, for the toolbar's `aria-controls`. */
  readonly listId = input.required<string>();

  protected readonly badges = SUBSCRIPTION_BADGES;
  protected readonly policyKeys = policyKeys;

  protected pathOf(row: DirectoryRow): string {
    return organizationPath(row.organization.platformId, row.organization.id);
  }

  protected noteOf(row: DirectoryRow) {
    return row.commercial ? subscriptionNote(row.commercial.subscription, this.now()) : null;
  }
}
