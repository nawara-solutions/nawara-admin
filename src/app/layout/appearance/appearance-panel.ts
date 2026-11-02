import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { THEME_PREFERENCES, ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { NwButton } from '../../shared/ui/button/button';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';
import { AccentPicker } from './accent-picker';

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
 * all bound to the same ThemeService state. Changes apply at once.
 *
 * Mode is a native radio group inside a fieldset (arrow keys move the choice; the checked state is what a screen reader
 * announces), described by a one-line hint for the chosen mode. Accent is one compact selector that opens a searchable
 * palette list (AccentPicker), so the panel keeps its height however many palettes the registry holds. Available before
 * and after sign-in; it never depends on the session, role or scope.
 */
@Component({
  selector: 'adm-appearance-panel',
  imports: [TranslocoPipe, NwButton, NwIcon, AccentPicker],
  templateUrl: './appearance-panel.html',
  styleUrl: './appearance-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'appearance-panel' },
})
export class AppearancePanel {
  protected readonly theme = inject(ThemeService);
  protected readonly id = `appearance-${nextId++}`;
  protected readonly modes = THEME_PREFERENCES.map((value) => ({ value, ...MODES[value] }));
  protected readonly modeHint = computed(() => MODE_HINTS[this.theme.preference()]);
}
