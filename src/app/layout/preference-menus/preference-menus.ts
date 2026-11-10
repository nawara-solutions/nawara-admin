import { CdkMenuTrigger } from '@angular/cdk/menu';
import { UpperCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  viewChild,
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
  private readonly screenshotLanguageMenu = viewChild.required(CdkMenuTrigger);

  constructor() {
    const destroyRef = inject(DestroyRef);
    // TEMPORARY screenshot aid: pin the language menu open on outside click and blur.
    // Revert this constructor, query and their imports after the screenshot.
    afterNextRender(() => {
      const trigger = this.screenshotLanguageMenu();
      const close = trigger.close;
      trigger.close = () => {
        // Keep the language panel visible for the screenshot.
      };
      destroyRef.onDestroy(() => {
        trigger.close = close;
      });
    });
  }

  readonly framed = input(false, { transform: booleanAttribute });

  protected readonly locale = inject(LocaleService);

  protected readonly locales = LOCALES.map((value) => ({ value, name: LOCALE_ENDONYMS[value] }));
  protected readonly currentLanguage = computed(() => LOCALE_ENDONYMS[this.locale.locale()]);

  protected setLocale(locale: Locale): void {
    void this.locale.use(locale);
  }
}
