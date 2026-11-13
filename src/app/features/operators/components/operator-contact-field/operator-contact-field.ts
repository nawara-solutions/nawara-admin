import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { ContactKind } from '../../domain/create-operator.model';

const HINT_KEYS = {
  email: 'operators.create.emailHint',
  phone: 'operators.create.phoneHint',
} as const satisfies Record<ContactKind, string>;

const INPUTS = {
  email: { type: 'email', inputmode: 'email' },
  phone: { type: 'tel', inputmode: 'tel' },
} as const satisfies Record<ContactKind, object>;

/**
 * The new operator's contact field (P6-S4), extracted from the creation dialog with its styles (WP-5.2b): an email, or
 * a Tunisian mobile number typed as 8 digits after the fixed `+216` and shown in digit boxes. Presentation only: the
 * dialog owns the kind, the value, its normalization and validation, and the focus; this component renders them and
 * reports each keystroke. Its host takes no box (`display: contents`), so the field and the phone hint stay items of
 * the dialog's layout exactly as before.
 */
@Component({
  selector: 'adm-operator-contact-field',
  imports: [TranslocoPipe, NwControl, NwFormField, NwIcon],
  templateUrl: './operator-contact-field.html',
  styleUrl: './operator-contact-field.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorContactField {
  readonly kind = input.required<ContactKind>();
  readonly value = input.required<string>();
  /** The field's label, already translated. */
  readonly label = input.required<string>();
  /** The field's error, already translated; none when valid or not yet submitted. */
  readonly error = input<string>();
  /** The id of an alert describing a refusal, referenced by the control. */
  readonly errorRef = input<string>();
  /** Each `input` event of the control; the dialog normalizes and stores the value. */
  readonly contactInput = output<Event>();

  protected readonly hintKeys = HINT_KEYS;
  protected readonly inputs = INPUTS;
  protected readonly digits = [1, 2, 3, 4, 5, 6, 7, 8] as const;
  private readonly control = viewChild.required<ElementRef<HTMLInputElement>>('control');

  focus(): void {
    this.control().nativeElement.focus();
  }
}
