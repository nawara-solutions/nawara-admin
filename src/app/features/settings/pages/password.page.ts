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
import { ChangePasswordFacade, ChangePasswordPhase } from '../application/change-password.facade';
import { PASSWORD_LIMITS, checkPassword } from '../data-access/password-rules';

/** What the page shows for each phase: one of the two steps, or one message with one way forward. */
type View = 'preparing' | 'edit' | 'verify' | 'message' | 'leaving';

const VIEWS: Readonly<Record<ChangePasswordPhase, View>> = {
  idle: 'preparing',
  checking: 'preparing',
  editing: 'edit',
  verifying: 'verify',
  changing: 'verify',
  rateLimited: 'verify',
  unknown: 'message',
  noAuthenticator: 'message',
  loadFailed: 'message',
  refused: 'message',
  notInBuild: 'message',
  done: 'leaving',
  cancelled: 'leaving',
};

type MessageId = 'unknown' | 'noAuthenticator' | 'loadFailed' | 'refused' | 'notInBuild';

/** A message view: one title, one description, one way forward (and back to Security). */
interface Message {
  readonly id: MessageId;
  readonly icon: NwIconName;
  readonly title: string;
  readonly description: string;
}

const MESSAGES = {
  unknown: {
    id: 'unknown',
    icon: 'triangle-alert',
    title: 'settings.security.password.messages.unknownTitle',
    description: 'settings.security.password.messages.unknownDescription',
  },
  noAuthenticator: {
    id: 'noAuthenticator',
    icon: 'lock-keyhole',
    title: 'settings.security.password.messages.noAuthenticatorTitle',
    description: 'settings.security.password.messages.noAuthenticatorDescription',
  },
  loadFailed: {
    id: 'loadFailed',
    icon: 'cloud-off',
    title: 'settings.security.password.messages.loadFailedTitle',
    description: 'settings.security.password.messages.loadFailedDescription',
  },
  refused: {
    id: 'refused',
    icon: 'lock-keyhole',
    title: 'shell.pages.forbidden.title',
    description: 'settings.security.password.messages.refusedDescription',
  },
  notInBuild: {
    id: 'notInBuild',
    icon: 'cloud-off',
    title: 'settings.security.password.messages.notInBuildTitle',
    description: 'settings.security.password.messages.notInBuildDescription',
  },
} as const satisfies Record<MessageId, Message>;

/** Why "Confirm it's you" did not go through. */
const VERIFY_PROBLEMS = {
  proofRefused: 'settings.security.password.proofRefused',
  expired: 'settings.security.password.verificationExpired',
  unavailable: 'settings.security.password.verifyUnavailable',
} as const;

/**
 * Settings → Security → Password (`/settings/security/password`, P9-S4e; owner decisions P1–P9 in
 * docs/design/p9-s4-account-security.md §13), the owner only. The new password twice (Show and Hide, a password
 * manager's `new-password` fields under the owner's own identifier, paste allowed), checked against Core's documented
 * limits only and sent exactly as typed; then "confirm it's you" with an authenticator code; then one change. The flow
 * is the page-scoped `ChangePasswordFacade`; the fields are emptied whenever the facade drops the password and always
 * show their signal's value; nothing is put in the URL (the form posts nowhere), history state, storage or a notice.
 */
@Component({
  selector: 'adm-password-page',
  imports: [TranslocoPipe, NwButton, NwControl, NwFormField, NwIcon, NwInlineAlert, NwSpinner],
  templateUrl: './password.page.html',
  styleUrl: './password.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ChangePasswordFacade],
  host: { class: 'password-change' },
})
export class PasswordPage {
  protected readonly flow = inject(ChangePasswordFacade);
  private readonly router = inject(Router);
  private readonly session = inject(AuthSession);
  protected readonly isDemo = this.session.isDemo;
  /** The owner's own identifier, for password managers (the account the new password belongs to). */
  protected readonly username = computed(() => this.session.actor()?.email ?? '');

