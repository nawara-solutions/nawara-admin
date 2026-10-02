import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  RETURN_URL_PARAM,
  SIGN_IN_REASON_PARAM,
  SignInReason,
  isSignInReason,
} from '../../../../core/auth/return-url';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { AuthFlowFacade, SignInProblem } from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

const PROBLEM_BANNERS = {
  failed: { tone: 'danger', icon: 'circle-alert', key: 'auth.banner.failed' },
  unavailable: { tone: 'warning', icon: 'cloud-off', key: 'auth.banner.unavailable', retry: true },
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.banner.rateLimited' },
  // Core's established next states, distinct from errors; their screens are not in this prototype.
  enrollmentRequired: { tone: 'info', icon: 'shield-check', key: 'auth.banner.enrollmentRequired' },
  recoveryRequired: { tone: 'info', icon: 'key-round', key: 'auth.banner.recoveryRequired' },
  stepNotAvailable: { tone: 'info', icon: 'info', key: 'auth.banner.stepNotAvailable' },
} as const satisfies Record<SignInProblem, Banner>;

const REASON_BANNERS = {
  'signed-out': { tone: 'success', icon: 'circle-check', key: 'auth.banner.signedOut' },
  'session-expired': { tone: 'info', icon: 'clock', key: 'auth.banner.sessionExpired' },
  'shift-ended': { tone: 'info', icon: 'clock', key: 'auth.banner.shiftEnded' },
} as const satisfies Record<SignInReason, Banner>;

const RETURN_TO_BANNER: Banner = {
  tone: 'info',
  icon: 'lock-keyhole',
  key: 'auth.banner.returnTo',
};

// The shape check only; Core decides which identifiers it accepts (docs/CORE-INTEGRATION.md §9).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in (`/login`), the accepted A4 design: email and password, client checks for empty and malformed fields only,
 * and one banner at a time (a problem first, then why the page was opened). A failed attempt clears the password and
 * keeps the email. "Sign in with a working code" (operators) and "Recover owner access" are established Core methods
 * whose screens are not built yet: they stay on the page, focusable but unavailable, described by a "not available in
 * this prototype" note (owner review, 2026-10-02).
 */
@Component({
  selector: 'adm-sign-in-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    AuthCard,
  ],
  templateUrl: './sign-in.page.html',
  styleUrl: './sign-in.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'sign-in' },
})
export class SignInPage {
  protected readonly flow = inject(AuthFlowFacade);
  private readonly query = toSignal(inject(ActivatedRoute).queryParamMap, { requireSync: true });

  protected readonly email = signal(this.flow.email());
  protected readonly password = signal('');
  protected readonly passwordVisible = signal(false);
  private readonly submitted = signal(false);

  protected readonly busy = computed(() => this.flow.busy() === 'signIn');

  protected readonly emailError = computed(() => {
    if (!this.submitted()) return null;
    const email = this.email().trim();
    if (email === '') return 'auth.signIn.errors.emailRequired';
    return EMAIL_SHAPE.test(email) ? null : 'auth.signIn.errors.emailFormat';
  });
  protected readonly passwordError = computed(() =>
    this.submitted() && this.password() === '' ? 'auth.signIn.errors.passwordRequired' : null,
  );

  protected readonly banner = computed<Banner | null>(() => {
    const problem = this.flow.signInProblem();
    if (problem !== null) return PROBLEM_BANNERS[problem];
    const reason = this.query().get(SIGN_IN_REASON_PARAM);
    if (isSignInReason(reason)) return REASON_BANNERS[reason];
    return this.flow.hasReturnUrl() ? RETURN_TO_BANNER : null;
  });

  constructor() {
    this.flow.setReturnUrl(this.query().get(RETURN_URL_PARAM));
  }

  protected onEmail(event: Event): void {
    this.email.set((event.target as HTMLInputElement).value);
  }

  protected onPassword(event: Event): void {
    this.password.set((event.target as HTMLInputElement).value);
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.busy()) return;
    this.submitted.set(true);
    if (this.emailError() !== null || this.passwordError() !== null) return;
    await this.flow.signIn(this.email().trim(), this.password());
    if (this.flow.signInProblem() === 'failed') {
      this.password.set('');
      this.passwordVisible.set(false);
      this.submitted.set(false);
    }
  }
}
