import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LOCALES, LOCALE_ENDONYMS, Locale, directionOf } from '../../../core/i18n/locale';
import { LocaleService } from '../../../core/i18n/locale.service';
import { NwIcon } from '../../../shared/ui/icon/icon';

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
  imports: [TranslocoPipe, NwIcon],
  template: `
    <header class="language-settings__header">
      <nw-icon name="globe" size="lg" />
      <div class="language-settings__titles">
        <h2 id="language-settings-heading" class="language-settings__title">
          {{ 'settings.language.title' | transloco }}
        </h2>
        <p class="language-settings__subtitle">{{ 'settings.language.subtitle' | transloco }}</p>
      </div>
    </header>
    <section class="language-settings__choices" aria-labelledby="language-settings-heading">
      <fieldset class="language-settings__group" aria-describedby="language-settings-note">
        <legend class="nw-visually-hidden">
          {{ 'preferences.language.label' | transloco }}
        </legend>
        @for (option of options; track option.value) {
          <label class="language-settings__option">
            <input
              class="nw-visually-hidden"
              type="radio"
              name="language-settings"
              [value]="option.value"
              [attr.aria-labelledby]="'language-settings-name-' + option.value"
              [attr.aria-describedby]="'language-settings-direction-' + option.value"
              [checked]="locale.locale() === option.value"
              (change)="choose(option.value)"
            />
            <span class="language-settings__globe"><nw-icon name="globe" size="lg" /></span>
            <span class="language-settings__identity">
              <span
                class="language-settings__name"
                [id]="'language-settings-name-' + option.value"
                [attr.lang]="option.value"
                [attr.dir]="option.direction"
                >{{ option.name }}</span
              >
              <span
                class="language-settings__direction"
                [id]="'language-settings-direction-' + option.value"
                >{{ option.directionKey | transloco }}</span
              >
            </span>
            @if (locale.locale() === option.value) {
              <nw-icon class="language-settings__check" name="circle-check" size="sm" />
            }
          </label>
        }
      </fieldset>
    </section>
    <p class="language-settings__note" id="language-settings-note">
      <nw-icon name="info" size="sm" />
      <span>{{ 'settings.language.note' | transloco }}</span>
    </p>
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
    direction: directionOf(value),
    directionKey: DIRECTION_KEYS[directionOf(value)],
  }));

  protected choose(locale: Locale): void {
    void this.locale.use(locale);
  }
}