  protected readonly state = this.flow.state;
  protected readonly view = computed<View>(() => VIEWS[this.state().phase]);
  protected readonly limits = PASSWORD_LIMITS;
  protected readonly verifyProblems = VERIFY_PROBLEMS;

  /** The typed passwords: emptied whenever the flow drops the password (a refusal, an unknown outcome, the end). */
  protected readonly newPassword = linkedSignal({
    source: this.flow.clearings,
    computation: () => '',
  });
  protected readonly confirmation = linkedSignal({
    source: this.flow.clearings,
    computation: () => '',
  });
  protected readonly showNew = signal(false);
  protected readonly showConfirmation = signal(false);
  /** The verification code: cleared on every state change. */
  protected readonly proofCode = linkedSignal({ source: this.state, computation: () => '' });
  protected readonly proofError = linkedSignal<unknown, string | null>({
    source: this.state,
    computation: () => null,
  });

  protected readonly check = computed(() => checkPassword(this.newPassword()));
  protected readonly mismatch = computed(
    () => this.confirmation() !== '' && this.confirmation() !== this.newPassword(),
  );
  protected readonly ready = computed(
    () => this.check().ok && this.newPassword() === this.confirmation(),
  );
  protected readonly demoCode = signal<string | null>(null);

  protected readonly message = computed<Message | null>(() => {
    const phase = this.state().phase;
    return phase in MESSAGES ? MESSAGES[phase as MessageId] : null;
  });
  protected readonly verifyBusy = computed(() => {
    const state = this.state();
    return state.phase === 'changing' || (state.phase === 'verifying' && state.busy);
  });

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly newInput = viewChild<ElementRef<HTMLInputElement>>('newInput');
  private readonly confirmInput = viewChild<ElementRef<HTMLInputElement>>('confirmInput');
  private readonly proofInput = viewChild<ElementRef<HTMLInputElement>>('proofInput');

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then(({ signIn }) => this.demoCode.set(signIn.code));

    // Done or cancelled → back on Security, which says what happened; this page leaves no history entry.
    effect(() => {
      const phase = this.state().phase;
      if (phase === 'done' || phase === 'cancelled')
        void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
    });

    // Every field always shows what its signal holds: a value cleared together with a fast Enter (no render in
    // between) would otherwise stay in the field.
    afterRenderEffect(() => {
      for (const [input, value] of [
        [this.newInput(), this.newPassword()],
        [this.confirmInput(), this.confirmation()],
        [this.proofInput(), this.proofCode()],
      ] as const) {
        const element = input?.nativeElement;
        if (element && element.value !== value) element.value = value;
      }
    });

    // Focus follows the step: its heading; after a refused code or password, the field.
    let shown: View | null = null;
    let lastState = this.state();
    afterRenderEffect(() => {
      const view = this.view();
      const state = this.state();
      const changed = state !== lastState;
      if (changed && state.phase === 'verifying' && state.problem === 'proofRefused')
        this.proofInput()?.nativeElement.focus();
      else if (changed && state.phase === 'editing' && state.rejected)
        this.newInput()?.nativeElement.focus();
      else if (view !== shown && shown !== null) this.heading()?.nativeElement.focus();
      shown = view;
      lastState = state;
    });

    this.flow.start();
  }

  protected onNew(event: Event): void {
    this.newPassword.set((event.target as HTMLInputElement).value);
  }

  protected onConfirmation(event: Event): void {
    this.confirmation.set((event.target as HTMLInputElement).value);
  }

  /** "Continue": unavailable (and described) until the limits hold and both entries match; the facade checks again. */
  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.ready()) return;
    if (this.flow.submit(this.newPassword(), this.confirmation())) {
      this.showNew.set(false);
      this.showConfirmation.set(false);
    }
  }

  protected onProof(event: Event): void {
    this.proofCode.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
    this.proofError.set(null);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    if (this.verifyBusy()) return;
    if (!this.flow.verify(this.proofCode()))
      this.proofError.set('settings.security.password.proofFormat');
  }

  protected cancel(): void {
    this.flow.cancel();
  }

  /** Away to Security without a notice (a message view: nothing to keep). */
  protected leave(): void {
    void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
  }
}
