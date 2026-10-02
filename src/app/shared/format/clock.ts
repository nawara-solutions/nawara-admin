import { InjectionToken } from '@angular/core';

/** The current time in epoch milliseconds, injectable so relative formatting and demo data can be tested. */
export const NW_CLOCK = new InjectionToken<() => number>('NW_CLOCK', {
  factory: () => () => Date.now(),
});
