import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe, NwNumberPipe } from '../../../../shared/format/format.pipes';
import { GrowthPoint } from '../../domain/company-overview.model';

/** A gridline step giving at most about three intervals: 1, 2, 5 × 10ⁿ. */
function niceStep(max: number): number {
  const raw = Math.max(max / 3, 1);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= raw) ?? 10;
  return step * magnitude;
}

/**
 * Organization growth as an area chart, hand-built in SVG (no chart library, docs/ROADMAP.md "safe to postpone").
 *
 * - The plot is drawn in a 100 × 100 viewBox stretched to the container; lines keep their width
 *   (`vector-effect: non-scaling-stroke`), while points and their value labels are HTML so they stay round and readable
 *   at every width. The latest point is emphasised, its value in a dark marker (owner design).
 * - Time runs left to right in every language (the chart is `dir="ltr"`), like the design.
 * - Accessible: the figure is described by a caption and a visually hidden data table; the drawing is hidden from
 *   assistive technology.
 */
@Component({
  selector: 'adm-growth-chart',
  imports: [TranslocoPipe, NwDatePipe, NwNumberPipe],
  templateUrl: './growth-chart.html',
  styleUrl: './growth-chart.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'growth-chart' },
})
export class GrowthChart {
  readonly series = input.required<readonly GrowthPoint[]>();
  /** Accessible caption of the data table; already translated. */
  readonly caption = input.required<string>();

  private readonly step = computed(() =>
    niceStep(Math.max(...this.series().map((p) => p.organizations), 1)),
  );

  private readonly max = computed(() => {
    const top = Math.max(...this.series().map((p) => p.organizations), 1);
    return Math.ceil(top / this.step()) * this.step();
  });

  protected readonly ticks = computed(() => {
    const ticks: { value: number; y: number }[] = [];
    for (let value = 0; value <= this.max(); value += this.step()) {
      ticks.push({ value, y: (value / this.max()) * 100 });
    }
    return ticks;
  });

  /** Points in percent of the plot: x by position (weekly samples), y by value. */
  protected readonly points = computed(() => {
    const points = this.series();
    const last = Math.max(points.length - 1, 1);
    return points.map((point, index) => ({
      ...point,
      x: (index / last) * 100,
      y: (point.organizations / this.max()) * 100,
    }));
  });

  protected readonly line = computed(() =>
    this.points()
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${100 - p.y}`)
      .join(' '),
  );

  protected readonly area = computed(() => {
    const points = this.points();
    const first = points[0];
    const last = points.at(-1);
    return first && last ? `${this.line()} L${last.x} 100 L${first.x} 100 Z` : '';
  });
}
