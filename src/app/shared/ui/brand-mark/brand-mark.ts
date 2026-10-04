import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

/**
 * The Nawara logo of the coral + ink theme (owner decision 2026-10-04, docs/BRAND.md): the lowercase wordmark
 * "nawara" set in Readex Pro, with the bloom mark standing in for the "r", and optionally "SOLUTIONS" beneath it.
 *
 * - Without an option: the bloom mark alone (an artwork file).
 * - `wordmark` (or `lockup`, the earlier name of the same thing): the wordmark with the bloom.
 * - `full`: the wordmark with the "SOLUTIONS" line and its flourish (sign-in brand panel).
 *
 * The bloom and the flourish are the exact paths of the artwork files in `public/brand/`, drawn inline so that their
 * colours follow the `--nw-logo-*` tokens: the theme and the accent palette (owner decision 2026-10-04). The lettering
 * is live text in the brand typeface, in the neutral text colour, as the owner's design draws it. The size follows `--nw-brand-mark-size` (the wordmark's font size). The logo never
 * mirrors in RTL. The kit owns no copy, so the accessible name is an input; the lettering itself is hidden from
 * assistive technology, so the name is announced once.
 */
let nextId = 0;

@Component({
  selector: 'nw-brand-mark',
  imports: [NgTemplateOutlet],
  templateUrl: './brand-mark.html',
  styleUrl: './brand-mark.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-brand-mark',
    role: 'img',
    '[attr.aria-label]': 'label()',
    '[class.nw-brand-mark--symbol]': '!lettered()',
    '[class.nw-brand-mark--full]': 'full()',
  },
})
export class NwBrandMark {
  /** Accessible name of the logo, for example "Nawara Solutions". */
  readonly label = input.required<string>();
  /** Shows the wordmark; without it (and without `lockup` or `full`) only the bloom mark is rendered. */
  readonly wordmark = input(false, { transform: booleanAttribute });
  /** Same as `wordmark` (kept for the existing call sites). */
  readonly lockup = input(false, { transform: booleanAttribute });
  /** The wordmark with the "SOLUTIONS" line beneath it. */
  readonly full = input(false, { transform: booleanAttribute });

  protected readonly lettered = computed(() => this.wordmark() || this.lockup() || this.full());

  /** Gradient ids, unique per instance: several logos can share a page. */
  private readonly uid = `nw-logo-${nextId++}`;
  protected readonly ids = {
    right: `${this.uid}-right`,
    left: `${this.uid}-left`,
    back: `${this.uid}-back`,
    beadMain: `${this.uid}-bead-main`,
    beadSide: `${this.uid}-bead-side`,
    leaf: `${this.uid}-leaf`,
  };

  protected ref(id: string): string {
    return `url(#${id})`;
  }
}
