import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PreferenceStore } from '../preferences/preference-store';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
/**
 * Curated accent palettes (src/styles/tokens/_accents.scss). Coral is the Nawara default; the others recolour only the
 * brand-accent tokens. Machine values, never translated. Order is the display order.
 */
export const ACCENT_PALETTES = ['coral', 'rose', 'plum', 'indigo', 'teal', 'amber'] as const;
export type AccentPalette = (typeof ACCENT_PALETTES)[number];
export const DEFAULT_THEME: ThemePreference = 'system';
export const DEFAULT_ACCENT: AccentPalette = 'coral';
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

const isThemePreference = (value: string | null): value is ThemePreference =>
  THEME_PREFERENCES.some((preference) => preference === value);

const isAccentPalette = (value: string | null): value is AccentPalette =>
  ACCENT_PALETTES.some((accent) => accent === value);

/**
 * The browser's appearance preferences (docs/ARCHITECTURE.md §14): the theme mode as `data-theme` on <html> (with
 * `system`, the operating-system preference is followed live; `color-scheme` comes from the theme tokens) and the accent
 * palette as `data-accent` (absent for the default, coral).
 *
 * Personal, local and non-sensitive: stored in this browser only (PreferenceStore), never sent to Core, and independent
 * of the session, the role and the Company or Platform scope, so sign-in, sign-out and scope changes keep it. Stored
 * values are validated; anything unknown falls back to the defaults.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly store = inject(PreferenceStore);
  private readonly document = inject(DOCUMENT);
  private readonly systemPrefersDark = signal(false);
  private readonly stored = this.store.read('theme');

  private readonly storedAccent = this.store.read('accent');

  readonly preference = signal<ThemePreference>(
    isThemePreference(this.stored) ? this.stored : DEFAULT_THEME,
  );
  readonly accent = signal<AccentPalette>(
    isAccentPalette(this.storedAccent) ? this.storedAccent : DEFAULT_ACCENT,
  );
  /** Whether anything differs from the Nawara defaults (the "reset" action is meaningful). */
  readonly customized = computed(
    () => this.preference() !== DEFAULT_THEME || this.accent() !== DEFAULT_ACCENT,
  );
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.preference();
    if (preference !== 'system') return preference;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    const query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    if (query) {
      this.systemPrefersDark.set(query.matches);
      const onChange = (event: MediaQueryListEvent) => this.systemPrefersDark.set(event.matches);
      query.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', onChange));
    }

    effect(() => {
      this.document.documentElement.dataset['theme'] = this.resolved();
    });
    effect(() => {
      const accent = this.accent();
      const root = this.document.documentElement;
      if (accent === DEFAULT_ACCENT) delete root.dataset['accent'];
      else root.dataset['accent'] = accent;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.store.write('theme', preference);
  }

  setAccent(accent: AccentPalette): void {
    this.accent.set(accent);
    if (accent === DEFAULT_ACCENT) this.store.remove('accent');
    else this.store.write('accent', accent);
  }

  /** Back to the Nawara defaults: system mode, coral accent. */
  reset(): void {
    this.preference.set(DEFAULT_THEME);
    this.accent.set(DEFAULT_ACCENT);
    this.store.remove('theme');
    this.store.remove('accent');
  }
}
