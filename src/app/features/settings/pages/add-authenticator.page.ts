import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { NwButton } from '../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwInlineAlert } from '../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../shared/ui/spinner/spinner';
import { NwTotpSetup } from '../../../shared/ui/totp-setup/totp-setup';
import {
  AddAuthenticatorFacade,
  AddAuthenticatorPhase,
} from '../application/add-authenticator.facade';

/** Which of the three steps the page shows. */
type Step = 'code' | 'verify';

/** What the page shows for each phase: one of the two steps, or one message with one way forward. */
type View =
  | Step
  | 'preparing'
  | 'reconciling'
  | 'noAuthenticator'
  | 'beginFailed'
  | 'replaced'
  | 'unknown'
  | 'refused'
  | 'notInBuild'
  | 'leaving';

const VIEWS: Readonly<Record<AddAuthenticatorPhase, View>> = {
  idle: 'preparing',
  checking: 'preparing',
  beginning: 'preparing',
  setup: 'code',
  validating: 'code',
  codeRefused: 'code',
  notConfirmed: 'code',
  rateLimited: 'code',
  verifying: 'verify',
  confirming: 'verify',
  reconciling: 'reconciling',
  noAuthenticator: 'noAuthenticator',
  beginFailed: 'beginFailed',
  replaced: 'replaced',
  unknown: 'unknown',
  refused: 'refused',
  notInBuild: 'notInBuild',
  succeeded: 'leaving',
  cancelled: 'leaving',
};

/** A message view: one title, one description, one way forward (and back to Security). */
interface Message {
  readonly id: MessageId;
  readonly icon: NwIconName;
  readonly title: string;
  readonly description: string;
}

type MessageId =
  | 'noAuthenticator'
  | 'beginRateLimited'
  | 'beginUnavailable'
  | 'replaced'
  | 'unknown'
  | 'refused'
  | 'notInBuild';

const MESSAGES = {
  noAuthenticator: {
    id: 'noAuthenticator',
    icon: 'lock-keyhole',
    title: 'settings.security.add.messages.noAuthenticatorTitle',
    description: 'settings.security.add.messages.noAuthenticatorDescription',
  },
  beginRateLimited: {
    id: 'beginRateLimited',
    icon: 'hourglass',
    title: 'settings.security.add.messages.beginRateLimitedTitle',
    description: 'settings.security.add.messages.beginRateLimitedDescription',
  },
  beginUnavailable: {
    id: 'beginUnavailable',
    icon: 'cloud-off',
    title: 'settings.security.add.messages.beginUnavailableTitle',
    description: 'settings.security.add.messages.beginUnavailableDescription',
  },
  replaced: {
    id: 'replaced',
    icon: 'circle-alert',
    title: 'settings.security.add.messages.replacedTitle',
    description: 'settings.security.add.messages.replacedDescription',
  },
  unknown: {
    id: 'unknown',
    icon: 'circle-alert',
    title: 'settings.security.add.messages.unknownTitle',
    description: 'settings.security.add.messages.unknownDescription',
  },
  refused: {
    id: 'refused',
    icon: 'lock-keyhole',
    title: 'shell.pages.forbidden.title',
    description: 'settings.security.add.messages.refusedDescription',
  },
  notInBuild: {
    id: 'notInBuild',
    icon: 'cloud-off',
    title: 'settings.security.add.messages.notInBuildTitle',
    description: 'settings.security.add.messages.notInBuildDescription',
  },
} as const satisfies Record<MessageId, Message>;

/** Why "Confirm it's you" did not go through. */
const VERIFY_PROBLEMS = {
  proofRefused: 'settings.security.add.proofRefused',
  expired: 'settings.security.add.verificationExpired',
  unavailable: 'settings.security.add.verifyUnavailable',
} as const;

/** The id of the banner a refused code is described by. */
export const ADD_AUTHENTICATOR_BANNER_ID = 'add-authenticator-banner';

/**
 * Settings → Security → Add an authenticator app (`/settings/security/add-authenticator`, P9-S4b; owner decisions
 * D1–D8 in docs/design/p9-s4-account-security.md §10), the owner only. Scan the new app's QR code (shared
 * `nw-totp-setup`), enter the NEW app's code, then confirm it's you with an authenticator you ALREADY use; then back on
 * Security with a notice. The flow is the page-scoped `AddAuthenticatorFacade`: leaving the page disposes the setup key,
 * the codes and any grant. The code fields are cleared on every state change; nothing is put in the URL, history state,
 * storage or a toast.
 */
