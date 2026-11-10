import { NwBrandMark } from '../brand-mark/brand-mark';
import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/** Original accent-aware Admin artwork adapter for the sign-in and workspace shell. */
@Component({
  selector: 'nw-admin-brand-lockup',
  imports: [NwBrandMark],
  templateUrl: './admin-brand-lockup.html',
  styleUrl: './admin-brand-lockup.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-admin-brand-lockup',
    role: 'img',
    '[attr.aria-label]': 'label()',
  },
})
export class AdminBrandLockup {
  /** Accessible name of the complete decorative wordmark. */
  readonly label = input.required<string>();
  readonly compact = input(false, { transform: booleanAttribute });
  readonly typeset = input(false, { transform: booleanAttribute });
  readonly symbolFirst = input(false, { transform: booleanAttribute });
}
