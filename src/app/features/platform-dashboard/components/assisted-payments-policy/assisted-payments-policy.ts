import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwStatusBadge } from '../../../../shared/ui/status-badge/status-badge';
import { AssistedPaymentsPolicy } from '../../domain/platform-commercial.model';

/**
 * The Platform's assisted-payments setting, read only (Core V2 architecture): Organizations inherit it or are set to
 * disabled, and none can enable it while the Platform disables it. Changing it needs authority and a Core route that do
 * not exist yet, so "Change policy" is shown unavailable and says so.
 */
@Component({
  selector: 'adm-assisted-payments-policy',
  imports: [TranslocoPipe, NwStatusBadge],
  templateUrl: './assisted-payments-policy.html',
  styleUrl: './assisted-payments-policy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assisted-payments-policy' },
})
export class AssistedPaymentsPolicyCard {
  readonly policy = input.required<AssistedPaymentsPolicy>();
}
