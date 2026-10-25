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
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwCheckbox } from '../../../shared/ui/checkbox/checkbox';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwInlineAlert } from '../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../shared/ui/spinner/spinner';
import {
  SECRET_KEY_GROUPS,
  SecretKeyFacade,
  SecretKeyPhase,
} from '../application/secret-key.facade';
import { LeaveSecretKeyDialog } from '../components/leave-secret-key-dialog/leave-secret-key-dialog';
import { SecretKeyGroups } from '../components/secret-key-groups/secret-key-groups';

/** What the page shows for each phase: one of the three steps, or one message with one way forward. */
type View = 'preparing' | 'intro' | 'verify' | 'key' | 'message' | 'leaving';

const VIEWS: Readonly<Record<SecretKeyPhase, View>> = {
  idle: 'preparing',
  checking: 'preparing',
  intro: 'intro',
  verifying: 'verify',
  creating: 'verify',
  rateLimited: 'verify',
  shown: 'key',
  checked: 'key',
  noAuthenticator: 'message',
  loadFailed: 'message',
  unknown: 'message',
  refused: 'message',
  notInBuild: 'message',
  done: 'leaving',
  cancelled: 'leaving',
  abandoned: 'leaving',
};

type MessageId =
  'noAuthenticator' | 'loadFailed' | 'unknown' | 'incomplete' | 'refused' | 'notInBuild';

/** A message view: one title, one description, one way forward (and back to Security). */
interface Message {
  readonly id: MessageId;
  readonly icon: NwIconName;
  readonly title: string;
  readonly description: string;
}

const MESSAGES = {
  noAuthenticator: {
    id: 'noAuthenticator',
    icon: 'lock-keyhole',
    title: 'settings.security.secretKey.messages.noAuthenticatorTitle',
    description: 'settings.security.secretKey.messages.noAuthenticatorDescription',
  },
  loadFailed: {
    id: 'loadFailed',
    icon: 'cloud-off',
    title: 'settings.security.secretKey.messages.loadFailedTitle',
    description: 'settings.security.secretKey.messages.loadFailedDescription',
  },
  unknown: {
    id: 'unknown',
    icon: 'triangle-alert',
    title: 'settings.security.secretKey.messages.unknownTitle',
    description: 'settings.security.secretKey.messages.unknownDescription',
  },
  incomplete: {
    id: 'incomplete',
    icon: 'triangle-alert',
    title: 'settings.security.secretKey.messages.incompleteTitle',
    description: 'settings.security.secretKey.messages.incompleteDescription',
  },
  refused: {
    id: 'refused',
    icon: 'lock-keyhole',
    title: 'shell.pages.forbidden.title',
    description: 'settings.security.secretKey.messages.refusedDescription',
  },
  notInBuild: {
    id: 'notInBuild',
    icon: 'cloud-off',
    title: 'settings.security.secretKey.messages.notInBuildTitle',
    description: 'settings.security.secretKey.messages.notInBuildDescription',
  },
} as const satisfies Record<MessageId, Message>;

/** Why "Confirm it's you" did not go through. */
const VERIFY_PROBLEMS = {
  proofRefused: 'settings.security.secretKey.proofRefused',
  expired: 'settings.security.secretKey.verificationExpired',
  unavailable: 'settings.security.secretKey.verifyUnavailable',
} as const;

/** When "still waiting" is said while the key is being created (the request itself is never timed out). */
export const SECRET_KEY_SLOW_MS = 10_000;

/**
 * Settings → Security → Secret key (`/settings/security/secret-key`, P9-S4c; owner decisions D1–D12 in
 * docs/design/p9-s4-account-security.md §11), the owner only. One neutral action, "Create a new secret key": the first
 * key or a replacement, which Admin cannot tell apart (CF-54). Before you start (the warning and an acknowledgement) →
 * confirm it's you with an authenticator code → the key, shown once: masked until revealed, copied on request, then a
 * randomly chosen group typed back while hidden AND "I've saved it" before Done. The flow is the page-scoped
 * `SecretKeyFacade`; leaving it while the key is unsaved (or being created) asks first, in the app and, where the
 * browser allows, on closing the tab. Typed values are cleared on every state change; nothing is put in the URL, history
 * state, storage, a toast or a notice.
 */
