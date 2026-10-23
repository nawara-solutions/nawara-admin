import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type RevokeAdminInvitationAction,
  invitationFailureKey,
} from '../../application/admin-invitation.actions';

/**
 * "Revoke this invitation?" (P3b-S3 design, artboard 4): a destructive confirmation (an alertdialog, focus on Cancel),
 * then the owner's simulated verification for `admin_invitation.revoke`, then pending and the result. The code stops
 * working at once; an admin who already joined keeps their access. After a lost answer nothing is resent: the list is
 * reloaded ("Check status").
 */
@Component({
  selector: 'adm-revoke-admin-invitation-dialog',
  imports: [
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
  templateUrl: './revoke-admin-invitation-dialog.html',
  styleUrl: './revoke-admin-invitation-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevokeAdminInvitationDialog {
  protected readonly action = inject<RevokeAdminInvitationAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly input = this.action.current()!;
  protected readonly invitation = this.input.invitation;
  protected readonly isolatedOrganization = isolated(this.input.target.organizationName);
  protected readonly code = signal('');
  protected readonly demoCode = signal<string | null>(null);

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });
  private readonly cancelButton = viewChild('cancelButton', {
    read: ElementRef<HTMLButtonElement>,
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    if (state.phase === 'failed') return state.failure;
    if (state.phase === 'verifying') return state.failure;
    return null;
  });
  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? invitationFailureKey(failure, 'revoke') : null;
  });

  protected readonly busy = computed(() => {
    const state = this.state();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  });

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step =
        state.phase === 'verifying'
          ? `verifying:${state.busy}:${state.failure?.kind ?? ''}`
          : state.phase;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(state.phase), { injector: this.injector });
    });
  }

  protected confirm(): void {
    this.code.set('');
    this.action.run.submit(this.input);
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    this.action.run.verify({ method: 'totp', code: this.code() });
  }

  protected back(): void {
    this.action.run.back();
  }

  protected tryAgain(): void {
    this.code.set('');
    this.action.run.retry();
  }

  protected close(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  private focusFor(phase: string): void {
    if (phase === 'editing') this.cancelButton()?.nativeElement.focus();
    else if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
