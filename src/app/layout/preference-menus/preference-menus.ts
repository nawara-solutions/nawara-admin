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
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';
import { AppearanceMenu } from '../appearance/appearance-menu';

/**
 * Language and appearance controls of the top bar and the sign-in pages. The language shows its code (a machine
 * value); Appearance (theme mode and accent palette) is a compact button that opens a popover (AppearanceMenu).
 * `framed` is the larger, outlined variant of the sign-in pages (A4 design): the language is named, with a chevron.
 */
@Component({
  selector: 'adm-preference-menus',
  imports: [
    UpperCasePipe,
    TranslocoPipe,
    NwIcon,
    NwMenu,
    NwMenuItem,
    NwMenuTrigger,
    AppearanceMenu,
  ],
  templateUrl: './preference-menus.html',
  styleUrl: './preference-menus.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'preference-menus', '[class.preference-menus--framed]': 'framed()' },
})
export class PreferenceMenus {
  readonly framed = input(false, { transform: booleanAttribute });

  protected readonly locale = inject(LocaleService);

  protected readonly locales = LOCALES.map((value) => ({ value, name: LOCALE_ENDONYMS[value] }));
  protected readonly currentLanguage = computed(() => LOCALE_ENDONYMS[this.locale.locale()]);

  protected setLocale(locale: Locale): void {
    void this.locale.use(locale);
  }
}
