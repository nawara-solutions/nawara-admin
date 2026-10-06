import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { parseOperatorIdentifier } from '../../../../core/auth/operator-identifier';
import { RETURN_URL_PARAM } from '../../../../core/auth/return-url';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  AuthFlowFacade,
  ContactConfirmationProblem,
  WORKING_CODE_PATH,
} from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

/** One generic state for every refused code: Core's `operator_code_invalid` never says why. */
const PROBLEMS = {
  invalidCode: { tone: 'danger', icon: 'circle-alert', key: 'auth.contactConfirmation.invalid' },
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.workingCode.verifyRateLimited' },
  unavailable: {
    tone: 'warning',
    icon: 'cloud-off',
    key: 'auth.contactConfirmation.unavailable',
    retry: true,
  },
} as const satisfies Record<ContactConfirmationProblem, Banner>;

const CONFIRMED: Banner = {
  tone: 'success',
  icon: 'circle-check',
  key: 'auth.contactConfirmation.confirmed',
};

export const CONTACT_CONFIRMATION_BANNER_ID = 'contact-confirmation-banner';

/** Six digits, as a string: leading zeroes are kept. */
const CODE_SHAPE = /^\d{6}$/;

/**
 * Confirm your contact (`/login/confirm`, A4-S3 design): a new operator enters the email address or phone number the
 * company owner registered and the confirmation code Core issued, once. Separate from working-code sign-in and from the
 * owner's second factor. Success records the contact as confirmed and opens no session: the operator then requests a
 * working code (nothing is sent automatically). No resend: Core has no route for it (CF-16), so the help text points to
 * the company owner. Fields stay editable after any refusal, including a rate limit (no countdown); only a pending
 * confirmation makes them read-only. No field takes focus on arrival: the card's heading does.
 */
@Component({
  selector: 'adm-contact-confirmation-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    AuthCard,
  ],
  templateUrl: './contact-confirmation.page.html',
  styleUrl: '../working-code/working-code.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'working-code' },
})
export class ContactConfirmationPage {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly bannerId = CONTACT_CONFIRMATION_BANNER_ID;
  protected readonly workingCodePath = WORKING_CODE_PATH;
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly identifier = signal(this.flow.identifierText());
  protected readonly code = signal('');
  private readonly submitted = signal(false);

  protected readonly confirming = computed(() => this.flow.busy() === 'confirmContact');
  protected readonly confirmed = computed(() => this.flow.contactConfirmed());
  private readonly parsed = computed(() => parseOperatorIdentifier(this.identifier()));

  protected readonly identifierError = computed(() => {
    if (!this.submitted()) return null;
    if (this.identifier().trim() === '') return 'auth.workingCode.identifierRequired';
    return this.parsed() === null ? 'auth.workingCode.identifierInvalid' : null;
  });

  protected readonly codeError = computed(() => {
    if (!this.submitted()) return null;
    const code = this.code();
    if (code === '') return 'auth.contactConfirmation.codeRequired';
    return CODE_SHAPE.test(code) ? null : 'auth.contactConfirmation.codeFormat';
  });

  protected readonly banner = computed<Banner | null>(() => {
    if (this.confirmed()) return CONFIRMED;
    const problem = this.flow.confirmationProblem();
    return problem === null ? null : PROBLEMS[problem];
  });

  /** Core refused the code: the code field is invalid and described by the generic banner (not a second message). */
  protected readonly invalidRef = computed(() =>
    this.flow.confirmationProblem() === 'invalidCode' ? this.bannerId : undefined,
  );

  /** The heading takes focus again once the contact is confirmed. */
  protected readonly step = computed(() => (this.confirmed() ? 'confirmed' : 'confirm'));

  constructor() {
    this.flow.setReturnUrl(this.query().get(RETURN_URL_PARAM));
    this.flow.startContactConfirmation();
  }

  protected onIdentifier(event: Event): void {
    this.identifier.set((event.target as HTMLInputElement).value);
  }

  /** Spaces from a pasted code are formatting; the code stays a string. */
  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.flow.busy() !== null) return;
    this.submitted.set(true);
    const identifier = this.parsed();
    if (this.identifierError() !== null || this.codeError() !== null || identifier === null) return;
    await this.flow.confirmContact(this.identifier().trim(), identifier, this.code());
    if (this.flow.confirmationProblem() === 'invalidCode') {
      this.code.set('');
      this.submitted.set(false);
    }
  }

  protected back(): void {
    void this.flow.backToSignIn();
  }
}
