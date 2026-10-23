import { DialogRef } from '@angular/cdk/dialog';
import { ESCAPE, hasModifierKey } from '@angular/cdk/keycodes';
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NwIconButton } from '../icon-button/icon-button';
import { NW_DIALOG_TITLE_ID } from './dialog.service';

/**
 * The dialog frame: title, close button, scrollable body and an actions row (`<div nwDialogActions>`).
 * Rendered as the root of a component opened with `NwDialogService`.
 *
 * `busy`: an operation is running that must not be abandoned by accident. Escape, the backdrop and the close button
 * are ignored (`DialogRef.disableClose`); the close button stays focusable and says it is unavailable. On a narrow
 * dialog the actions stack, full width, the last (the main action) first.
 *
 * `guarded`: closing needs the content's say (e.g. unsaved changes). Escape, the backdrop and the close button do not
 * close the dialog; they emit `closeRequested`, and the content decides (confirm, then `DialogRef.close()`). `busy` wins:
 * while busy nothing is emitted.
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
  readonly guarded = input(false);
  /** A guarded dialog was asked to close (Escape, the backdrop or the close button). */
  readonly closeRequested = output<void>();

  protected readonly titleId = inject(NW_DIALOG_TITLE_ID);
  private readonly dialogRef = inject(DialogRef);

  constructor() {
    effect(() => {
      this.dialogRef.disableClose = this.busy() || this.guarded();
    });
    this.dialogRef.backdropClick.pipe(takeUntilDestroyed()).subscribe(() => this.requestClose());
    this.dialogRef.keydownEvents.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event.keyCode !== ESCAPE || hasModifierKey(event)) return;
      // A busy or guarded dialog is not closed by CDK (`disableClose`); a guarded one asks its content.
      if (this.guarded() && !this.busy()) {
        event.preventDefault();
        this.closeRequested.emit();
      }
    });
  }

  protected close(): void {
    if (this.busy()) return;
    if (this.guarded()) this.closeRequested.emit();
    else this.dialogRef.close();
  }

  private requestClose(): void {
    if (this.guarded() && !this.busy()) this.closeRequested.emit();
  }
}
