import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { RETURN_URL_PARAM } from '../../../../core/auth/return-url';
import { parseOperatorIdentifier } from '../../../../core/auth/operator-identifier';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  AuthFlowFacade,
  CONTACT_CONFIRMATION_PATH,
  CodeRequestProblem,
} from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

/** `invalid` is a field error, not a banner. */
const BANNERS = {
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.workingCode.requestRateLimited' },
  unavailable: { tone: 'warning', icon: 'cloud-off', key: 'auth.banner.unavailable', retry: true },
} as const satisfies Partial<Record<CodeRequestProblem, Banner>>;

/**
 * Request a working code (`/login/code`, A4-S2 design): an operator's email address or phone number, checked in the
 * browser by Core's own rules (UX only), then Core's request. The field stays editable after any refusal, including a
 * rate limit (no lockout, no countdown); only a pending request makes it read-only and blocks a second one. No field
 * takes focus on arrival: the card's heading does, as on every sign-in page. A new operator whose contact is not
 * confirmed yet follows the "Confirm your contact" link (A4-S3) first.
 */
@Component({
  selector: 'adm-working-code-request-page',
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
  templateUrl: './working-code-request.page.html',
  styleUrl: './working-code.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'working-code' },
})
export class WorkingCodeRequestPage {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly confirmationPath = CONTACT_CONFIRMATION_PATH;
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly identifier = signal(this.flow.identifierText());
  private readonly submitted = signal(false);

  protected readonly busy = computed(() => this.flow.busy() === 'requestCode');
  private readonly parsed = computed(() => parseOperatorIdentifier(this.identifier()));

  protected readonly identifierError = computed(() => {
    if (this.flow.codeRequestProblem() === 'invalid') return 'auth.workingCode.identifierInvalid';
    if (!this.submitted()) return null;
    if (this.identifier().trim() === '') return 'auth.workingCode.identifierRequired';
    return this.parsed() === null ? 'auth.workingCode.identifierInvalid' : null;
  });

  protected readonly banner = computed<Banner | null>(() => {
    const problem = this.flow.codeRequestProblem();
    return problem !== null && problem in BANNERS ? BANNERS[problem as keyof typeof BANNERS] : null;
  });

  constructor() {
    this.flow.setReturnUrl(this.query().get(RETURN_URL_PARAM));
  }

  protected onIdentifier(event: Event): void {
    this.identifier.set((event.target as HTMLInputElement).value);
    if (this.flow.codeRequestProblem() === 'invalid') this.flow.dismissProblems();
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.busy()) return;
    this.submitted.set(true);
    const identifier = this.parsed();
    if (this.identifierError() !== null || identifier === null) return;
    await this.flow.requestWorkingCode(this.identifier().trim(), identifier);
  }

  protected back(): void {
    void this.flow.backToSignIn();
  }
}
