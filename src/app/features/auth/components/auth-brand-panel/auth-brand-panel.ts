import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';

/**
 * The brand panel of the sign-in pages (A4 design), on the inline-start side from `desktop` up and hidden below it:
 * the lockup artwork, the product line and an `aria-hidden` decoration (flora and gold orbit lines, mirrored in RTL,
 * hidden in forced colours).
 */
@Component({
  selector: 'adm-auth-brand-panel',
  imports: [TranslocoPipe, NwBrandMark],
  templateUrl: './auth-brand-panel.html',
  styleUrl: './auth-brand-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth-brand-panel' },
})
export class AuthBrandPanel {}
