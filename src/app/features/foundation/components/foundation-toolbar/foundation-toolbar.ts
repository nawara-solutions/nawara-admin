import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALES, LOCALE_ENDONYMS, Locale } from '../../../../core/i18n/locale';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { ThemePreference, ThemeService } from '../../../../core/theme/theme.service';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly icon: NwIconName;
  readonly labelKey: string;
}

/** Brand plus theme and language switches for the A2 preview. The A3 top bar takes over this role. */
@Component({
  selector: 'adm-foundation-toolbar',
  imports: [TranslocoPipe, NwBrandMark, NwIcon],
  templateUrl: './foundation-toolbar.html',
  styleUrl: './foundation-toolbar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'foundation-toolbar', role: 'banner' },
})
export class FoundationToolbar {
  protected readonly theme = inject(ThemeService);
  protected readonly locale = inject(LocaleService);

  protected readonly themeOptions: readonly ThemeOption[] = [
    { value: 'system', icon: 'monitor', labelKey: 'preferences.theme.system' },
    { value: 'light', icon: 'sun', labelKey: 'preferences.theme.light' },
    { value: 'dark', icon: 'moon', labelKey: 'preferences.theme.dark' },
  ];

  protected readonly locales = LOCALES.map((value) => ({ value, name: LOCALE_ENDONYMS[value] }));

  protected setTheme(preference: ThemePreference): void {
    this.theme.setPreference(preference);
  }

  protected setLocale(locale: Locale): void {
    void this.locale.use(locale);
  }
}
