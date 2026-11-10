import { CdkMenuItemRadio } from '@angular/cdk/menu';
import { NwMenu, NwMenuTrigger } from '../../../../shared/ui/menu/menu';
import { OVERVIEW_PERIODS, OverviewPeriod } from '../../domain/company-overview.model';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/** Overview title, demo disclosure and reporting period. */
@Component({
  selector: 'adm-overview-header',
  imports: [TranslocoPipe, NwIcon, NwMenu, NwMenuTrigger, CdkMenuItemRadio],
  templateUrl: './overview-header.html',
  styleUrl: './overview-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'overview-header', '(keydown.escape)': 'demoInfoOpen.set(false)' },
})
export class OverviewHeader {
  readonly isDemo = input(false);
  /** The reporting period, once the overview has loaded. */
  readonly periodDays = input<OverviewPeriod>(30);
  readonly periodChange = output<OverviewPeriod>();
  protected readonly periods = OVERVIEW_PERIODS;

  /** The "Demo data" disclosure (button + panel, `aria-expanded`). */
  protected readonly demoInfoOpen = signal(false);
}
