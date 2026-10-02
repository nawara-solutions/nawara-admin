import {
  EnvironmentProviders,
  Provider,
  computed,
  inject,
  isDevMode,
  provideAppInitializer,
} from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { CatalogLoader } from './catalog.loader';
import { NW_FORMATTING_LOCALE } from '../../shared/format/formatting-locale';
import { DEFAULT_LOCALE, LOCALES, formattingLocaleOf } from './locale';
import { LocaleService } from './locale.service';

/** Transloco plus the initial locale and direction, loaded before the first render (docs/ARCHITECTURE.md §16, §17). */
export function provideI18n(): (EnvironmentProviders | Provider)[] {
  return [
    ...provideTransloco({
      config: {
        availableLangs: [...LOCALES],
        defaultLang: DEFAULT_LOCALE,
        fallbackLang: DEFAULT_LOCALE,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { logMissingKey: isDevMode(), useFallbackTranslation: true },
      },
      loader: CatalogLoader,
    }),
    provideAppInitializer(() => inject(LocaleService).initialize()),
    // The shared formatting pipes follow the UI locale (Arabic: Latin digits, D-A2-3).
    {
      provide: NW_FORMATTING_LOCALE,
      useFactory: () => {
        const locale = inject(LocaleService);
        return computed(() => formattingLocaleOf(locale.locale()));
      },
    },
  ];
}
