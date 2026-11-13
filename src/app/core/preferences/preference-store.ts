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
  density: 'nw.density',
  operatorTotalsMode: 'nw.operatorTotalsMode',
  operatorTotalsOpen: 'nawara.operator-totals-open',
  licensesOverviewMode: 'nw.licensesOverviewMode',
  licensesOverviewOpen: 'nw.licensesOverviewOpen',
  platformFiguresVisible: 'nw.platformFiguresVisible',
  platformSubscriptionsVisible: 'nw.platformSubscriptionsVisible',
} as const;

export type PreferenceName = keyof typeof PREFERENCE_KEYS;

/**
 * Who a preference belongs to. Every registered preference is THIS BROWSER's (P9-S1: browser-local, the same for every
 * signed-in actor; ThemeService: independent of the session, the role and the Company or Platform scope). None is an actor's,
 * a Platform's or an Organization's, none is a DemoWorld fact, and none is sent to Core.
 */
export type PreferenceScope = 'browser';

/**
 * Whether the Owner's approval of a preference is evidenced (WP-3.3). `notEvidenced`: introduced by the PR #89 checkpoint, which
 * was merged as "not a completed stage" (X33: the page-section preferences). Such a preference keeps its current behaviour
 * exactly; it is never a basis for new persistence, controls or semantics.
 */
export type PreferenceApproval = 'approved' | 'notEvidenced';

export interface PreferenceContract {
  readonly scope: PreferenceScope;
  readonly approval: PreferenceApproval;
  /** Where it was introduced (commit, and PR or stage where known). */
  readonly introducedIn: string;
  /** The architecture finding that covers it, if any. */
  readonly finding?: 'X33';
}

const X33 = {
  scope: 'browser',
  approval: 'notEvidenced',
  introducedIn: 'PR #89 checkpoint (4db86be)',
  finding: 'X33',
} as const;

/** The contract of every registered preference: the registry is closed, and a new key needs its own approval. */
export const PREFERENCE_CONTRACTS = {
  theme: { scope: 'browser', approval: 'approved', introducedIn: 'A2 design foundation (fdfd88e)' },
  locale: {
    scope: 'browser',
    approval: 'approved',
    introducedIn: 'A2 design foundation (fdfd88e); P9-S1 Language (PR #42)',
  },
  accent: {
    scope: 'browser',
    approval: 'approved',
    introducedIn: 'appearance preferences (d32b088, PR #7); accent palettes (PRs #50, #51)',
  },
  density: {
    scope: 'browser',
    approval: 'notEvidenced',
    introducedIn: 'PR #89 checkpoint (4db86be)',
  },
  operatorTotalsMode: X33,
  operatorTotalsOpen: X33,
  licensesOverviewMode: X33,
  licensesOverviewOpen: X33,
  platformFiguresVisible: X33,
  platformSubscriptionsVisible: X33,
} as const satisfies Readonly<Record<PreferenceName, PreferenceContract>>;

@Injectable({ providedIn: 'root' })
export class PreferenceStore {
  /** Explicit appearance commits report failure; existing best-effort preference callers keep their semantics. */
  commitAppearance(values: {
    theme: string | null;
    accent: string | null;
    density?: string | null;
  }): boolean {
    const names =
      values.density === undefined
        ? (['theme', 'accent'] as const)
        : (['theme', 'accent', 'density'] as const);
    let previous: readonly (string | null)[];
    try {
      previous = names.map((name) => globalThis.localStorage.getItem(PREFERENCE_KEYS[name]));
    } catch {
      return false;
    }
    try {
      for (const name of names) {
        const value = values[name];
        if (value == null) globalThis.localStorage.removeItem(PREFERENCE_KEYS[name]);
        else globalThis.localStorage.setItem(PREFERENCE_KEYS[name], value);
      }
      return true;
    } catch {
      // Restore the pair when a later write fails. Storage can also block rollback; never report success in that case.
      for (const [index, name] of names.entries()) {
        try {
          const value = previous[index] ?? null;
          if (value == null) globalThis.localStorage.removeItem(PREFERENCE_KEYS[name]);
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
