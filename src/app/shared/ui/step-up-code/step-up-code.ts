import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  booleanAttribute,
  computed,
  input,
  model,
  viewChild,
} from '@angular/core';
import { NwControl, NwFormField } from '../form-field/form-field';
import { NwIcon } from '../icon/icon';

/**
 * The digits of an authenticator-app code: Core's TOTP factor (`otpauth` `digits=6`, docs/CORE-INTEGRATION.md §4) and
 * the `/^\d{6}$/` shape every existing Admin step-up entry checks. Used here only to recognise a pasted code.
 */
export const NW_STEP_UP_CODE_LENGTH = 6;

/** The component's copy, already localized by the caller (it owns none). */
export interface NwStepUpCodeLabels {
  /** Above the purpose, e.g. "This verification is only for". */
  readonly purposeIntro: string;
  readonly label: string;
  readonly hint: string;
  /** Shown, as the field's error, while `expired` is set and no other error is. */
  readonly expired: string;
  /** The demo note's title, e.g. "Simulated verification." */
  readonly demoTitle: string;
}

let nextId = 0;

/**
 * The presentation of a step-up code entry (F1-S6a; docs/audits/g0-frontend-gap-audit.md G0-P1-1): what the
 * verification is for, the authenticator-code field and, in demo builds, the simulated-verification note.
 *
 * Presentational only. It holds the typed code in the caller's `code` model and nothing else: it obtains no grant or
 * receipt, chooses no purpose (the caller passes the purpose's localized description), calls no gateway, never stores
 * the code, and never submits or retries. The caller's `<form>` submits it (Enter) and decides what a failure means;
 * `error` and `expired` only show it. A pasted code is accepted with its spaces or hyphens removed when what remains
 * is exactly the code's digits; any other paste is the browser's own.
 */
@Component({
  selector: 'nw-step-up-code',
  imports: [NwControl, NwFormField, NwIcon],
  templateUrl: './step-up-code.html',
  styleUrl: './step-up-code.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-step-up-code' },
})
export class NwStepUpCode {
  readonly labels = input.required<NwStepUpCodeLabels>();
  /** The localized description of what this one verification is for (the caller's purpose); omitted, none is shown. */
  readonly purpose = input<string>();
  /** The typed code, as typed (the caller sends it). */
  readonly code = model('');
  /** A localized error about the code (for example a refused verification); marks the field invalid. */
  readonly error = input<string>();
  /** The verification expired: shows `labels.expired` unless another error is shown. */
  readonly expired = input(false, { transform: booleanAttribute });
  /** The verification is being checked: the code is read only and the field is marked busy. */
  readonly busy = input(false, { transform: booleanAttribute });
  /** No code can be entered (for example the action is not available). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** The demo builds' note, already localized with the demo code; `null` outside a demo build. */
  readonly demoNote = input<string | null>(null);
  /** The native control's name. */
  readonly name = input('step-up-code');
  readonly length = input(NW_STEP_UP_CODE_LENGTH);

  protected readonly purposeId = `nw-step-up-code-${nextId++}-purpose`;
  protected readonly shownError = computed(
    () => this.error() || (this.expired() ? this.labels().expired : undefined),
  );

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    // The field shows the model, also when the caller resets it in the same tick as an input (a `[value]` binding
    // would keep the typed text there, as its last rendered value did not change).
    afterRenderEffect({
      write: () => {
        const value = this.code();
        const element = this.input().nativeElement;
        if (element.value !== value) element.value = value;
      },
    });
  }

  /** Moves focus to the code (the caller decides when). */
  focus(): void {
    this.input().nativeElement.focus();
  }

  protected onInput(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected onPaste(event: ClipboardEvent): void {
    if (this.busy() || this.disabled()) return;
    const digits = (event.clipboardData?.getData('text') ?? '').replace(/[\s-]/g, '');
    if (!new RegExp(`^\\d{${this.length().toString()}}$`).test(digits)) return;
    event.preventDefault();
    (event.target as HTMLInputElement).value = digits;
    this.code.set(digits);
  }
}
