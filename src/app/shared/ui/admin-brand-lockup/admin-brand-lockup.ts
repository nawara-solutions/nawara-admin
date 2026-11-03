import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Admin-specific Nawara | Admin concept lockup for the sign-in and workspace shell. */
@Component({
  selector: 'nw-admin-brand-lockup',
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
}
