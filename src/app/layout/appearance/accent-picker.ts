import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
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

/** Case-, accent- and width-insensitive matching ("emer" finds "Émeraude"). */
const normalize = (text: string) =>
  text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

let nextId = 0;

/**
 * The accent colour of the Appearance panel: one compact row (the current palette's swatch and name) that expands, in
 * place, into a searchable palette list built from the registry (ACCENT_PALETTES), so the closed panel keeps its height
 * however many palettes exist.
 *
 * The list is a contained section of the panel, not a second overlay: it moves with its selector, is clipped by nothing,
 * and never lies over the page outside the panel. Only the results scroll (capped height); the search field stays
 * visible above them.
 *
 * ARIA combobox pattern: the search field keeps focus and owns a listbox; arrow and Page keys move the active option
 * (aria-activedescendant), Enter or a click chooses it, Escape closes the list (the panel stays open). Choosing applies
 * the palette through ThemeService.setAccent (the one accent state: persistence, logo, favicon and artwork follow),
 * closes the list and returns focus to the selector. Search matches anywhere in the localized name, or the start of the
 * palette's machine value (so the English id still finds a palette in French or Arabic).
 */
@Component({
  selector: 'adm-accent-picker',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './accent-picker.html',
  styleUrl: './accent-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'accent-picker' },
})
export class AccentPicker {
  /** The id of the visible "Accent colour" label, which names the selector. */
  readonly labelledBy = input.required<string>();

  protected readonly theme = inject(ThemeService);
  private readonly injector = inject(Injector);
  protected readonly id = `accent-picker-${nextId++}`;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);

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
    // Keep the active option visible inside the scrolling results (never the page) while the keys move through them.
    effect(() => {
      const id = this.activeId();
      const list = this.listbox()?.nativeElement;
      const option = id ? list?.querySelector<HTMLElement>(`#${id}`) : null;
      if (!list || !option) return;
      const top = option.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + option.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTop = top + option.offsetHeight - list.clientHeight;
    });
  }

  protected optionId(value: AccentPalette): string {
    return `${this.id}-option-${value}`;
  }

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.query.set('');
    this.activeIndex.set(Math.max(0, ACCENT_PALETTES.indexOf(this.theme.accent())));
    this.open.set(true);
    afterNextRender(
      () => {
        const search = this.search()?.nativeElement;
        search?.focus();
        // The section appeared inside the panel: bring it into view if the panel itself had to scroll.
        search?.closest('.accent-picker')?.scrollIntoView?.({ block: 'nearest' });
      },
      { injector: this.injector },
    );
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
        this.close();
        return;
    }
  }

  /**
   * A click or tap on an option (delegated to the listbox: the options are not focusable, the search field keeps focus
   * and the keyboard, as the combobox pattern requires; the listbox's mousedown is cancelled so focus never leaves it).
   */
  protected onListClick(event: MouseEvent): void {
    const option = (event.target as Element | null)?.closest<HTMLElement>('[role=option]');
    const value = ACCENT_PALETTES.find((accent) => accent === option?.dataset['value']);
    if (value) this.choose(value);
  }

  protected choose(value: AccentPalette): void {
    void this.theme.setAccent(value);
    this.close();
  }

  /** Closes the list and returns focus to the selector. */
  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger().nativeElement.focus();
  }
}
