import { DOCUMENT, DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PreferenceStore } from '../preferences/preference-store';
import { PALETTE_ARTWORK } from './palette-artwork';

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

/** How long a switch waits for the new artwork before applying anyway (a slow network never blocks the change). */
const PRELOAD_TIMEOUT_MS = 1500;

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
    // The browser-tab icon follows the palette AND the resolved appearance (system mode included, live): an external
    // SVG cannot read the page's CSS variables, so each palette and appearance has its own file (distinct URLs, never a
    // stale cached icon). The same choice is made before first paint by the script in index.html.
    effect(() => this.showFavicon(PALETTE_ARTWORK[this.accent()].favicon[this.resolved()]));
  }

  setPreference(preference: ThemePreference): void {
    this.preference.set(preference);
    this.store.write('theme', preference);
  }

  /**
   * Switches the palette once its artwork (both themes, from PALETTE_ARTWORK) is loaded, so the controls, the logo and
   * the illustrations change together and no artwork shows blank in between. The choice is stored at once.
   */
  async setAccent(accent: AccentPalette): Promise<void> {
    if (accent === DEFAULT_ACCENT) this.store.remove('accent');
    else this.store.write('accent', accent);
    this.pendingAccent = accent;
    await this.preload(accent);
    // A later choice made while this one was loading wins.
    if (this.pendingAccent === accent) this.accent.set(accent);
  }

  private pendingAccent: AccentPalette | null = null;

  /**
   * Points the single icon link at `href`. The link is replaced rather than edited: browsers reliably repaint the tab
   * icon for a new `<link rel="icon">`, while some ignore an `href` change on the existing one.
   */
  private showFavicon(href: string): void {
    const current = this.document.querySelector<HTMLLinkElement>('link#nw-favicon');
    if (!current || current.getAttribute('href') === href) return;
    const next = current.cloneNode() as HTMLLinkElement;
    next.setAttribute('href', href);
    current.replaceWith(next);
  }

  private preload(accent: AccentPalette): Promise<void> {
    const view = this.document.defaultView;
    if (!view?.Image) return Promise.resolve();
    const { light, dark } = PALETTE_ARTWORK[accent];
    const urls = [light, dark].flatMap((art) => [art.full, art.corner]);
    const { favicon } = PALETTE_ARTWORK[accent];
    const loads = [...urls, favicon.light, favicon.dark].map((url) => {
      const image = new view.Image();
      image.src = url;
      return typeof image.decode === 'function' ? image.decode().catch(() => undefined) : undefined;
    });
    const timeout = new Promise<void>((resolve) => view.setTimeout(resolve, PRELOAD_TIMEOUT_MS));
    return Promise.race([Promise.all(loads).then(() => undefined), timeout]);
  }

  /** Back to the Nawara defaults: system mode, coral accent. */
  reset(): void {
    this.preference.set(DEFAULT_THEME);
    this.pendingAccent = DEFAULT_ACCENT;
    this.accent.set(DEFAULT_ACCENT);
    this.store.remove('theme');
    this.store.remove('accent');
  }
}
