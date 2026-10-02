import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A rotating ring for busy states (docs/ARCHITECTURE.md §20). Decorative: the busy label belongs to the control or to a
 * live region. Colour follows `currentColor`; under reduced motion the ring stops (base/_accessibility.scss).
 */
@Component({
  selector: 'nw-spinner',
  template: '',
  styleUrl: './spinner.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-spinner', 'aria-hidden': 'true', '[class.nw-spinner--lg]': "size() === 'lg'" },
})
export class NwSpinner {
  readonly size = input<'sm' | 'lg'>('sm');
}
