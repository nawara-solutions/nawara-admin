import { Injectable } from '@angular/core';

/**
 * The single registry of browser-stored preferences (docs/ARCHITECTURE.md §14). Every key is listed here and nothing
 * else touches browser storage. Preferences are never sensitive: no tokens, secrets or personal data.
 * The no-flash script in src/index.html reads `theme` and `locale` by these same keys before Angular starts.
 */
export const PREFERENCE_KEYS = {
  theme: 'nw.theme',
  locale: 'nw.locale',
} as const;

export type PreferenceName = keyof typeof PREFERENCE_KEYS;

@Injectable({ providedIn: 'root' })
export class PreferenceStore {
  read(name: PreferenceName): string | null {
    try {
      return globalThis.localStorage.getItem(PREFERENCE_KEYS[name]);
    } catch {
      return null; // storage blocked (private mode, policy): fall back to defaults
    }
  }

  write(name: PreferenceName, value: string): void {
    try {
      globalThis.localStorage.setItem(PREFERENCE_KEYS[name], value);
    } catch {
      // storage blocked: the preference still applies for this session
    }
  }
}
