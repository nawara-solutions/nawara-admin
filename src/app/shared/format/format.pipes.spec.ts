import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NW_CLOCK } from './clock';
import { NW_FORMATTING_LOCALE } from './formatting-locale';
import { NwDatePipe, NwNumberPipe } from './format.pipes';

const NOW = new Date(2026, 9, 2, 15, 0).getTime(); // local time

function pipes(locale: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: NW_FORMATTING_LOCALE, useValue: signal(locale) },
      { provide: NW_CLOCK, useValue: () => NOW },
    ],
  });
  return TestBed.runInInjectionContext(() => ({
    number: new NwNumberPipe(),
    date: new NwDatePipe(),
  }));
}

describe('formatting pipes', () => {
  it('formats numbers and percentages in the active locale', () => {
    const { number } = pipes('en');
    expect(number.transform(1284)).toBe('1,284');
    expect(number.transform(12, 'percent')).toBe('12%');
  });

  it('signs changes, and leaves zero unsigned', () => {
    const { number } = pipes('en');
    expect(number.transform(8, 'signed')).toBe('+8');
    expect(number.transform(-3, 'signed')).toBe('-3');
    expect(number.transform(0, 'signed')).toBe('0');
    expect(number.transform(50, 'signed-percent')).toBe('+50%');
  });

  it('keeps Latin digits in Arabic (D-A2-3)', () => {
    const { number } = pipes('ar-u-nu-latn');
    const formatted = number.transform(1284);
    expect(/[\u0660-\u0669]/.test(formatted)).toBe(false); // no Arabic-Indic digits
    expect(formatted.replace(/\D/g, '')).toBe('1284');
  });

  it('never shifts a calendar day across time zones', () => {
    const { date } = pipes('en');
    expect(date.transform('2026-09-01', 'day-month')).toBe('Sep 1');
  });

  it('formats recent instants as a time today, "Yesterday", then a date', () => {
    const { date } = pipes('en');
    const today = new Date(2026, 9, 2, 10, 42).toISOString();
    const yesterday = new Date(2026, 9, 1, 16, 5).toISOString();
    const older = new Date(2026, 8, 25, 9, 0).toISOString();
    expect(date.transform(today, 'recent')).toMatch(/10:42/);
    expect(date.transform(yesterday, 'recent')).toBe('Yesterday');
    expect(date.transform(older, 'recent')).toBe('Sep 25');
  });

  it('localizes "yesterday" (French, Arabic)', () => {
    const yesterday = new Date(2026, 9, 1, 16, 5).toISOString();
    expect(pipes('fr').date.transform(yesterday, 'recent')).toBe('Hier');
    TestBed.resetTestingModule();
    expect(pipes('ar-u-nu-latn').date.transform(yesterday, 'recent')).toBe('أمس');
  });

  it('formats relative instants in minutes and hours within a day, then calendar days', () => {
    const { date } = pipes('en');
    expect(date.transform(new Date(NOW - 20 * 60_000).toISOString(), 'relative')).toBe(
      '20 minutes ago',
    );
    expect(date.transform(new Date(NOW - 2 * 3_600_000).toISOString(), 'relative')).toBe(
      '2 hours ago',
    );
    expect(date.transform(new Date(2026, 9, 1, 9, 0).toISOString(), 'relative')).toBe('Yesterday');
    expect(date.transform(new Date(2026, 8, 27, 9, 0).toISOString(), 'relative')).toBe(
      '5 days ago',
    );
  });
});
