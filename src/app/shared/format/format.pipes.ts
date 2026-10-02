import { Pipe, PipeTransform, inject } from '@angular/core';
import { NW_CLOCK } from './clock';
import { NW_FORMATTING_LOCALE } from './formatting-locale';

/*
 * Formatting pipes (docs/ARCHITECTURE.md §23): every number and date goes through `Intl` with the active formatting
 * locale. Impure, because the locale is a signal that changes without the input changing; formatters are cached.
 */

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

const numberFormat = (locale: string, options: Intl.NumberFormatOptions) => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = numberFormats.get(key);
  if (!format) numberFormats.set(key, (format = new Intl.NumberFormat(locale, options)));
  return format;
};

/**
 * `{{ 1284 | nwNumber }}` → "1,284" (en), "1 284" (fr), "1,284" (ar, Latin digits). `percent` takes a whole number;
 * `signed` always shows the sign of a change ("+8", "−3"), and nothing for zero; `signed-percent` does both ("+50%").
 */
@Pipe({ name: 'nwNumber', pure: false })
export class NwNumberPipe implements PipeTransform {
  private readonly locale = inject(NW_FORMATTING_LOCALE);

  transform(
    value: number,
    style: 'decimal' | 'percent' | 'signed' | 'signed-percent' = 'decimal',
  ): string {
    switch (style) {
      case 'percent':
        return numberFormat(this.locale(), { style: 'percent' }).format(value / 100);
      case 'signed-percent':
        return numberFormat(this.locale(), {
          style: 'percent',
          signDisplay: 'exceptZero',
        }).format(value / 100);
      case 'signed':
        return numberFormat(this.locale(), { signDisplay: 'exceptZero' }).format(value);
      case 'decimal':
        return numberFormat(this.locale(), {}).format(value);
    }
  }
}

/**
 * `recent`: time of day for today, "Yesterday" for yesterday, otherwise day and month (local calendar days).
 * `relative`: "2 minutes ago" / "2 hours ago" within a day, then "Yesterday", "3 days ago" (local calendar days).
 */
export type NwDateStyle = 'day-month' | 'time' | 'date-time' | 'recent' | 'relative';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const DATE_OPTIONS = {
  'day-month': { day: 'numeric', month: 'short' },
  time: { hour: '2-digit', minute: '2-digit' },
  'date-time': { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' },
} as const satisfies Record<
  Exclude<NwDateStyle, 'recent' | 'relative'>,
  Intl.DateTimeFormatOptions
>;

const localDay = (time: number) => {
  const d = new Date(time);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * `{{ instant | nwDate: 'time' }}`. Instants are ISO 8601 UTC strings and are shown in the browser's time zone until the
 * time-zone preference exists. A calendar day (`YYYY-MM-DD`) is formatted in UTC, so it never shifts by a day.
 */
@Pipe({ name: 'nwDate', pure: false })
export class NwDatePipe implements PipeTransform {
  private readonly locale = inject(NW_FORMATTING_LOCALE);
  private readonly now = inject(NW_CLOCK);

  transform(value: string, style: NwDateStyle = 'date-time'): string {
    if (style === 'recent') return this.recent(Date.parse(value));
    if (style === 'relative') return this.relative(Date.parse(value));
    return this.format(value, style);
  }

  private relative(time: number): string {
    const elapsed = this.now() - time;
    if (elapsed < HOUR_MS)
      return this.relativeText(-Math.max(1, Math.floor(elapsed / MINUTE_MS)), 'minute');
    if (elapsed < DAY_MS) return this.relativeText(-Math.floor(elapsed / HOUR_MS), 'hour');
    const days = Math.max(1, Math.round((localDay(this.now()) - localDay(time)) / DAY_MS));
    return this.relativeText(-days, 'day');
  }

  private relativeText(value: number, unit: Intl.RelativeTimeFormatUnit): string {
    const text = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' }).format(
      value,
      unit,
    );
    return text.charAt(0).toLocaleUpperCase(this.locale()) + text.slice(1);
  }

  private recent(time: number): string {
    const days = Math.round((localDay(this.now()) - localDay(time)) / DAY_MS);
    if (days === 0) return this.format(new Date(time).toISOString(), 'time');
    if (days === 1) return this.relativeText(-1, 'day');
    return this.format(new Date(time).toISOString(), 'day-month');
  }

  private format(value: string, style: Exclude<NwDateStyle, 'recent' | 'relative'>): string {
    const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const instant = new Date(calendarDay ? `${value}T00:00:00Z` : value);
    const key = `${this.locale()}|${style}|${calendarDay}`;
    let format = dateFormats.get(key);
    if (!format) {
      format = new Intl.DateTimeFormat(this.locale(), {
        ...DATE_OPTIONS[style],
        ...(calendarDay ? { timeZone: 'UTC' } : {}),
      });
      dateFormats.set(key, format);
    }
    return format.format(instant);
  }
}
