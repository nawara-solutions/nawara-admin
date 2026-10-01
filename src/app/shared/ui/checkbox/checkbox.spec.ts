import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NwCheckbox } from './checkbox';

@Component({
  imports: [NwCheckbox, ReactiveFormsModule],
  template: '<nw-checkbox [formControl]="control">Notify the owner</nw-checkbox>',
})
class Host {
  readonly control = new FormControl(false, { nonNullable: true });
}

describe('NwCheckbox', () => {
  it('works as a forms control on a labelled native checkbox', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(input.closest('label')?.textContent).toContain('Notify the owner');

    input.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.control.value).toBe(true);

    fixture.componentInstance.control.setValue(false);
    fixture.componentInstance.control.disable();
    await fixture.whenStable();
    expect(input.checked).toBe(false);
    expect(input.disabled).toBe(true);
  });
});
