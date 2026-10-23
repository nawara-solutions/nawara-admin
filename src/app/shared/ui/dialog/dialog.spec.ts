import { DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
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

@Component({
  imports: [NwDialog],
  template: `<nw-dialog title="Creating" closeLabel="Close" [busy]="busy()">Body</nw-dialog>`,
})
class BusyDialog {
  readonly busy = signal(true);
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

  it('cannot be dismissed while busy: Escape and the close button are ignored until it is not', () => {
    const ref = TestBed.inject(NwDialogService).open<unknown, unknown, BusyDialog>(BusyDialog);
    TestBed.tick();
    let closed = false;
    ref.closed.subscribe(() => (closed = true));
    const close = document.querySelector<HTMLButtonElement>(
      '.nw-dialog__header [aria-label="Close"]',
    )!;
    expect(close.getAttribute('aria-disabled')).toBe('true');
    expect(ref.disableClose).toBe(true);
    close.click();
    expect(closed).toBe(false);
    ref.componentInstance?.busy.set(false);
    TestBed.tick();
    expect(ref.disableClose).toBe(false);
    expect(close.getAttribute('aria-disabled')).toBeNull();
    close.click();
    expect(closed).toBe(true);
  });

  it('starts focus where the caller says, not on the close button', async () => {
    TestBed.inject(NwDialogService).open(ConfirmDialog, { autoFocus: '[nwDialogActions] button' });
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.activeElement?.textContent).toBe('Confirm');
  });
});

@Component({
  imports: [NwDialog],
  template: `<nw-dialog
    title="Edit"
    closeLabel="Close"
    [guarded]="guarded()"
    [busy]="busy()"
    (closeRequested)="requests = requests + 1"
    >Body</nw-dialog
  >`,
})
class GuardedDialog {
  readonly guarded = signal(true);
  readonly busy = signal(false);
  requests = 0;
}

describe('NwDialog guarded', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove()));

  const open = () => {
    const ref = TestBed.inject(NwDialogService).open<unknown, unknown, GuardedDialog>(
      GuardedDialog,
    );
    TestBed.tick();
    let closed = false;
    ref.closed.subscribe(() => (closed = true));
    const escape = () =>
      document
        .querySelector('.cdk-dialog-container')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    const backdrop = () => document.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    const closeButton = () =>
      document.querySelector<HTMLButtonElement>('.nw-dialog__header [aria-label="Close"]')!.click();
    return { ref, closed: () => closed, escape, backdrop, closeButton };
  };

  it('asks its content instead of closing, on Escape, the backdrop and the close button', () => {
    const { ref, closed, escape, backdrop, closeButton } = open();
    escape();
    backdrop();
    closeButton();
    expect(closed()).toBe(false);
    expect(ref.componentInstance?.requests).toBe(3);
  });

  it('closes as usual once unguarded, and stays silent while busy', () => {
    const { ref, closed, escape, closeButton } = open();
    ref.componentInstance?.busy.set(true);
    TestBed.tick();
    escape();
    closeButton();
    expect(ref.componentInstance?.requests).toBe(0);
    expect(closed()).toBe(false);
    ref.componentInstance?.busy.set(false);
    ref.componentInstance?.guarded.set(false);
    TestBed.tick();
    expect(ref.disableClose).toBe(false);
    closeButton();
    expect(closed()).toBe(true);
  });
});
