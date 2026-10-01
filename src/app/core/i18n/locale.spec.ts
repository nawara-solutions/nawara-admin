import { LOCALES, directionOf, formattingLocaleOf } from './locale';

describe('locale', () => {
  it('formats Arabic numbers and dates with Latin digits 0-9 (D-A2-3)', () => {
    const tag = formattingLocaleOf('ar');
    const number = new Intl.NumberFormat(tag).format(1234567.89);
    const date = new Intl.DateTimeFormat(tag, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, 9, 1)),
    );
    for (const text of [number, date]) {
      expect(text).toMatch(/[0-9]/);
      expect(text).not.toMatch(/[\u0660-\u0669\u06F0-\u06F9]/); // no Arabic-Indic digits
    }
    expect(date).toMatch(/[\u0600-\u06FF]/); // the month name stays Arabic
  });

  it('resolves a formatting tag and a direction for every locale', () => {
    expect(LOCALES.map(formattingLocaleOf)).toEqual(['en', 'fr', 'ar-u-nu-latn']);
    expect(LOCALES.map(directionOf)).toEqual(['ltr', 'ltr', 'rtl']);
  });
});
