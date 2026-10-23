import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { NwIconButton } from '../icon-button/icon-button';
import { NW_DIALOG_TITLE_ID } from './dialog.service';

/**
 * The dialog frame: title, close button, scrollable body and an actions row (`<div nwDialogActions>`).
 * Rendered as the root of a component opened with `NwDialogService`.
 *
 * `busy`: an operation is running that must not be abandoned by accident. Escape, the backdrop and the close button
 * are ignored (`DialogRef.disableClose`); the close button stays focusable and says it is unavailable. On a narrow
 * dialog the actions stack, full width, the last (the main action) first.
 */
@Component({
  selector: 'nw-dialog',
  imports: [NwIconButton],
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-dialog', '[class.nw-dialog--wide]': "size() === 'wide'" },
})
export class NwDialog {
  readonly title = input.required<string>();
  readonly closeLabel = input.required<string>();
  readonly size = input<'default' | 'wide'>('default');
  readonly busy = input(false);

  protected readonly titleId = inject(NW_DIALOG_TITLE_ID);
  private readonly dialogRef = inject(DialogRef);

  constructor() {
    effect(() => {
      this.dialogRef.disableClose = this.busy();
    });
  }

  protected close(): void {
    if (this.busy()) return;
    this.dialogRef.close();
  }
}
