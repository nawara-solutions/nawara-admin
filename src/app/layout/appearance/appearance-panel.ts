import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ACCENT_PALETTES,
  AccentPalette,
  THEME_PREFERENCES,
  ThemePreference,
  ThemeService,
} from '../../core/theme/theme.service';
import { NwButton } from '../../shared/ui/button/button';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

const MODES = {
  light: { icon: 'sun', labelKey: 'preferences.theme.light' },
  dark: { icon: 'moon', labelKey: 'preferences.theme.dark' },
  system: { icon: 'monitor', labelKey: 'preferences.theme.system' },
} as const satisfies Record<ThemePreference, { icon: NwIconName; labelKey: string }>;

const ACCENT_KEYS = {
  coral: 'preferences.accent.coral',
  rose: 'preferences.accent.rose',
  plum: 'preferences.accent.plum',
  indigo: 'preferences.accent.indigo',
  teal: 'preferences.accent.teal',
  amber: 'preferences.accent.amber',
} as const satisfies Record<AccentPalette, string>;

let nextId = 0;

/**
 * The appearance preferences of this browser (owner decision 2026-10-04): theme mode and accent palette, with a reset to
 * the Nawara defaults. One panel, used by the Appearance popover (sign-in pages, top bar) and by Settings → Appearance,
 * all bound to the same ThemeService state. Changes apply at once.
 *
 * Native radio groups inside fieldsets: arrow keys move the choice, and the checked state is what a screen reader
 * announces. Available before and after sign-in; it never depends on the session, role or scope.
 */
@Component({
  selector: 'adm-appearance-panel',
  imports: [TranslocoPipe, NwButton, NwIcon],
  templateUrl: './appearance-panel.html',
  styleUrl: './appearance-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'appearance-panel' },
})
export class AppearancePanel {
  protected readonly theme = inject(ThemeService);
  protected readonly id = `appearance-${nextId++}`;
  protected readonly modes = THEME_PREFERENCES.map((value) => ({ value, ...MODES[value] }));
  protected readonly accents = ACCENT_PALETTES.map((value) => ({
    value,
    labelKey: ACCENT_KEYS[value],
  }));
}
