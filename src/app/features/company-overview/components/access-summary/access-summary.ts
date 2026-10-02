import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { AccessSummary } from '../../domain/company-overview.model';
import { CardLink } from '../card-link/card-link';
import { MetricValue } from '../metric-value/metric-value';

/**
 * Access & security: the owner's own account, and platform operator access. Operator access shows active ASSIGNMENTS
 * and UNIQUE operators separately (one operator on two platforms is two assignments, one operator). No score or rating
 * is computed. The destinations are not built yet, so their links are disabled.
 *
 * "2FA enabled" is not a fetched status: Core requires a second factor (TOTP or passkey) for every owner sign-in
 * (auth-service owner login, docs/CORE-INTEGRATION.md §4), so it holds for any signed-in owner.
 */
@Component({
  selector: 'adm-access-summary',
  imports: [TranslocoPipe, NwIcon, CardLink, MetricValue],
  templateUrl: './access-summary.html',
  styleUrl: './access-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'access-summary' },
})
export class AccessSummaryList {
  /** `null` when operator access figures are unavailable; the owner tile needs no data. */
  readonly access = input.required<AccessSummary | null>();
  /** The signed-in owner's name (user data). */
  readonly ownerName = input<string | null>(null);
  /** Access assignments waiting for review; `null` or 0 shows no status line. */
  readonly toReview = input<number | null>(null);
}
