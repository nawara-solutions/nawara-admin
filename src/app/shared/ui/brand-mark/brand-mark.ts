import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/**
 * The Nawara logo (docs/BRAND.md): the flower symbol, optionally with the "NAWARA SOLUTIONS" wordmark.
 *
 * Both are artwork files in `public/brand/`, never font lettering:
 * - the symbol is a vector RECONSTRUCTION of the brand board's flower (PROVISIONAL until the official vector is supplied);
 * - the wordmark is the brand board's own lettering, extracted as a raster in a light- and a dark-background version.
 * Replacing those files changes no consumer. The kit owns no copy, so the accessible name is an input.
 */
@Component({
  selector: 'nw-brand-mark',
  templateUrl: './brand-mark.html',
  styleUrl: './brand-mark.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-brand-mark',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[class.nw-brand-mark--symbol]': '!wordmark()',
  },
})
export class NwBrandMark {
  /** Accessible name of the logo, for example "Nawara Solutions". */
  readonly label = input.required<string>();
  /** Shows the wordmark beside the symbol; without it only the symbol is rendered. */
  readonly wordmark = input(false, { transform: booleanAttribute });
}
