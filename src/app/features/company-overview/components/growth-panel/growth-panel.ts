import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId, PlatformRef } from '../../../../core/context/scope.model';
import { NwDatePipe, NwNumberPipe } from '../../../../shared/format/format.pipes';
import { GrowthSeries } from '../../domain/company-overview.model';
import { GrowthChart } from '../growth-chart/growth-chart';

/**
 * Organization growth (owner design): a filter between the total and each Platform, the latest figure with its change
 * since the first day, and the chart. The filter only re-reads the loaded series; it requests nothing.
 */
@Component({
  selector: 'adm-growth-panel',
  imports: [TranslocoPipe, NwDatePipe, NwNumberPipe, GrowthChart],
  templateUrl: './growth-panel.html',
  styleUrl: './growth-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'growth-panel' },
})
export class GrowthPanel {
  readonly growth = input.required<GrowthSeries>();
  /** The Company's Platforms, for the filter labels (user data). */
  readonly platforms = input.required<readonly PlatformRef[]>();

  /** `null` is the total across all Platforms. */
  protected readonly selected = signal<PlatformId | null>(null);

  protected readonly filters = computed(() =>
    this.growth().platforms.flatMap((series) => {
      const platform = this.platforms().find((p) => p.id === series.platformId);
      return platform ? [{ id: platform.id, name: platform.name }] : [];
    }),
  );

  protected readonly points = computed(() => {
    const id = this.selected();
    const growth = this.growth();
    return id === null
      ? growth.points
      : (growth.platforms.find((s) => s.platformId === id)?.points ?? growth.points);
  });

  protected readonly first = computed(() => this.points()[0] ?? null);
  protected readonly latest = computed(() => this.points().at(-1) ?? null);

  /** Change since the first day, in percent; `null` when it cannot be computed (no start, or a start at zero). */
  protected readonly change = computed(() => {
    const first = this.first();
    const latest = this.latest();
    if (!first || !latest || first.organizations === 0) return null;
    return Math.round(((latest.organizations - first.organizations) / first.organizations) * 100);
  });
}
