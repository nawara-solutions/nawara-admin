import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALE_ENDONYMS } from '../../../core/i18n/locale';
import { LocaleService } from '../../../core/i18n/locale.service';
import { AccentPalette, ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { NwIcon } from '../../../shared/ui/icon/icon';

const MODE_KEYS = {
  system: 'preferences.theme.system',
  light: 'preferences.theme.light',
  dark: 'preferences.theme.dark',
} as const satisfies Record<ThemePreference, string>;

const ACCENT_KEYS = {
  coral: 'preferences.accent.coral',
  rose: 'preferences.accent.rose',
  plum: 'preferences.accent.plum',
  indigo: 'preferences.accent.indigo',
  teal: 'preferences.accent.teal',
  amber: 'preferences.accent.amber',
} as const satisfies Record<AccentPalette, string>;

/**
 * The Settings hub (`/settings`, P9-S1): the personal settings that exist, Appearance and Language, each a link with
 * its current value, read from the one ThemeService and LocaleService state (never a copy). Nothing here is a Company
 * or Platform setting, and no unavailable account or business setting is offered.
 */
@Component({
  selector: 'adm-settings-hub-page',
  imports: [RouterLink, TranslocoPipe, NwIcon],
  templateUrl: './settings-hub.page.html',
  styleUrl: './settings-hub.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'settings-hub' },
})
export class SettingsHubPage {
  private readonly theme = inject(ThemeService);
  private readonly locale = inject(LocaleService);

  protected readonly modeKey = computed(() => MODE_KEYS[this.theme.preference()]);
  protected readonly accentKey = computed(() => ACCENT_KEYS[this.theme.accent()]);
  protected readonly currentLocale = this.locale.locale;
  protected readonly language = computed(() => LOCALE_ENDONYMS[this.locale.locale()]);
}
