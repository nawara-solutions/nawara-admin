import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_SERVICE_NAME_KEYS } from '../../../../core/core-services/core-service-labels';
import { CoreService, ServiceInventory } from '../../../../core/core-services/core-service.model';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';

/**
 * The documented Core services, with live health shown as unavailable, as on `/services`: no authorized aggregated
 * health read exists (CF-06), so no service is ever shown as operational or degraded, in demo builds included
 * (A42-01 / X01, WP-1.3).
 */
@Component({
  selector: 'adm-service-health-strip',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './service-health-strip.html',
  styleUrl: './service-health-strip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'service-health-strip' },
})
export class ServiceHealthStrip {
  readonly inventory = input.required<ServiceInventory>();
  protected readonly nameKeys = CORE_SERVICE_NAME_KEYS;
  protected readonly icons = {
    auth: 'shield-check',
    organization: 'building-2',
    release: 'package',
    billing: 'file-text',
    payment: 'credit-card',
    file: 'folder',
    notification: 'bell',
    audit: 'scroll-text',
  } as const satisfies Record<CoreService, NwIconName>;
}
