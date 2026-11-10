import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwButton } from '../../../../shared/ui/button/button';

/**
 * The Platforms page header card (owner design): title and actions. Create platform is shown to the owner: a working action when this build can send it
 * (`createAvailable`), otherwise focusable but unavailable (`aria-disabled`), with its reason as a tooltip on hover and
 * keyboard focus.
 */
@Component({
  selector: 'header[adm-platforms-header]',
  imports: [TranslocoPipe, NwIcon, NwButton],
  templateUrl: './platforms-header.html',
  styleUrl: './platforms-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platforms-header' },
})
export class PlatformsHeader {
  readonly isDemo = input(false);
  /** Whether Create platform is shown at all (owner only). */
  readonly canCreate = input(false);
  /** Whether this build can create a Platform (a demo build: simulated). */
  readonly createAvailable = input(false);
  readonly create = output<void>();
}
