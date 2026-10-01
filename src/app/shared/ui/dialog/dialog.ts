import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { NwIconButton } from '../icon-button/icon-button';
import { NW_DIALOG_TITLE_ID } from './dialog.service';

/**
 * The dialog frame: title, close button, scrollable body and an actions row (`<div nwDialogActions>`).
 * Rendered as the root of a component opened with `NwDialogService`.
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

  protected readonly titleId = inject(NW_DIALOG_TITLE_ID);
  private readonly dialogRef = inject(DialogRef);

  protected close(): void {
    this.dialogRef.close();
  }
}
