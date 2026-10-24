import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CORE_SERVICE_NAME_KEYS } from '../../../../core/core-services/core-service-labels';
import { ServiceInventory } from '../../../../core/core-services/core-service.model';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * Services & health on the Company Overview: the documented Core services, from the same inventory as `/services`
 * (P8-S2), and one plain statement that live health is unavailable (CF-06). No status, colour or count is shown for a
 * service: nothing is observed.
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
}
