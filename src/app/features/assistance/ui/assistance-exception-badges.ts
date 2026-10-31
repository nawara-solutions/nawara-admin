import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { AssistanceException } from '../domain/assistance-exceptions';

/** Catalog keys, listed in full (never built at runtime). */
export const EXCEPTION_KEYS = {
  collectionReportedNotSettled: 'assistanceCases.exception.collectionReportedNotSettled',
  uncertainSettlement: 'assistanceCases.exception.uncertainSettlement',
  overdueSettlement: 'assistanceCases.exception.overdueSettlement',
  openDispute: 'assistanceCases.exception.openDispute',
  cashReturn: 'assistanceCases.exception.cashReturn',
  lateSettlementReview: 'assistanceCases.exception.lateSettlementReview',
  recoveryRestriction: 'assistanceCases.exception.recoveryRestriction',
} as const satisfies Record<AssistanceException, string>;

/** Each badge has its tone's icon and its own words, so colour never carries the meaning alone (§25). */
const EXCEPTION_TONES = {
  collectionReportedNotSettled: 'info',
  uncertainSettlement: 'warning',
  overdueSettlement: 'warning',
  openDispute: 'danger',
  cashReturn: 'warning',
  lateSettlementReview: 'warning',
  recoveryRestriction: 'danger',
} as const satisfies Record<AssistanceException, NwStatusTone>;

/**
 * A case's exceptions (Assistance A7) as a list of badges, or "None". Presentation only: the exceptions come from
 * `assistanceExceptions` over Core's values.
 */
@Component({
  selector: 'adm-assistance-exception-badges',
  imports: [TranslocoPipe, NwStatusBadge],
  template: `
    @if (exceptions().length > 0) {
      <ul class="assistance-exceptions__list" role="list" data-exceptions>
        @for (exception of exceptions(); track exception) {
          <li [attr.data-exception]="exception">
            <nw-status-badge [tone]="tones[exception]">{{
              keys[exception] | transloco
            }}</nw-status-badge>
          </li>
        }
      </ul>
    } @else {
      <span class="assistance-exceptions__none" data-exceptions-none>{{
        'assistanceCases.exception.none' | transloco
      }}</span>
    }
  `,
  styleUrl: './assistance-exception-badges.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-exceptions' },
})
export class AssistanceExceptionBadges {
  readonly exceptions = input.required<readonly AssistanceException[]>();
  protected readonly keys = EXCEPTION_KEYS;
  protected readonly tones = EXCEPTION_TONES;
}
