import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { platformPath } from '../../../../core/context/scope-context';
import { NwNumberPipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { DirectoryMetric, PlatformDirectoryEntry } from '../../domain/platform-directory.model';

const PRODUCT_KEYS = {
  school: 'platforms.product.school',
  drive: 'platforms.product.drive',
  unknown: 'platforms.product.unknown',
} as const;

/**
 * One Platform of the directory (owner design): identity, three figures (organizations, memberships, operator
 * assignments) and "Open platform" into the platform scope. An unavailable figure shows "—" and says so.
 */
@Component({
  selector: 'adm-platform-card',
  imports: [RouterLink, TranslocoPipe, NwNumberPipe, NwIcon],
  templateUrl: './platform-card.html',
  styleUrl: './platform-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'platform-card',
    '[class.platform-card--drive]': "entry().platform.product === 'drive'",
  },
})
export class PlatformCard {
  readonly entry = input.required<PlatformDirectoryEntry>();

  protected readonly path = computed(() => platformPath(this.entry().platform.id));
  protected readonly productKey = computed(
    () => PRODUCT_KEYS[this.entry().platform.product ?? 'unknown'],
  );
  protected readonly stats = computed(() => {
    const e = this.entry();
    return [
      { labelKey: 'platforms.organizations', metric: e.organizations },
      { labelKey: 'platforms.memberships', metric: e.memberships },
      { labelKey: 'platforms.assignments', metric: e.operatorAssignments },
    ] satisfies { labelKey: string; metric: DirectoryMetric }[];
  });
}
