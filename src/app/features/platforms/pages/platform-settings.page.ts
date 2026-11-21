import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { platformPath } from '../../../core/context/scope-context';
import { PlatformProduct } from '../../../core/context/scope.model';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { AssistedPaymentsPolicyCard } from '../../platform-dashboard/components/assisted-payments-policy/assisted-payments-policy';
import { EditPlatformAction } from '../application/edit-platform.action';
import { PlatformSettingsFacade } from '../application/platform-settings.facade';

/** Catalog keys of the products, listed in full (never built at runtime). */
const PRODUCT_KEYS = {
  school: 'platforms.product.school',
  drive: 'platforms.product.drive',
} as const satisfies Record<PlatformProduct, string>;

/**
 * Platform settings (`/platforms/:platformId/settings`, M4; docs/design/p9-settings-architecture.md §6), the Company
 * owner only:
 * - Identity: the name (the one editable field, "Edit name"), the key and the product, both read only;
 * - Assisted payments: the read-only eligibility card, as on the dashboard ("Eligibility not verified"); no switch;
 * - one plain sentence about what is not configurable here. No other control exists.
 */
@Component({
  selector: 'adm-platform-settings-page',
  imports: [RouterLink, TranslocoPipe, NwButton, NwDataState, NwIcon, AssistedPaymentsPolicyCard],
  templateUrl: './platform-settings.page.html',
  styleUrl: './platform-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-settings' },
})
export class PlatformSettingsPage {
  protected readonly facade = inject(PlatformSettingsFacade);
  protected readonly edit = inject(EditPlatformAction);
  protected readonly productKeys = PRODUCT_KEYS;
  protected readonly dashboardPath = computed(() => {
    const access = this.facade.access();
    return access.status === 'granted' ? platformPath(access.platform.id) : '/platforms';
  });
}
