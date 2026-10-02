import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SIGN_IN_PATH } from '../../../../core/auth/return-url';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { AuthFlowFacade, VerifyProblem } from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

/** Problems shown as a banner; `invalidCode` is a field error and `expired` replaces the card. */
const BANNERS = {
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.mfa.rateLimited' },
  unavailable: { tone: 'warning', icon: 'cloud-off', key: 'auth.mfa.unavailable', retry: true },
  passkeyFailed: { tone: 'warning', icon: 'circle-x', key: 'auth.mfa.passkeyFailed' },
} as const satisfies Partial<Record<VerifyProblem, Banner>>;

const ACCEPTED: Banner = { tone: 'success', icon: 'circle-check', key: 'auth.mfa.accepted' };

/**
 * The owner's second step (`/login/verify`, A4 slice 2), after Core answered `mfa_required`. It shows the first method
 * Core offered, and a link to the other one only when Core offered it. One free-length code field (no digit boxes, no
 * maxlength, paste allowed) and never a "send code" action. The passkey prompt is the browser's own.
 * Without a challenge (a reload, a typed URL) it returns to the password step.
 */
@Component({
  selector: 'adm-mfa-page',
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
  templateUrl: './mfa.page.html',
  styleUrl: './mfa.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'mfa' },
})
export class MfaPage {
  protected readonly flow = inject(AuthFlowFacade);

  protected readonly code = signal('');
  private readonly submittedEmpty = signal(false);

  protected readonly expired = computed(() => this.flow.verifyProblem() === 'expired');
  protected readonly verifying = computed(() => this.flow.busy() === 'verify');
  protected readonly waiting = computed(() => this.flow.busy() === 'passkey');

  protected readonly banner = computed<Banner | null>(() => {
    if (this.flow.accepted()) return ACCEPTED;
    const problem = this.flow.verifyProblem();
    return problem !== null && problem in BANNERS ? BANNERS[problem as keyof typeof BANNERS] : null;
  });

  protected readonly codeError = computed(() => {
    if (this.submittedEmpty()) return 'auth.mfa.codeRequired';
    return this.flow.verifyProblem() === 'invalidCode' ? 'auth.mfa.codeInvalid' : null;
  });

  /** The heading takes focus again when the method or the state changes. */
  protected readonly step = computed(() =>
    this.expired() ? 'expired' : this.flow.accepted() ? 'accepted' : this.flow.method(),
  );

  constructor() {
    if (this.flow.methods().length === 0) {
      void inject(Router).navigate([SIGN_IN_PATH], { replaceUrl: true });
    }
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected async submitCode(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.verifying()) return;
    const code = this.code().trim();
    this.submittedEmpty.set(code === '');
    if (code === '') return;
    await this.flow.verifyCode(code);
    if (this.flow.verifyProblem() === 'invalidCode') this.code.set('');
  }

  /** "Try again" keeps the same challenge. */
  protected retry(): void {
    if (this.flow.method() === 'passkey') void this.flow.startPasskey();
    else void this.submitCode();
  }

  protected useAlternative(): void {
    const other = this.flow.alternative();
    if (other === null) return;
    this.code.set('');
    this.submittedEmpty.set(false);
    this.flow.useMethod(other);
  }

  protected back(): void {
    this.code.set('');
    void this.flow.backToSignIn();
  }
}
