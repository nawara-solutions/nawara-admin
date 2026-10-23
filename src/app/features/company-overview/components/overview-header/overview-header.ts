import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * The page header card (owner design): title, subtitle and the actions. In a demo build one "Demo data" disclosure
 * labels the whole page. The period selector and Create platform are shown disabled: Core offers no period selection,
 * and platform creation needs the A4 step-up and the cutover.
 */
@Component({
  selector: 'adm-overview-header',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './overview-header.html',
  styleUrl: './overview-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'overview-header', '(keydown.escape)': 'demoInfoOpen.set(false)' },
})
export class OverviewHeader {
  readonly isDemo = input(false);
  /** Whether Create platform is shown at all (owner only). */
  readonly canCreate = input(false);
  /** Whether this build can create a Platform (a demo build: simulated). */
  readonly createAvailable = input(false);
  readonly create = output<void>();
  /** The reporting period, once the overview has loaded. */
  readonly periodDays = input<number | null>(null);

  /** The "Demo data" disclosure (button + panel, `aria-expanded`). */
  protected readonly demoInfoOpen = signal(false);
}
