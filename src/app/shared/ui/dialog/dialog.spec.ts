import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwDialog } from './dialog';
import { NwDialogService } from './dialog.service';

@Component({
  imports: [NwDialog],
  template: `<nw-dialog title="Suspend member?" closeLabel="Close">
    Body
    <div nwDialogActions><button type="button" (click)="ref.close(true)">Confirm</button></div>
  </nw-dialog>`,
})
class ConfirmDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

describe('NwDialogService', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove()));

  it('opens a modal labelled by the dialog title and returns the result', () => {
    const ref = TestBed.inject(NwDialogService).open<boolean>(ConfirmDialog, {
      role: 'alertdialog',
    });
    TestBed.tick();
    const container = document.querySelector('[role="alertdialog"]')!;
    expect(container.getAttribute('aria-modal')).toBe('true');
    const title = document.getElementById(container.getAttribute('aria-labelledby')!);
    expect(title?.textContent).toBe('Suspend member?');

    let result: boolean | undefined;
    ref.closed.subscribe((value) => (result = value));
    container.querySelector<HTMLButtonElement>('[nwDialogActions] button')!.click();
    expect(result).toBe(true);
  });

  it('closes from the labelled close button', () => {
    const ref = TestBed.inject(NwDialogService).open(ConfirmDialog);
    TestBed.tick();
    let closed = false;
    ref.closed.subscribe(() => (closed = true));
    document.querySelector<HTMLButtonElement>('.nw-dialog__header [aria-label="Close"]')!.click();
    expect(closed).toBe(true);
  });
});
