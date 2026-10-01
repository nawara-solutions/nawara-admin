import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ComponentType } from '@angular/cdk/portal';
import { Injectable, InjectionToken, inject } from '@angular/core';

/** The id the `nw-dialog` title must carry so the dialog is labelled by it. */
export const NW_DIALOG_TITLE_ID = new InjectionToken<string>('NW_DIALOG_TITLE_ID');

export interface NwDialogOptions<D> {
  readonly data?: D;
  /** `alertdialog` for confirmations that interrupt (destructive actions, docs/ARCHITECTURE.md §12). */
  readonly role?: 'dialog' | 'alertdialog';
}

let nextId = 0;

/**
 * Opens a component in a modal dialog (CDK Dialog: focus trap, focus restore, Escape, RTL). The component renders
 * `<nw-dialog>` as its root to get the Nawara frame. Read `data` with `inject(DIALOG_DATA)` and close through
 * `inject(DialogRef)`.
 */
@Injectable({ providedIn: 'root' })
export class NwDialogService {
  private readonly dialog = inject(Dialog);

  open<R = unknown, D = unknown, C = unknown>(
    component: ComponentType<C>,
    options: NwDialogOptions<D> = {},
  ): DialogRef<R, C> {
    const titleId = `nw-dialog-title-${nextId++}`;
    return this.dialog.open<R, D, C>(component, {
      ...(options.data === undefined ? {} : { data: options.data }),
      role: options.role ?? 'dialog',
      ariaModal: true,
      ariaLabelledBy: titleId,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      panelClass: 'nw-dialog-pane',
      backdropClass: 'nw-overlay-backdrop',
      providers: [{ provide: NW_DIALOG_TITLE_ID, useValue: titleId }],
    });
  }
}
