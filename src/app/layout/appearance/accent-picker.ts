import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe, translateSignal } from '@jsverse/transloco';
import { ACCENT_PALETTES, AccentPalette, ThemeService } from '../../core/theme/theme.service';
import { NwIcon } from '../../shared/ui/icon/icon';

/** The display name of each palette (full keys, so the i18n check sees them). Typed against the registry: a new palette must add its name. */
export const ACCENT_KEYS = {
  coral: 'preferences.accent.coral',
  rose: 'preferences.accent.rose',
  plum: 'preferences.accent.plum',
  indigo: 'preferences.accent.indigo',
  teal: 'preferences.accent.teal',
  amber: 'preferences.accent.amber',
  midnight: 'preferences.accent.midnight',
  pearl: 'preferences.accent.pearl',
  sapphire: 'preferences.accent.sapphire',
  emerald: 'preferences.accent.emerald',
  burgundy: 'preferences.accent.burgundy',
} as const satisfies Record<AccentPalette, string>;

/** Below the selector, its width (above as fallback); CDK mirrors these in RTL. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 6 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -6 },
];

/** Case-, accent- and width-insensitive matching ("émeraude" finds "Émeraude" from "emeraude"). */
const normalize = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

let nextId = 0;

/**
 * The accent colour of the Appearance panel: one compact row (the current palette's swatch and name) that opens a
 * searchable palette list, so the panel keeps its height however many palettes the registry (ACCENT_PALETTES) holds.
 *
 * ARIA combobox pattern: the search field keeps focus and owns a listbox; arrow keys move the active option
 * (aria-activedescendant), Enter or a click chooses it, Escape or Tab closes the list. Choosing applies the palette
 * through ThemeService.setAccent (the one accent state: persistence, logo, favicon and artwork follow), closes the list
 * and returns focus to the selector. Search matches anywhere in the localized name, or the start of the palette's machine
 * value (so the English id still finds a palette in French or Arabic).
 */
@Component({
  selector: 'adm-accent-picker',
  imports: [A11yModule, CdkConnectedOverlay, CdkOverlayOrigin, TranslocoPipe, NwIcon],
  templateUrl: './accent-picker.html',
  styleUrl: './accent-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'accent-picker' },
})
export class AccentPicker {
  /** The id of the visible "Accent colour" label, which names the selector. */
  readonly labelledBy = input.required<string>();

  protected readonly theme = inject(ThemeService);
  protected readonly id = `accent-picker-${nextId++}`;
  protected readonly positions = POSITIONS;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  /** The selector's width, so the list lines up with it. */
  protected readonly width = signal(0);

  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly listbox = viewChild<ElementRef<HTMLElement>>('listbox');

  private readonly names = translateSignal(ACCENT_PALETTES.map((value) => ACCENT_KEYS[value]));

  protected readonly accents = computed(() => {
    const names = this.names();
    return ACCENT_PALETTES.map((value, index) => ({
      value,
      name: names[index] ?? value,
      swatch: `var(--nw-swatch-${value})`,
    }));
  });
  protected readonly current = computed(() => {
    const value = this.theme.accent();
    const name = this.names()[ACCENT_PALETTES.indexOf(value)] ?? value;
    return { value, name, swatch: `var(--nw-swatch-${value})` };
  });
  protected readonly filtered = computed(() => {
    const query = normalize(this.query());
    if (!query) return this.accents();
    return this.accents().filter(
      (accent) => normalize(accent.name).includes(query) || accent.value.startsWith(query),
    );
  });
  protected readonly activeId = computed(() => {
    const active = this.filtered()[this.activeIndex()];
    return active ? this.optionId(active.value) : null;
  });

  constructor() {
    // Keep the active option visible while the arrow keys move through a long list.
    effect(() => {
      const id = this.activeId();
      const list = this.listbox()?.nativeElement;
      if (!id || !list) return;
      list.querySelector(`#${id}`)?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  protected optionId(value: AccentPalette): string {
    return `${this.id}-option-${value}`;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
      return;
    }
    this.width.set(this.trigger().nativeElement.getBoundingClientRect().width);
    this.query.set('');
    this.activeIndex.set(Math.max(0, ACCENT_PALETTES.indexOf(this.theme.accent())));
    this.open.set(true);
  }

  protected onAttach(): void {
    // The overlay content exists once attached; the search field takes focus.
    queueMicrotask(() => this.search()?.nativeElement.focus());
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    const index = this.filtered().findIndex((accent) => accent.value === this.theme.accent());
    this.activeIndex.set(Math.max(0, index));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.filtered().length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (count === 0) return;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.activeIndex.update((index) => (index + step + count) % count);
        return;
      }
      case 'PageDown':
      case 'PageUp':
        if (count === 0) return;
        event.preventDefault();
        this.activeIndex.set(event.key === 'PageDown' ? count - 1 : 0);
        return;
      case 'Enter': {
        event.preventDefault();
        const active = this.filtered()[this.activeIndex()];
        if (active) this.choose(active.value);
        return;
      }
      case 'Escape':
        // Closes the list only, never the Appearance popover around it.
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        event.preventDefault();
        this.close(true);
        return;
    }
  }

  protected choose(value: AccentPalette): void {
    void this.theme.setAccent(value);
    this.close(true);
  }

  /**
   * A click on an option (delegated to the listbox: the options are not focusable, the search field keeps focus and
   * the keyboard, as the combobox pattern requires; the listbox's mousedown is cancelled so focus never leaves it).
   */
  protected onListClick(event: MouseEvent): void {
    const option = (event.target as Element | null)?.closest<HTMLElement>('[role=option]');
    const value = ACCENT_PALETTES.find((accent) => accent === option?.dataset['value']);
    if (value) this.choose(value);
  }

  protected onOutsideClick(event: MouseEvent): void {
    // A click on the selector toggles; it must not also count as "outside".
    if (this.trigger().nativeElement.contains(event.target as Node)) return;
    // Focus goes where the user clicked; it returns to the selector only if it would otherwise be lost.
    this.close(false);
  }

  /** Closes the list. `restoreFocus`: back to the selector (Escape, Tab, a choice, the selector itself). */
  close(restoreFocus: boolean): void {
    if (!this.open()) return;
    const lost = this.focusWouldBeLost();
    this.open.set(false);
    if (restoreFocus || lost) this.trigger().nativeElement.focus();
  }

  /** Focus is in the list (removed on close) or nowhere (a click on plain text). */
  private focusWouldBeLost(): boolean {
    const document = this.trigger().nativeElement.ownerDocument;
    const active = document.activeElement;
    return !active || active === document.body || active === this.search()?.nativeElement;
  }
}
