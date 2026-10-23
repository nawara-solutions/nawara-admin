import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwNumberPipe } from '../../format/format.pipes';
import { Metric } from '../metric';

/** A count, or an explicit "not available": an unavailable value is never shown as zero. */
@Component({
  selector: 'adm-metric-value',
  imports: [TranslocoPipe, NwNumberPipe],
  template: `
    @let value = metric();
    @if (value.status === 'available') {
      {{ value.value | nwNumber }}
    } @else {
      <span class="metric-value__missing" aria-hidden="true">—</span>
      <span class="nw-visually-hidden">{{ 'common.notAvailable' | transloco }}</span>
    }
  `,
  styles: `
    :host {
      font-variant-numeric: tabular-nums;
    }

    .metric-value__missing {
      color: var(--nw-text-secondary);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'metric-value' },
})
export class MetricValue {
  readonly metric = input.required<Metric>();
}
