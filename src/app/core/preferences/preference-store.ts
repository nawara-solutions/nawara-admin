import { Injectable } from '@angular/core';

/**
 * The single registry of browser-stored preferences (docs/ARCHITECTURE.md §14). Every key is listed here and nothing
 * else touches browser storage. Preferences are never sensitive: no tokens, secrets or personal data.
 * The no-flash script in src/index.html reads `theme` and `locale` by these same keys before Angular starts.
 */
export const PREFERENCE_KEYS = {
  theme: 'nw.theme',
  locale: 'nw.locale',
  accent: 'nw.accent',
} as const;

export type PreferenceName = keyof typeof PREFERENCE_KEYS;

@Injectable({ providedIn: 'root' })
export class PreferenceStore {
  /** Explicit appearance commits report failure; existing best-effort preference callers keep their semantics. */
  commitAppearance(values: { theme: string | null; accent: string | null }): boolean {
    const names = ['theme', 'accent'] as const;
    let previous: readonly (string | null)[];
    try {
      previous = names.map((name) => globalThis.localStorage.getItem(PREFERENCE_KEYS[name]));
    } catch {
      return false;
    }
    try {
      for (const name of names) {
        const value = values[name];
        if (value === null) globalThis.localStorage.removeItem(PREFERENCE_KEYS[name]);
        else globalThis.localStorage.setItem(PREFERENCE_KEYS[name], value);
      }
      return true;
    } catch {
      // Restore the pair when a later write fails. Storage can also block rollback; never report success in that case.
      for (const [index, name] of names.entries()) {
        try {
          const value = previous[index] ?? null;
          if (value === null) globalThis.localStorage.removeItem(PREFERENCE_KEYS[name]);
          else globalThis.localStorage.setItem(PREFERENCE_KEYS[name], value);
        } catch {
          /* The editor retains the draft for retry. */
        }
      }
      return false;
    }
  }

  read(name: PreferenceName): string | null {
    try {
      return globalThis.localStorage.getItem(PREFERENCE_KEYS[name]);
    } catch {
      return null; // storage blocked (private mode, policy): fall back to defaults
    }
  }

  remove(name: PreferenceName): void {
    try {
      globalThis.localStorage.removeItem(PREFERENCE_KEYS[name]);
    } catch {
      // storage blocked: nothing was stored
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
