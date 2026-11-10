import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

/**
 * The Nawara Admin logo (docs/BRAND.md §0). Since B1 (2026-11-01) the artwork is the blue-leaf "nawara admin" logo of the
 * owner's logo-family reference, cut from its pixels (tools/brand/extract_blue_leaf.py), never redrawn; provisional rasters
 * until official SVG masters exist. Its botanical symbol follows the selected accent palette; the lettering and the white
 * details do not (abstracts/_logo.scss).
 *
 * - Without an option: the Admin symbol alone, icon only (scope switcher).
 * - `wordmark` (or `lockup`, the earlier name of the same thing): the "nawara admin" logo.
 * - `full` / `inline`: the logo with a live "SOLUTIONS" line beneath or beside it (the /foundation gallery only).
 *
 * The artwork is the `--nw-logo-admin-*` layers (lettering per theme, the symbol painted with `--nw-logo-accent`, its white
 * details), drawn inside the earlier logo boxes so callers keep their layout. The size follows `--nw-brand-mark-size`;
 * `--nw-brand-mark-word-size` optionally sizes the word and its "SOLUTIONS" line alone. The logo never mirrors in RTL. The
 * Admin wordmarks place their original botanical symbol after "nawara admin"; the separate Solutions mark retains its
 * existing artwork. The kit owns no copy, so the accessible name is an input; artwork is hidden from assistive
 * technology, so the name is announced once.
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
    '[class.nw-brand-mark--symbol-first]': 'symbolFirst()',
    '[class.nw-brand-mark--full]': 'full()',
    '[class.nw-brand-mark--inline]': 'inline()',
  },
})
export class NwBrandMark {
  /** Accessible name of the logo, for example "Nawara Admin". */
  readonly label = input.required<string>();
  /** Shows the logo; without it (and without `lockup`, `full` or `inline`) only the symbol is rendered. */
  readonly wordmark = input(false, { transform: booleanAttribute });
  /** Live typographic hierarchy for the workspace wordmark. The symbol keeps its artwork. */
  readonly typeset = input(false, { transform: booleanAttribute });
  readonly symbolFirst = input(false, { transform: booleanAttribute });
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
