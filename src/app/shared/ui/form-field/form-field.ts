import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  ElementRef,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  contentChild,
  inject,
  input,
} from '@angular/core';
import { NwIcon } from '../icon/icon';

let nextId = 0;

/**
 * Label, control, hint and error as one accessible unit (docs/ARCHITECTURE.md §22, §25): the label targets the
 * control, hint and error are wired through `aria-describedby`, and an error sets `aria-invalid`. Works with any
 * forms API because it only decorates the native control. Owns no copy: label, hint and error are inputs.
 *
 * Encapsulation is off so the styles reach the projected native control; every selector is BEM-scoped
 * (`.nw-form-field*`, `.nw-control*`), which keeps them from leaking.
 */
@Component({
  selector: 'nw-form-field',
  imports: [NwIcon],
  templateUrl: './form-field.html',
  styleUrl: './form-field.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-form-field' },
})
export class NwFormField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  /** Localized error message; when set, the control is marked invalid. */
  readonly error = input<string>();
  /** Shows the required marker and sets `aria-required`; validation itself stays with the forms API. */
  readonly required = input(false, { transform: booleanAttribute });

  readonly controlId = `nw-control-${nextId++}`;
  protected readonly hintId = `${this.controlId}-hint`;
  protected readonly errorId = `${this.controlId}-error`;

  readonly invalid = computed(() => Boolean(this.error()));
  readonly describedBy = computed(() => {
    const ids = [this.hint() ? this.hintId : null, this.error() ? this.errorId : null].filter(
      Boolean,
    );
    return ids.length > 0 ? ids.join(' ') : null;
  });

  private readonly control = contentChild(NwControl);
  protected readonly isSelect = computed(() => this.control()?.kind === 'select');
}

/** Marks the native control inside an `nw-form-field`: `<input nwControl>`, `<select nwControl>`, `<textarea nwControl>`. */
@Directive({
  selector: 'input[nwControl], select[nwControl], textarea[nwControl]',
  host: {
    class: 'nw-control',
    '[class.nw-control--select]': "kind === 'select'",
    '[id]': 'field.controlId',
    '[attr.aria-describedby]': 'field.describedBy()',
    '[attr.aria-invalid]': 'field.invalid() || null',
    '[attr.aria-required]': 'field.required() || null',
  },
})
export class NwControl {
  protected readonly field = inject(NwFormField);
  readonly kind = (inject(ElementRef).nativeElement as HTMLElement).tagName.toLowerCase();
}
