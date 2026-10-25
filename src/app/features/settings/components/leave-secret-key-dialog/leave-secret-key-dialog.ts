import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';

/**
 * "Leave without saving your new key?" (P9-S4c design, Unknown artboard): an alertdialog opened by the secret-key
 * page's leave guard, focus on "Stay on this page". Closes with `true` only for "Leave anyway"; Escape, the backdrop
 * and the close button stay.
 */
@Component({
  selector: 'adm-leave-secret-key-dialog',
  imports: [TranslocoPipe, NwButton, NwDialog],
  templateUrl: './leave-secret-key-dialog.html',
  styleUrl: './leave-secret-key-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaveSecretKeyDialog {
  private readonly ref = inject<DialogRef<boolean>>(DialogRef);

  protected stay(): void {
    this.ref.close(false);
  }

  protected leave(): void {
    this.ref.close(true);
  }
}
