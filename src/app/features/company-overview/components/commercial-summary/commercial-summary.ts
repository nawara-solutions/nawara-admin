import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { CommercialSummary } from '../../domain/commercial-summary.model';
import { MetricValue } from '../metric-value/metric-value';

/**
 * Commercial overview: three figures from the commercial summary (its own gateway; Core 🟡). The design's usage bar
 * under "Active licenses" is left out: no total exists to measure it against.
 */
@Component({
  selector: 'adm-commercial-summary',
  imports: [TranslocoPipe, MetricValue],
  templateUrl: './commercial-summary.html',
  styleUrl: './commercial-summary.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'commercial-summary' },
})
export class CommercialSummaryPanel {
  readonly summary = input.required<CommercialSummary>();
}
