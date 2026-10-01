import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PreferenceStore } from '../preferences/preference-store';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = 'light' | 'dark';

const isThemePreference = (value: string | null): value is ThemePreference =>
  THEME_PREFERENCES.some((preference) => preference === value);

/**
 * Applies the theme as `data-theme` on <html> (docs/ARCHITECTURE.md §14). With `system`, the operating-system
 * preference is followed live. `color-scheme` comes from the theme tokens, so native controls follow too.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly store = inject(PreferenceStore);
  private readonly document = inject(DOCUMENT);
  private readonly systemPrefersDark = signal(false);
  private readonly stored = this.store.read('theme');

  readonly preference = signal<ThemePreference>(
    isThemePreference(this.stored) ? this.stored : 'system',
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
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.store.write('theme', preference);
  }
}
