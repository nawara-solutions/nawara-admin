import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALES, LOCALE_ENDONYMS, Locale } from '../../core/i18n/locale';
import { LocaleService } from '../../core/i18n/locale.service';
import { THEME_PREFERENCES, ThemePreference, ThemeService } from '../../core/theme/theme.service';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';

const THEME_OPTIONS = {
  system: { icon: 'monitor', labelKey: 'preferences.theme.system' },
  light: { icon: 'sun', labelKey: 'preferences.theme.light' },
  dark: { icon: 'moon', labelKey: 'preferences.theme.dark' },
} as const satisfies Record<ThemePreference, { icon: NwIconName; labelKey: string }>;

/**
 * Language and theme controls of the top bar (owner design), over the A2 locale and theme services. The language shows
 * its code (a machine value); the theme is a segmented control that keeps the system preference beside light and dark.
 * `framed` is the larger, outlined variant of the sign-in pages (A4 design): the language is named, with a chevron.
 */
@Component({
  selector: 'adm-preference-menus',
  imports: [UpperCasePipe, TranslocoPipe, NwIcon, NwMenu, NwMenuItem, NwMenuTrigger],
  templateUrl: './preference-menus.html',
  styleUrl: './preference-menus.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'preference-menus', '[class.preference-menus--framed]': 'framed()' },
})
export class PreferenceMenus {
  readonly framed = input(false, { transform: booleanAttribute });

  protected readonly theme = inject(ThemeService);
  protected readonly locale = inject(LocaleService);

  protected readonly locales = LOCALES.map((value) => ({ value, name: LOCALE_ENDONYMS[value] }));
  protected readonly themes = THEME_PREFERENCES.map((value) => ({
    value,
    ...THEME_OPTIONS[value],
  }));
  protected readonly currentLanguage = computed(() => LOCALE_ENDONYMS[this.locale.locale()]);

  protected setLocale(locale: Locale): void {
    void this.locale.use(locale);
  }

  protected setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
  }
}
