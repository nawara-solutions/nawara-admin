import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/**
 * The Nawara logo (docs/BRAND.md): the flower symbol, optionally with the "NAWARA SOLUTIONS" wordmark.
 *
 * Both are artwork files in `public/brand/`, never font lettering:
 * - the symbol is the owner's flower with orbit rings (`nawara-mark.png`, supplied 2026-10-02; raster until the official
 *   vector is supplied);
 * - the wordmark is the brand board's own lettering, extracted as a raster in a light- and a dark-background version;
 * - `lockup` renders the horizontal lockup (flower + lettering) as one raster per background, from the owner's
 *   Company Overview design (2026-10-02, docs/BRAND.md), so the flower is artwork rather than the reconstruction.
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
    '[class.nw-brand-mark--symbol]': '!wordmark() && !lockup()',
    '[class.nw-brand-mark--lockup]': 'lockup()',
  },
})
export class NwBrandMark {
  /** Accessible name of the logo, for example "Nawara Solutions". */
  readonly label = input.required<string>();
  /** Shows the wordmark beside the symbol; without it only the symbol is rendered. */
  readonly wordmark = input(false, { transform: booleanAttribute });
  /** Shows the horizontal lockup artwork (flower and lettering in one raster); `wordmark` is then ignored. */
  readonly lockup = input(false, { transform: booleanAttribute });
}
