import { InjectionToken, Signal, signal } from '@angular/core';

/**
 * The BCP 47 tag that `Intl` formatting uses, as a signal (docs/ARCHITECTURE.md §17, §23). Provided by the application
 * from its locale service (Arabic: `ar-u-nu-latn`, Latin digits); `shared/` never imports `core/`.
 */
export const NW_FORMATTING_LOCALE = new InjectionToken<Signal<string>>('NW_FORMATTING_LOCALE', {
  factory: () => signal('en'),
});
