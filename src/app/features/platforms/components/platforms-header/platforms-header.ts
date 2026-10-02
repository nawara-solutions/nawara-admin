import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * The Platforms page header card (owner design): title, subtitle and actions. In a demo build one "Demo data"
 * disclosure labels the page. Create platform is shown to the owner, focusable but unavailable (`aria-disabled`), with
 * its explanation as a tooltip on hover and keyboard focus.
 */
@Component({
  selector: 'header[adm-platforms-header]',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './platforms-header.html',
  styleUrl: './platforms-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platforms-header', '(keydown.escape)': 'demoInfoOpen.set(false)' },
})
export class PlatformsHeader {
  readonly isDemo = input(false);
  /** Whether Create platform is shown at all (owner only). */
  readonly canCreate = input(false);

  /** The "Demo data" disclosure (button + panel, `aria-expanded`). */
  protected readonly demoInfoOpen = signal(false);
}
