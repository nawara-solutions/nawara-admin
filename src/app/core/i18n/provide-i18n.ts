import { EnvironmentProviders, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { CatalogLoader } from './catalog.loader';
import { DEFAULT_LOCALE, LOCALES } from './locale';
import { LocaleService } from './locale.service';

/** Transloco plus the initial locale and direction, loaded before the first render (docs/ARCHITECTURE.md §16, §17). */
export function provideI18n(): EnvironmentProviders[] {
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
  ];
}
