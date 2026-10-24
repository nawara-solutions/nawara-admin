import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALES, LOCALE_ENDONYMS, Locale, directionOf } from '../../../core/i18n/locale';
import { LocaleService } from '../../../core/i18n/locale.service';

const DIRECTION_KEYS = {
  ltr: 'settings.language.ltr',
  rtl: 'settings.language.rtl',
} as const;

/**
 * Settings → Language (P9-S1): the same LocaleService as the language menu of the top bar and the sign-in pages, so
 * both always show one choice. Choosing applies at once (catalog, `<html lang dir>`, Core's `Accept-Language`) and is
 * kept by the service under its one preference key; this page stores nothing itself.
 *
 * Native radio group inside a fieldset: arrow keys move the choice, and the checked state is what a screen reader
 * announces. Each language is named in itself, in its own language.
 */
@Component({
  selector: 'adm-language-settings-page',
  imports: [TranslocoPipe],
  template: `
    <header class="language-settings__header">
      <p class="language-settings__eyebrow">{{ 'settings.title' | transloco }}</p>
      <h1 class="language-settings__title">{{ 'settings.language.title' | transloco }}</h1>
      <p class="language-settings__subtitle">{{ 'settings.language.subtitle' | transloco }}</p>
    </header>
    <section class="language-settings__card" aria-labelledby="language-settings-heading">
      <h2 id="language-settings-heading" class="nw-visually-hidden">
        {{ 'settings.language.title' | transloco }}
      </h2>
      <fieldset class="language-settings__group">
        <legend class="language-settings__legend">
          {{ 'preferences.language.label' | transloco }}
        </legend>
        @for (option of options; track option.value) {
          <label class="language-settings__option">
            <input
              class="language-settings__input"
              type="radio"
              name="language-settings"
              [value]="option.value"
              [checked]="locale.locale() === option.value"
              (change)="choose(option.value)"
            />
            <span class="language-settings__name" [attr.lang]="option.value">{{
              option.name
            }}</span>
            <span class="language-settings__direction">{{ option.directionKey | transloco }}</span>
          </label>
        }
      </fieldset>
      <p class="language-settings__note">{{ 'settings.language.note' | transloco }}</p>
    </section>
  `,
  styleUrl: './language-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'language-settings' },
})
export class LanguageSettingsPage {
  protected readonly locale = inject(LocaleService);
  protected readonly options = LOCALES.map((value) => ({
    value,
    name: LOCALE_ENDONYMS[value],
    directionKey: DIRECTION_KEYS[directionOf(value)],
  }));

  protected choose(locale: Locale): void {
    void this.locale.use(locale);
  }
}
