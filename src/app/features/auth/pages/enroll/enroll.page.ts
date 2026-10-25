import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert, NwInlineAlertTone } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { NwTotpSetup } from '../../../../shared/ui/totp-setup/totp-setup';
import { AuthFlowFacade, EnrollmentProblem } from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';
import { IdentityRow } from '../../components/identity-row/identity-row';

interface Banner {
  readonly tone: NwInlineAlertTone;
  readonly icon: NwIconName;
  readonly key: string;
  readonly retry?: boolean;
}

/** Problems of a confirmation, shown above the setup: the QR, the key and the field stay as they are. */
const BANNERS = {
  invalidCode: { tone: 'danger', icon: 'circle-alert', key: 'auth.enroll.codeInvalid' },
  rateLimited: { tone: 'warning', icon: 'hourglass', key: 'auth.enroll.rateLimited' },
  unavailable: { tone: 'warning', icon: 'cloud-off', key: 'auth.enroll.unavailable', retry: true },
} as const satisfies Partial<Record<EnrollmentProblem, Banner>>;

/** What the page shows: the setup, or one centred message with one way forward. */
type EnrollView =
  'setup' | 'beginRateLimited' | 'beginUnavailable' | 'expired' | 'alreadyEnrolled' | 'noSetup';

/** The banner's id: a refused code marks the field invalid and describes it by this banner. */
export const ENROLL_BANNER_ID = 'enroll-banner';

/**
 * The owner's first-factor setup (`/login/enroll`, A4-S4 design), after Core answered `enrollment_required`: scan the QR
 * code (or type the setup key), then confirm with the app's current code. Confirmation goes straight to the access
 * check. The QR and the setup key are presented by the shared `nw-totp-setup` (also used to add an authenticator from
 * Settings, P9-S4b); the key and the URI live in the flow's memory only and are dropped when the page is left, so a
 * reload shows "starts from sign-in".
 */
@Component({
  selector: 'adm-enroll-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    NwTotpSetup,
    AuthCard,
    IdentityRow,
  ],
  templateUrl: './enroll.page.html',
  styleUrls: ['../working-code/working-code.page.scss', './enroll.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'enroll' },
})
export class EnrollPage {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly bannerId = ENROLL_BANNER_ID;

  protected readonly code = signal('');
  private readonly submittedEmpty = signal(false);

  protected readonly view = computed<EnrollView>(() => {
    // After success the page stays (hidden) under the access check: nothing changes here.
    if (this.flow.enrolled()) return 'setup';
    const problem = this.flow.enrollmentProblem();
    if (
      problem === 'expired' ||
      problem === 'alreadyEnrolled' ||
      problem === 'beginRateLimited' ||
      problem === 'beginUnavailable'
    )
      return problem;
    return this.flow.enrollmentPending() ? 'setup' : 'noSetup';
  });

  protected readonly enrollment = this.flow.totpEnrollment;
  protected readonly preparing = computed(() => this.enrollment() === null);
  protected readonly confirming = computed(() => this.flow.busy() === 'confirmEnrollment');

  protected readonly banner = computed<Banner | null>(() => {
    const problem = this.flow.enrollmentProblem();
    return problem !== null && problem in BANNERS ? BANNERS[problem as keyof typeof BANNERS] : null;
  });

  protected readonly codeError = computed(() =>
    this.submittedEmpty() ? 'auth.enroll.codeRequired' : null,
  );

  /** Core refused the code: the field is invalid and described by the banner (not a second message). */
  protected readonly invalidRef = computed(() =>
    this.flow.enrollmentProblem() === 'invalidCode' ? this.bannerId : undefined,
  );

  constructor() {
    // Leaving the page ends this setup: a new one starts from sign-in, with a new key.
    inject(DestroyRef).onDestroy(() => this.flow.forgetEnrollment());
  }

  /** Spaces from a pasted code are formatting; the code stays a string (leading zeroes kept). */
  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
  }

  protected async submit(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.confirming() || this.preparing()) return;
    const code = this.code();
    this.submittedEmpty.set(code === '');
    if (code === '') return;
    await this.flow.confirmEnrollment(code);
  }

  /** "Try again" (manual only): the same code against the same setup, or (no setup yet) beginning it. */
  protected retry(): void {
    const view = this.view();
    if (view === 'beginRateLimited' || view === 'beginUnavailable')
      void this.flow.beginEnrollment();
    else void this.submit();
  }

  protected back(): void {
    void this.flow.backToSignIn();
  }
}
