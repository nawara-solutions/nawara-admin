import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { platformPath } from '../../../../core/context/scope-context';
import { PlatformProduct } from '../../../../core/context/scope.model';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { PlatformSummary } from '../../domain/company-overview.model';
import { MetricValue } from '../metric-value/metric-value';

const PRODUCT_KEYS = {
  school: 'companyOverview.platforms.product.school',
  drive: 'companyOverview.platforms.product.drive',
} as const satisfies Record<PlatformProduct, string>;

/**
 * "Your platforms": each Platform with its organization, membership and operator counts and an "Open platform" link
 * into the platform scope. Membership counts are per Platform and are never summed into identities.
 */
@Component({
  selector: 'adm-platform-list',
  imports: [RouterLink, TranslocoPipe, NwIcon, MetricValue],
  templateUrl: './platform-list.html',
  styleUrl: './platform-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-list' },
})
export class PlatformList {
  readonly platforms = input.required<readonly PlatformSummary[]>();

  protected readonly path = platformPath;
  protected readonly productKey = (product: PlatformProduct | null): string =>
    product ? PRODUCT_KEYS[product] : 'companyOverview.platforms.product.unknown';
}
