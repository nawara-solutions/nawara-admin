import { Pipe, PipeTransform, inject } from '@angular/core';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { Money } from '../domain/assistance.model';

const formats = new Map<string, Intl.NumberFormat>();

/**
 * `{{ money | assistanceMoney }}`: an amount Core states in MINOR units of its ISO 4217 currency, shown in the active
 * formatting locale ("45.000 TND" has three decimals). Display only: it never adds, splits or converts an amount. LOCAL to
 * Assistance (docs/ARCHITECTURE.md §31): no other page shows a Core amount yet.
 */
@Pipe({ name: 'assistanceMoney', pure: false })
export class AssistanceMoneyPipe implements PipeTransform {
  private readonly locale = inject(NW_FORMATTING_LOCALE);

  transform(money: Money): string {
    const key = `${this.locale()}|${money.currency}`;
    let format = formats.get(key);
    if (!format)
      formats.set(
        key,
        (format = new Intl.NumberFormat(this.locale(), {
          style: 'currency',
          currency: money.currency,
          currencyDisplay: 'code',
        })),
      );
    const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
    return format.format(money.amount / 10 ** digits);
  }
}
