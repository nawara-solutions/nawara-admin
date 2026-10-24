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
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  type OperatorBlockAction,
  blockFailureKey,
  blockReconciles,
} from '../../application/operator-block.action';
import { contactText } from '../../domain/operator.model';

/**
 * "Block this operator?" / "Unblock this operator?" (P6-S3 design, artboards 2–3, 5–6, 9): the confirmation (block is
 * an alertdialog with focus on Cancel; an unconfirmed operator gets the CF-16 warning), pending (cannot be closed), then
 * the result. Success closes it (the page confirms with a toast). No verification: Core asks none. After a lost answer,
 * a `500`, a `503` or a `404` the account is reloaded and the dialog says what the DEMO state shows; a new attempt is a
 * separate button that says the earlier one may have applied and that Core records every call.
 */
@Component({
  selector: 'adm-operator-block-dialog',
  imports: [TranslocoPipe, NwButton, NwDialog, NwIcon, NwInlineAlert, NwSpinner],
  templateUrl: './operator-block-dialog.html',
  styleUrl: './operator-block-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorBlockDialog {
  protected readonly action = inject<OperatorBlockAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly input = this.action.current()!;
  protected readonly block = this.input.block;
  protected readonly contact = contactText(this.input.contact);
  protected readonly reconciliation = this.action.reconciliation;

  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });

  protected readonly failureKey = computed(() => {
    const state = this.state();
    return state.phase === 'failed' ? blockFailureKey(state.failure) : null;
  });
  protected readonly reconciling = computed(() => {
    const state = this.state();
    return state.phase === 'failed' && blockReconciles(state.failure);
  });
  /** The reload shows the change in place (the account is now in the state asked for). */
  protected readonly reached = computed(() => {
    const known = this.reconciliation();
    return known?.state === 'known' && known.blocked === this.block;
  });
  /** A new attempt may be offered: the reload shows the account (either state), never while checking or gone. */
  protected readonly repeatable = computed(
    () => this.reconciling() && this.reconciliation()?.state === 'known',
  );
  protected readonly busy = computed(() => this.state().phase === 'pending');

  constructor() {
    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      if (state.phase === previous) return;
      previous = state.phase;
      if (state.phase === 'failed')
        afterNextRender(() => this.mainButton()?.nativeElement.focus(), {
          injector: this.injector,
        });
    });
  }

  protected confirm(): void {
    this.action.run.submit(this.input);
  }

  /** The explicit repeat (never automatic). */
  protected repeat(): void {
    this.action.repeat();
  }

  protected checkStatus(): void {
    this.action.checkStatus();
  }

  protected close(): void {
    if (this.busy()) return;
    this.ref.close();
  }
}