@Component({
  selector: 'adm-secret-key-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwCheckbox,
    NwControl,
    NwDatePipe,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    SecretKeyGroups,
  ],
  templateUrl: './secret-key.page.html',
  styleUrl: './secret-key.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SecretKeyFacade],
  host: { class: 'secret-key', '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class SecretKeyPage {
  protected readonly flow = inject(SecretKeyFacade);
  private readonly router = inject(Router);
  private readonly dialogs = inject(NwDialogService);
  protected readonly isDemo = inject(AuthSession).isDemo;

  protected readonly state = this.flow.state;
  protected readonly view = computed<View>(() => VIEWS[this.state().phase]);
  private readonly phase = computed(() => this.state().phase);

  /** "I understand": cleared whenever the flow's state changes (a new flow always asks again). */
  protected readonly acknowledged = linkedSignal({ source: this.state, computation: () => false });
  protected readonly proofCode = linkedSignal({ source: this.state, computation: () => '' });
  protected readonly proofError = linkedSignal<unknown, string | null>({
    source: this.state,
    computation: () => null,
  });
  protected readonly groupValue = linkedSignal({ source: this.state, computation: () => '' });
  /** "I've saved it": kept while the key is only revealed or hidden again; cleared when the phase changes. */
  protected readonly saved = linkedSignal({ source: this.phase, computation: () => false });
  protected readonly copyState = linkedSignal<SecretKeyPhase, 'idle' | 'copied' | 'failed'>({
    source: this.phase,
    computation: () => 'idle',
  });
  protected readonly slow = signal(false);

  protected readonly demoCode = signal<string | null>(null);
  protected readonly verifyProblems = VERIFY_PROBLEMS;
  protected readonly groupCount = SECRET_KEY_GROUPS;

  protected readonly message = computed<Message | null>(() => {
    const state = this.state();
    switch (state.phase) {
      case 'unknown':
        return state.reason === 'incomplete' ? MESSAGES.incomplete : MESSAGES.unknown;
      case 'noAuthenticator':
      case 'loadFailed':
      case 'refused':
      case 'notInBuild':
        return MESSAGES[state.phase];
      default:
        return null;
    }
  });

  protected readonly creating = computed(() => this.state().phase === 'creating');
  protected readonly verifyingBusy = computed(() => {
    const state = this.state();
    return state.phase === 'creating' || (state.phase === 'verifying' && state.busy);
  });
  /** The key step's facts: when it was issued, which group to type, whether it is shown, whether it matched. */
  protected readonly keyStep = computed(() => {
    const state = this.state();
    if (state.phase !== 'shown' && state.phase !== 'checked') return null;
    return {
      issuedAt: state.issuedAt,
      revealed: state.revealed,
      group: state.checkGroup + 1,
      matched: state.phase === 'checked',
      failed: state.phase === 'shown' && state.checkFailed,
    };
  });

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  private readonly groupInput = viewChild<ElementRef<HTMLInputElement>>('groupInput');
  private readonly proofInput = viewChild<ElementRef<HTMLInputElement>>('proofInput');
  private leaving: Promise<boolean> | null = null;

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then(({ signIn }) => this.demoCode.set(signIn.code));

    // Done or cancelled → back on Security, which says what happened; this page leaves no history entry. (Abandoned:
    // the router is already leaving.)
    effect(() => {
      const phase = this.phase();
      if (phase === 'done' || phase === 'cancelled')
        void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
    });

    // "Still waiting": said after a while; the request itself is never cancelled or timed out.
    effect((onCleanup) => {
      this.slow.set(false);
      if (!this.creating()) return;
      const timer = setTimeout(() => this.slow.set(true), SECRET_KEY_SLOW_MS);
      onCleanup(() => clearTimeout(timer));
    });

    // The typed fields always show what their signal holds: a value reset together with a fast Enter (no render in
    // between) would otherwise leave a refused code in the field.
    afterRenderEffect(() => {
      const proof = this.proofInput()?.nativeElement;
      if (proof && proof.value !== this.proofCode()) proof.value = this.proofCode();
      const group = this.groupInput()?.nativeElement;
      if (group && group.value !== this.groupValue()) group.value = this.groupValue();
    });

    // Focus follows the step: its heading; after a mismatched group or a refused code, the field.
    let shown: View | null = null;
    let lastState = this.state();
    afterRenderEffect(() => {
      const view = this.view();
      const state = this.state();
      const mismatch = state.phase === 'shown' && state.checkFailed && state !== lastState;
      const refused =
        state.phase === 'verifying' && state.problem === 'proofRefused' && state !== lastState;
      if (mismatch) this.groupInput()?.nativeElement.focus();
      else if (refused) this.proofInput()?.nativeElement.focus();
      else if (view !== shown && shown !== null) this.heading()?.nativeElement.focus();
      shown = view;
      lastState = state;
    });

    this.flow.start();
  }

  /**
   * The route's leave guard: leaving while the key is unsaved (or being created) asks first; "Leave anyway" drops
   * everything. Nothing is asked once the session has changed (the flow is already dropped).
   */
  canLeave(): boolean | Promise<boolean> {
    if (!this.flow.leaveLosesKey()) return true;
    this.leaving ??= firstValueFrom(
      this.dialogs.open<boolean>(LeaveSecretKeyDialog, {
        role: 'alertdialog',
        autoFocus: '[data-stay]',
      }).closed,
    ).then((leave) => {
      this.leaving = null;
      if (leave === true) this.flow.abandon();
      return leave === true;
    });
    return this.leaving;
  }

  /** Closing or reloading the tab: the browser's own prompt, where it shows one. It cannot always be prevented. */
  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.flow.leaveLosesKey()) return;
    event.preventDefault();
    // Legacy browsers show their confirmation only when a return value is set.
    event.returnValue = '';
  }

  protected onAcknowledged(value: boolean): void {
    this.acknowledged.set(value);
  }

  /** Continue stays unavailable (described by why) until the warning is acknowledged; the facade checks it again. */
  protected proceed(event: Event): void {
    event.preventDefault();
    this.flow.proceed(this.acknowledged());
  }

  /** Spaces from a pasted code are formatting; the code stays a string (leading zeroes kept). */
  protected onProofCode(event: Event): void {
    this.proofCode.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
    this.proofError.set(null);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    if (this.verifyingBusy()) return;
    if (!this.flow.verify(this.proofCode()))
      this.proofError.set('settings.security.secretKey.proofFormat');
  }

  protected toggleReveal(): void {
    if (this.keyStep()?.revealed) this.flow.hide();
    else this.flow.reveal();
  }

  protected async copy(): Promise<void> {
    this.copyState.set((await this.flow.copy()) ? 'copied' : 'failed');
  }

  protected onGroup(event: Event): void {
    this.groupValue.set((event.target as HTMLInputElement).value);
  }

  protected checkGroup(event: Event): void {
    event.preventDefault();
    this.flow.checkGroup(this.groupValue());
  }

  protected onSaved(value: boolean): void {
    this.saved.set(value);
  }

  /** Done stays unavailable (described by why) until the group matched and the key is saved; the facade checks again. */
  protected finish(): void {
    this.flow.finish(this.saved());
  }

  protected cancel(): void {
    this.flow.cancel();
  }

  /** Away to Security without a notice (a message view: nothing to keep). */
  protected leave(): void {
    void this.router.navigateByUrl('/settings/security', { replaceUrl: true });
  }
}
