import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

/**
 * The Nawara Solutions logo (docs/BRAND.md §0). The wordmark is the floral-R "nawara" of the owner's branding board
 * (2026-10-30), cut from the board's pixels (tools/brand/extract_floral_r.py), never redrawn; "SOLUTIONS" beneath it is
 * live text between two thin rules, laid out as the board lays out its subtitle.
 *
 * - Without an option: the complete floral R alone, the board's app-icon symbol without its tile (scope switcher).
 * - `wordmark` (or `lockup`, the earlier name of the same thing): the floral-R wordmark.
 * - `full`: the wordmark with the "SOLUTIONS" line and its rules (sign-in brand panel, workspace sidebar).
 * - `inline`: the wordmark, a thin separator and "SOLUTIONS" on one line (no caller at present).
 *
 * The artwork is the `--nw-logo-wordmark` and `--nw-logo-symbol` tokens: light or dark lettering and ground per
 * theme, and the floral R in the accent palette (owner decision 2026-10-04). The size follows `--nw-brand-mark-size` (the
 * wordmark's font size; the word is as wide as the earlier lettered "nawara" at that size); `--nw-brand-mark-word-size`
 * optionally sizes the word and its "SOLUTIONS" line alone. The logo never mirrors in RTL. The kit owns no copy, so
 * the accessible name is an input; the artwork and lettering are hidden from assistive technology, so the name is
 * announced once.
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
    '[class.nw-brand-mark--symbol]': '!lettered()',
    '[class.nw-brand-mark--full]': 'full()',
    '[class.nw-brand-mark--inline]': 'inline()',
  },
})
export class NwBrandMark {
  /** Accessible name of the logo, for example "Nawara Solutions". */
  readonly label = input.required<string>();
  /** Shows the wordmark; without it (and without `lockup`, `full` or `inline`) only the floral R is rendered. */
  readonly wordmark = input(false, { transform: booleanAttribute });
  /** Same as `wordmark` (kept for the existing call sites). */
  readonly lockup = input(false, { transform: booleanAttribute });
  /** The wordmark with the "SOLUTIONS" line beneath it. */
  readonly full = input(false, { transform: booleanAttribute });
  /** The wordmark with "SOLUTIONS" on the same line, after a thin separator (no flourish). */
  readonly inline = input(false, { transform: booleanAttribute });

  protected readonly lettered = computed(
    () => this.wordmark() || this.lockup() || this.full() || this.inline(),
  );
}
