/** Supported UI locales (docs/ARCHITECTURE.md §16). Machine values: never translated. */
export const LOCALES = ['en', 'fr', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export type Direction = 'ltr' | 'rtl';

export const DEFAULT_LOCALE: Locale = 'en';

const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

export const isLocale = (value: string | null | undefined): value is Locale =>
  LOCALES.some((locale) => locale === value);

export const directionOf = (locale: Locale): Direction => (RTL_LOCALES.has(locale) ? 'rtl' : 'ltr');

/** Each language named in itself, so it is recognizable from any UI locale; identical in every catalog by design. */
export const LOCALE_ENDONYMS = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
} as const satisfies Record<Locale, string>;

/**
 * The BCP 47 tag to format numbers and dates with (`Intl.*`). Arabic uses Latin digits 0–9, an approved owner
 * decision (D-A2-3): `-u-nu-latn` selects the Latin numbering system while month names, separators and order stay Arabic.
 */
export const FORMATTING_LOCALES = {
  en: 'en',
  fr: 'fr',
  ar: 'ar-u-nu-latn',
} as const satisfies Record<Locale, string>;

export const formattingLocaleOf = (locale: Locale): string => FORMATTING_LOCALES[locale];
