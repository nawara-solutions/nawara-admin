import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { AssistanceMoneyPipe } from './assistance-money.pipe';

function pipe(locale: string): AssistanceMoneyPipe {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: NW_FORMATTING_LOCALE, useValue: signal(locale) }],
  });
  return TestBed.runInInjectionContext(() => new AssistanceMoneyPipe());
}

const plain = (value: string) => value.replace(/[\s\u00a0\u202f\u200e\u200f\u061c]/g, ' ').trim();

describe('AssistanceMoneyPipe (A5)', () => {
  it('shows minor units in the currency’s own decimals, in each locale, without changing the amount', () => {
    expect(plain(pipe('en').transform({ amount: 46_500, currency: 'TND' }))).toBe('TND 46.500');
    expect(plain(pipe('fr').transform({ amount: 46_500, currency: 'TND' }))).toBe('46,500 TND');
    expect(plain(pipe('ar-u-nu-latn').transform({ amount: 1_500, currency: 'TND' }))).toContain(
      '1.500',
    );
    expect(plain(pipe('en').transform({ amount: 0, currency: 'TND' }))).toBe('TND 0.000');
    expect(plain(pipe('en').transform({ amount: 1_234, currency: 'EUR' }))).toBe('EUR 12.34');
  });
});
