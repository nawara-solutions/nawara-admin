import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { factorLabel } from '../../application/factor-removal';
import { RemoveFactorFacade, RemoveFactorPhase } from '../../application/remove-factor.facade';

/** Why "Confirm it's you" did not go through. */
const VERIFY_PROBLEMS = {
  proofRefused: 'settings.security.remove.proofRefused',
  expired: 'settings.security.remove.verificationExpired',
  unavailable: 'settings.security.remove.verifyUnavailable',
} as const;

/** Why a factor is not offered for removal. */
export const REMOVAL_BLOCKS = {
  lastFactor: 'settings.security.remove.blocked.lastFactor',
  noAuthenticator: 'settings.security.remove.blocked.noAuthenticator',
  lastAuthenticator: 'settings.security.remove.blocked.lastAuthenticator',
  unfinished: 'settings.security.remove.blocked.unfinished',
} as const;

/** The one message of an ending or interrupted removal. */
const MESSAGES: Partial<Record<RemoveFactorPhase, string>> = {
  refreshFailed: 'settings.security.remove.messages.refreshFailed',
  lastFactor: 'settings.security.remove.messages.lastFactor',
  stillPresent: 'settings.security.remove.messages.stillPresent',
  unknown: 'settings.security.remove.messages.unknown',
  rateLimited: 'settings.security.remove.messages.rateLimited',
  refused: 'settings.security.remove.messages.refused',
  notInBuild: 'settings.security.remove.messages.notInBuild',
};

/**
 * "Remove this factor?" (P9-S4d design, Confirm and Verify artboards): an alertdialog opened by the Security page over
 * `RemoveFactorFacade`. The fresh read, then the destructive confirmation (focus on Cancel; the one-left warning when a
 * single confirmed factor would remain), then "confirm it's you" with an authenticator code, then the removal: locked
 * (no Escape, backdrop or close button) until it is settled. It closes itself when the factor is gone; every other end
 * is said here, with Close. The code field always shows its cleared value after a state change (a fast Enter cannot
 * leave a refused code in it).
 */
@Component({
  selector: 'adm-remove-factor-dialog',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDatePipe,
    NwDialog,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
  ],
  templateUrl: './remove-factor-dialog.html',
  styleUrl: './remove-factor-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoveFactorDialog {
  protected readonly flow = inject<RemoveFactorFacade>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.flow.state;
  protected readonly verifyProblems = VERIFY_PROBLEMS;
  protected readonly blocks = REMOVAL_BLOCKS;
  protected readonly demoCode = signal<string | null>(null);

  /** The typed code: cleared whenever the removal's state changes. */
  protected readonly code = linkedSignal({ source: this.state, computation: () => '' });
  protected readonly codeError = linkedSignal<unknown, string | null>({
    source: this.state,
    computation: () => null,
  });

  /** The target and its label, in every state that has one. */
  protected readonly target = computed(() => {
    const state = this.state();
    if (!('target' in state)) return null;
    return { ...state.target, label: factorLabel(state.target.factor.type, state.target.number) };
  });
  protected readonly message = computed(() => MESSAGES[this.state().phase] ?? null);
  protected readonly title = computed(() => {
    const state = this.state();
    switch (state.phase) {
      case 'confirming':
        return 'confirm';
      case 'verifying':
      case 'removing':
        return 'verify';
      default:
        return 'plain';
    }
  });
  protected readonly verifyBusy = computed(() => {
    const state = this.state();
    return state.phase === 'removing' || (state.phase === 'verifying' && state.busy);
  });

  private readonly cancelButton = viewChild('cancelButton', { read: ElementRef<HTMLElement> });
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLElement> });
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    // Closed (Cancel, Escape) or gone (removed, absent): the dialog goes; the page says what happened.
    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step =
        state.phase === 'verifying'
          ? `verifying:${state.busy}:${state.problem ?? ''}`
          : state.phase;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(state.phase), { injector: this.injector });
    });

    // The code field always shows what its signal holds, even when Enter followed the typing before a render.
    afterRenderEffect(() => {
      const input = this.codeInput()?.nativeElement;
      if (input && input.value !== this.code()) input.value = this.code();
    });
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value.replace(/\s/g, ''));
    this.codeError.set(null);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    if (this.verifyBusy()) return;
    if (!this.flow.verify(this.code())) this.codeError.set('settings.security.remove.proofFormat');
  }

  protected close(): void {
    this.flow.close();
  }

  private focusFor(phase: RemoveFactorPhase): void {
    const state = this.state();
    if (phase === 'confirming') this.cancelButton()?.nativeElement.focus();
    else if (phase === 'verifying' && state.phase === 'verifying' && !state.busy)
      this.codeInput()?.nativeElement.focus();
    else if (phase !== 'refreshing' && phase !== 'removing' && phase !== 'reconciling')
      (this.mainButton() ?? this.cancelButton())?.nativeElement.focus();
  }
}
