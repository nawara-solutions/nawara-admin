import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NwIcon } from '../icon/icon';
import { NwIconName } from '../icon/icon.registry';

/**
 * Icon-only button. `label` is required and becomes the accessible name and tooltip (docs/ARCHITECTURE.md §26).
 * Critical actions use `nw-button` with a visible label instead.
 */
@Component({
  selector: 'button[nw-icon-button]',
  imports: [NwIcon],
  template: '<nw-icon [name]="icon()" />',
  styleUrl: './icon-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-icon-button',
    '[attr.aria-label]': 'label()',
    '[attr.title]': 'label()',
  },
})
export class NwIconButton {
  readonly icon = input.required<NwIconName>();
  readonly label = input.required<string>();
}
