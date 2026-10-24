import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { retryOf } from '../../../../core/actions/action-failure';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  type OperatorCreateAction,
  createFailureKey,
  isDuplicateContact,
} from '../../application/operator-create.action';
import {
  CONTACT_KINDS,
  ContactKind,
  ContactProblem,
  parseNewOperatorContact,
} from '../../domain/create-operator.model';
import { OperatorContact, contactText } from '../../domain/operator.model';

/** Catalog keys, listed in full (never built at runtime). */
const KIND_KEYS = {
  email: 'operators.create.kindEmail',
  phone: 'operators.create.kindPhone',
} as const satisfies Record<ContactKind, string>;

const HINT_KEYS = {
  email: 'operators.create.emailHint',
  phone: 'operators.create.phoneHint',
} as const satisfies Record<ContactKind, string>;

const PROBLEM_KEYS = {
  email: { required: 'operators.create.emailRequired', invalid: 'operators.create.emailInvalid' },
  phone: { required: 'operators.create.phoneRequired', invalid: 'operators.create.phoneInvalid' },
} as const satisfies Record<ContactKind, Record<ContactProblem, string>>;

/** How each contact is typed: always left to right, never autofilled from the owner's own details. */
const INPUTS = {
  email: { type: 'email', inputmode: 'email' },
  phone: { type: 'tel', inputmode: 'tel' },
} as const satisfies Record<ContactKind, object>;

/**
 * The "Create an operator" dialog (P6-S4 design, artboards CreateForm, Validation, Verify, Duplicate, Unknown,
 * MobileEn): one contact, an email address OR a phone number (switching clears the other, so both are never sent);
 * then the owner's verification for `operator.create` (authenticator code), pending (cannot be dismissed), and the
 * result. Success closes it (the action opens the new operator's page). A taken contact brings the form back saying
 * only that it is taken. After a lost answer it says what the DEMO directory now shows, never that the lost request
 * created anything; a new attempt is a separate button that verifies again. Driven by the action's `ActionRun`; the
 * dialog owns only the typed values and focus.
 */
@Component({
  selector: 'adm-operator-create-dialog',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDialog,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
  ],
  templateUrl: './operator-create-dialog.html',
  styleUrl: './operator-create-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorCreateDialog {
  protected readonly action = inject<OperatorCreateAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly reconciliation = this.action.reconciliation;
  protected readonly kinds = CONTACT_KINDS;
  protected readonly kindKeys = KIND_KEYS;
  protected readonly hintKeys = HINT_KEYS;
  protected readonly inputs = INPUTS;

  protected readonly kind = signal<ContactKind>('email');
  protected readonly value = signal('');
  protected readonly code = signal('');
  /** The contact last submitted (normalized): what the verification is for and what a reload searches for. */
  protected readonly sent = signal<OperatorContact | null>(null);
  /** The client-side checks, shown once the person tried to submit. */
  private readonly submitted = signal(false);
  /** The demo verification code (demo builds only, from the demo bindings; never in a production bundle). */
  protected readonly demoCode = signal<string | null>(null);

  private readonly valueInput = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly mainButton = viewChild<ElementRef<HTMLButtonElement>>('mainButton');

  protected readonly sentText = computed(() => {
    const sent = this.sent();
    return sent === null ? '' : contactText(sent);
  });

  protected readonly fieldError = computed(() => {
    if (!this.submitted()) return null;
    const parsed = parseNewOperatorContact(this.kind(), this.value());
    return 'problem' in parsed ? PROBLEM_KEYS[this.kind()][parsed.problem] : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    if (state.phase === 'failed') return state.failure;
    if (state.phase === 'verifying') return state.failure;
    return null;
  });

  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? createFailureKey(failure) : null;
  });

  protected readonly retryAfter = computed(() => {
    const failure = this.failure();
    return failure?.kind === 'rateLimited' ? failure.retryAfterSeconds : undefined;
  });

  /** The form comes back for a refused contact: malformed (`400`) or already taken (`409`). */
  protected readonly formFailure = computed(() => {
    const failure = this.state().phase === 'failed' ? this.failure() : null;
    return failure !== null && (failure.kind === 'validation' || isDuplicateContact(failure))
      ? failure
      : null;
  });

  /** The operator the reload found with the contact (after a lost answer), or `null`. */
  protected readonly foundId = computed(() => {
    const known = this.reconciliation();
    return known?.state === 'found' ? known.operatorId : null;
  });

  protected readonly lost = computed(() => this.failure()?.kind === 'outcomeUnknown');

  /** "Try again" after a failure that allows it; after a lost answer only once the reload found nothing. */
  protected readonly retryable = computed(() => {
    const state = this.state();
    if (state.phase !== 'failed') return false;
    if (state.failure.kind === 'outcomeUnknown') return this.reconciliation()?.state === 'notFound';
    const retry = retryOf(state.failure);
    return retry === 'resend' || retry === 'verify';
  });

  protected readonly busy = computed(() => {
    const state = this.state();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  });

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step =
        state.phase === 'verifying'
          ? `verifying:${state.busy}:${state.failure?.kind ?? ''}`
          : state.phase;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(state.phase), { injector: this.injector });
    });
  }

  protected onKind(kind: ContactKind): void {
    if (kind === this.kind()) return;
    // One contact only: the other one is cleared, never kept to be sent along.
    this.kind.set(kind);
    this.value.set('');
    this.submitted.set(false);
  }

  protected onValue(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    this.submitted.set(true);
    const parsed = parseNewOperatorContact(this.kind(), this.value());
    if ('problem' in parsed) {
      afterNextRender(() => this.valueInput()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    // The normalized value is what is sent, and what the field now shows.
    this.value.set(contactText(parsed.contact));
    this.sent.set(parsed.contact);
    this.code.set('');
    this.action.run.submit(parsed.contact);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    this.action.run.verify({ method: 'totp', code: this.code() });
  }

  protected back(): void {
    this.action.run.back();
  }

  protected tryAgain(): void {
    this.code.set('');
    this.action.retry();
  }

  protected checkAgain(): void {
    const sent = this.sent();
    if (sent !== null) this.action.checkAgain(sent);
  }

  protected openFound(operatorId: string): void {
    this.action.openFound(operatorId);
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  private focusFor(phase: string): void {
    if (phase === 'editing' || (phase === 'failed' && this.formFailure() !== null))
      this.valueInput()?.nativeElement.focus();
    else if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
