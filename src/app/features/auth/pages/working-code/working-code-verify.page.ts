import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { identifierText } from '../../../../core/auth/operator-identifier';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  AuthFlowFacade,
  WORKING_CODE_PATH,
  WorkingCodeNotice,
  WorkingCodeProblem,
} from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';
import { IdentityRow } from '../../components/identity-row/identity-row';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

/** One generic state for every refused code: Core's `operator_code_invalid` never says why. */
const PROBLEMS = {
  invalidCode: { tone: 'danger', icon: 'circle-alert', key: 'auth.workingCode.invalid' },
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.workingCode.verifyRateLimited' },
  unavailable: { tone: 'warning', icon: 'cloud-off', key: 'auth.banner.unavailable', retry: true },
} as const satisfies Record<WorkingCodeProblem, Banner>;

/** Neither notice confirms eligibility or delivery: Core's 204 says nothing about the account. */
const NOTICES = {
  requested: { tone: 'info', icon: 'info', key: 'auth.workingCode.requested' },
  requestedAgain: { tone: 'info', icon: 'info', key: 'auth.workingCode.requestedAgain' },
} as const satisfies Record<WorkingCodeNotice, Banner>;

const REQUESTING_AGAIN: Banner = {
  tone: 'info',
  icon: 'refresh-cw',
  key: 'auth.workingCode.requestingAgain',
};
const ACCEPTED: Banner = { tone: 'success', icon: 'circle-check', key: 'auth.mfa.accepted' };

const CODE_SHAPE = /^[0-9]{6}$/;

/** The banner's id: an invalid code marks the field invalid and describes it by this banner. */
export const WORKING_CODE_BANNER_ID = 'working-code-banner';

/**
 * Verify a working code (`/login/code/verify`, A4-S2 design). The code is a 6-digit string (leading zeroes kept; never
 * a number), in one field with the numeric keyboard and one-time-code autofill. Every refusal is one generic banner;
 * there is no expiry timer and no resend cooldown, because Core gives neither. Requesting another code replaces the
 * previous one and is blocked only while a request is pending. Without a requested code (a reload, a typed URL) it
 * returns to the request page.
 */
@Component({
  selector: 'adm-working-code-verify-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    AuthCard,
    IdentityRow,
  ],
  templateUrl: './working-code-verify.page.html',
  styleUrl: './working-code.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'working-code' },
})
export class WorkingCodeVerifyPage {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly bannerId = WORKING_CODE_BANNER_ID;

  protected readonly code = signal('');
  private readonly submitted = signal(false);
  /** What "Try again" repeats after an unavailable service. */
  private readonly lastAction = signal<'verify' | 'requestAgain'>('verify');

  protected readonly verifying = computed(() => this.flow.busy() === 'verifyWorkingCode');
  protected readonly requestingAgain = computed(() => this.flow.busy() === 'resendCode');
  protected readonly pending = computed(() => this.flow.busy() !== null);

  protected readonly identifier = computed(() => {
    const identifier = this.flow.workingCodeIdentifier();
    return identifier === null ? '' : identifierText(identifier);
  });

  protected readonly banner = computed<Banner | null>(() => {
    if (this.flow.accepted()) return ACCEPTED;
    const problem = this.flow.workingCodeProblem();
    if (problem !== null) return PROBLEMS[problem];
    if (this.requestingAgain()) return REQUESTING_AGAIN;
    const notice = this.flow.workingCodeNotice();
    return notice === null ? null : NOTICES[notice];
  });

  protected readonly codeError = computed(() => {
    if (!this.submitted()) return null;
    const code = this.code();
    if (code === '') return 'auth.workingCode.codeRequired';
    return CODE_SHAPE.test(code) ? null : 'auth.workingCode.codeFormat';
  });

  /** Core refused the code: the field is invalid and described by the generic banner (not a second message). */
  protected readonly invalidRef = computed(() =>
    this.flow.workingCodeProblem() === 'invalidCode' ? this.bannerId : undefined,
  );

  /** The heading takes focus again once the code is accepted. */
  protected readonly step = computed(() => (this.flow.accepted() ? 'accepted' : 'code'));

  constructor() {
    if (this.flow.workingCodeIdentifier() === null) {
      void inject(Router).navigate([WORKING_CODE_PATH], { replaceUrl: true });
    }
  }

  /** Spaces from a pasted code are formatting; the code stays a string. */
  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.pending()) return;
    this.submitted.set(true);
    if (this.codeError() !== null) return;
    this.lastAction.set('verify');
    await this.flow.verifyWorkingCode(this.code());
    if (this.flow.workingCodeProblem() === 'invalidCode') {
      this.code.set('');
      this.submitted.set(false);
    }
  }

  protected requestAgain(): void {
    if (this.pending()) return;
    this.code.set('');
    this.submitted.set(false);
    this.lastAction.set('requestAgain');
    void this.flow.requestWorkingCodeAgain();
  }

  protected retry(): void {
    if (this.lastAction() === 'requestAgain') this.requestAgain();
    else void this.submit();
  }

  protected change(): void {
    void this.flow.changeIdentifier();
  }

  protected back(): void {
    void this.flow.backToSignIn();
  }
}
