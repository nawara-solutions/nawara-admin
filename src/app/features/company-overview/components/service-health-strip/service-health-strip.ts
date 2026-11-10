import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_SERVICE_NAME_KEYS } from '../../../../core/core-services/core-service-labels';
import { CoreService, ServiceInventory } from '../../../../core/core-services/core-service.model';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';

/**
 * Documented Core services with illustrative health only when demo mode is explicitly enabled.
 * The inventory remains unchanged: non-demo views show health as unavailable because no authorized
 * aggregated health read exists (CF-06). Mock statuses never enter the Core service model.
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
  readonly demo = input(false);
  readonly inventory = input.required<ServiceInventory>();
  protected readonly mockHealth = {
    auth: 'operational',
    organization: 'operational',
    release: 'operational',
    billing: 'operational',
    payment: 'operational',
    file: 'operational',
    notification: 'degraded',
    audit: 'operational',
  } as const satisfies Record<CoreService, 'operational' | 'degraded'>;
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
