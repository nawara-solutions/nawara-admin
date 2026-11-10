import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DEFAULT_ACCENT, THEME_PREFERENCES, ThemePreference } from '../../core/theme/theme.service';
import { NwButton } from '../../shared/ui/button/button';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';
import { AppearanceDraft } from './appearance-draft';
import { AccentGrid } from './accent-grid';
import { ACCENT_KEYS, AccentPicker } from './accent-picker';

const MODES = {
  light: { icon: 'sun', labelKey: 'preferences.theme.light' },
  dark: { icon: 'moon', labelKey: 'preferences.theme.dark' },
  system: { icon: 'monitor', labelKey: 'preferences.theme.system' },
} as const satisfies Record<ThemePreference, { icon: NwIconName; labelKey: string }>;

const MODE_HINTS = {
  system: 'preferences.appearance.modeHint.system',
  light: 'preferences.appearance.modeHint.light',
  dark: 'preferences.appearance.modeHint.dark',
} as const satisfies Record<ThemePreference, string>;

let nextId = 0;

/**
 * The appearance preferences of this browser (owner decision 2026-10-04): theme mode and accent palette, with a reset to
 * the Nawara defaults. One panel, used by the Appearance popover (sign-in pages, top bar) and by Settings → Appearance,
 * using one disposable AppearanceDraft per panel and the same committed ThemeService state. Apply persists explicitly.
 *
 * Mode is a native radio group inside a fieldset (arrow keys move the choice; the checked state is what a screen reader
 * announces); the workspace cards also describe each mode. Accent is one compact selector that opens a searchable
 * palette list (AccentPicker), so the panel keeps its height however many palettes the registry holds. Available before
 * and after sign-in; it never depends on the session, role or scope.
 */
@Component({
  selector: 'adm-appearance-panel',
  imports: [TranslocoPipe, NwButton, NwIcon, AccentPicker, AccentGrid],
  templateUrl: './appearance-panel.html',
  providers: [AppearanceDraft],
  styleUrls: ['./appearance-panel.scss', './appearance-picker-panel.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'appearance-panel',
    '[class.appearance-panel--workspace]': "accentPresentation() === 'grid'",
    '[class.appearance-panel--picker]': "accentPresentation() === 'picker'",
  },
})
export class AppearancePanel {
  readonly accentPresentation = input<'picker' | 'grid'>('picker');
  protected readonly theme = inject(AppearanceDraft);
  protected readonly accentKeys = ACCENT_KEYS;
  protected readonly defaultAccent = DEFAULT_ACCENT;
  protected readonly id = `appearance-${nextId++}`;
  protected readonly modes = THEME_PREFERENCES.map((value) => ({
    value,
    ...MODES[value],
    hintKey: MODE_HINTS[value],
  }));
}
