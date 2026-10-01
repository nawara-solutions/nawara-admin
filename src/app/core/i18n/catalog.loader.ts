import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Locale, isLocale } from './locale';

// Catalogs are bundled as lazy chunks (no HTTP): one chunk per locale, loaded on first use.
const CATALOGS: Record<Locale, () => Promise<{ default: Translation }>> = {
  en: () => import('../../../i18n/en.json'),
  fr: () => import('../../../i18n/fr.json'),
  ar: () => import('../../../i18n/ar.json'),
};

@Injectable({ providedIn: 'root' })
export class CatalogLoader implements TranslocoLoader {
  async getTranslation(lang: string): Promise<Translation> {
    if (!isLocale(lang)) throw new Error(`Unsupported locale: ${lang}`);
    return (await CATALOGS[lang]()).default;
  }
}
