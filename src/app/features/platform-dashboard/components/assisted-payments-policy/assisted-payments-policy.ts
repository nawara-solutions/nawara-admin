import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AssistanceEligibility } from '../../domain/platform-commercial.model';

/**
 * Assisted payments on a Platform, as Admin can state them (WP-2.2): eligibility not verified. Not a setting, so there is
 * no switch: Core decides each assistance request from its own facts. (Since PR #89 the dashboard page does not render
 * this card; it stays so the read model has one faithful presentation.)
 */
@Component({
  selector: 'adm-assisted-payments-policy',
  imports: [TranslocoPipe],
  templateUrl: './assisted-payments-policy.html',
  styleUrl: './assisted-payments-policy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assisted-payments-policy' },
})
export class AssistedPaymentsPolicyCard {
  readonly policy = input.required<AssistanceEligibility>();
}
