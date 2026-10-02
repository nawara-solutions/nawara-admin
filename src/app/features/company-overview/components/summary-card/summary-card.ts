import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NwNumberPipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { Metric } from '../../domain/company-overview.model';
import { MetricValue } from '../metric-value/metric-value';

export type SummaryAccent = 'pink' | 'orange' | 'purple';

/** One summary figure of the owner design: label and icon tile, value with an optional trend, and a neutral caption. */
@Component({
  selector: 'adm-summary-card',
  imports: [NwNumberPipe, NwIcon, MetricValue],
  templateUrl: './summary-card.html',
  styleUrl: './summary-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'summary-card',
    '[class.summary-card--orange]': "accent() === 'orange'",
    '[class.summary-card--purple]': "accent() === 'purple'",
  },
})
export class SummaryCard {
  readonly label = input.required<string>();
  readonly icon = input.required<NwIconName>();
  readonly accent = input<SummaryAccent>('pink');
  readonly metric = input.required<Metric>();
  /** A neutral qualification under the value ("Distinct accounts", "Awaiting acceptance"); already translated. */
  readonly caption = input<string>();
  /** Change over the period, shown beside the value; `null` (or 0) shows none. */
  readonly trend = input<number | null>(null);
}