@Component({
  selector: 'adm-add-authenticator-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    NwTotpSetup,
  ],
  templateUrl: './add-authenticator.page.html',
  styleUrl: './add-authenticator.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AddAuthenticatorFacade],
  host: { class: 'add-authenticator' },
})
export class AddAuthenticatorPage {
  protected readonly flow = inject(AddAuthenticatorFacade);
  private readonly router = inject(Router);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly bannerId = ADD_AUTHENTICATOR_BANNER_ID;

  protected readonly state = this.flow.state;
  protected readonly view = computed<View>(() => VIEWS[this.state().phase]);

  /** The typed codes: cleared whenever the flow's state changes (a refusal, a step, the end). */
  protected readonly newCode = linkedSignal({ source: this.state, computation: () => '' });
  protected readonly proofCode = linkedSignal({ source: this.state, computation: () => '' });
  protected readonly codeError = linkedSignal<unknown, string | null>({
    source: this.state,
    computation: () => null,
  });
  protected readonly proofError = linkedSignal<unknown, string | null>({
    source: this.state,
    computation: () => null,
  });

  /** Demo builds only: the codes the mocks accept (from the lazily loaded demo bindings). */
  protected readonly demoCodes = signal<{
    readonly newApp: string;
    readonly existing: string;
  } | null>(null);

  protected readonly verifyProblems = VERIFY_PROBLEMS;
  protected readonly message = computed<Message | null>(() => {
    const state = this.state();
    switch (state.phase) {
      case 'beginFailed':
        return state.reason === 'rateLimited'
          ? MESSAGES.beginRateLimited
          : MESSAGES.beginUnavailable;
      case 'noAuthenticator':
      case 'replaced':
      case 'unknown':
      case 'refused':
      case 'notInBuild':
        return MESSAGES[state.phase];
      default:
        return null;
    }
  });

  protected readonly confirming = computed(() => this.state().phase === 'confirming');
  protected readonly verifyingBusy = computed(() => {
    const state = this.state();
    return state.phase === 'confirming' || (state.phase === 'verifying' && state.busy);
  });

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly proofInput = viewChild<ElementRef<HTMLInputElement>>('proofInput');

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then(({ signIn }) => {
        if (signIn.newAuthenticatorCode)
          this.demoCodes.set({ newApp: signIn.newAuthenticatorCode, existing: signIn.code });
      });

    // D7: done (or cancelled) → back on Security, which shows the notice; this page leaves no history entry.
    effect(() => {
      if (this.view() === 'leaving')
        void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
    });

    // The proof field always shows what its signal holds: a value reset together with a fast Enter (no render in
    // between) would otherwise leave a refused code in the field (found in P9-S4c, fixed in P9-S4d).
    afterRenderEffect(() => {
      const proof = this.proofInput()?.nativeElement;
      if (proof && proof.value !== this.proofCode()) proof.value = this.proofCode();
    });

    // Focus follows the step: its heading; after a refused code, the field described by the banner.
    let shown: View | null = null;
    let refused = false;
    afterRenderEffect(() => {
      const view = this.view();
      const nowRefused = this.state().phase === 'codeRefused';
      if (nowRefused && !refused) this.codeInput()?.nativeElement.focus();
      else if (view !== shown && shown !== null) this.heading()?.nativeElement.focus();
      shown = view;
      refused = nowRefused;
    });

    this.flow.start();
  }

  /** Spaces from a pasted code are formatting; the code stays a string (leading zeroes kept). */
  protected onNewCode(event: Event): void {
    this.newCode.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
    this.codeError.set(null);
  }

  protected onProofCode(event: Event): void {
    this.proofCode.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
    this.proofError.set(null);
  }

  protected submitCode(event: Event): void {
    event.preventDefault();
    if (this.flow.busy() || !this.flow.entersCode()) return;
    if (!this.flow.submitCode(this.newCode()))
      this.codeError.set('settings.security.add.codeFormat');
  }

  protected verify(event: Event): void {
    event.preventDefault();
    if (this.verifyingBusy()) return;
    if (!this.flow.verify(this.proofCode()))
      this.proofError.set('settings.security.add.proofFormat');
  }

  protected cancel(): void {
    this.flow.cancel();
  }

  /** Away to Security without a notice (a message view: nothing to cancel any more). */
  protected leave(): void {
    void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
  }
}
