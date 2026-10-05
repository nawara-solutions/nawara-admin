import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwControl, NwFormField } from './form-field';

@Component({
  imports: [NwFormField, NwControl],
  template: `
    <nw-form-field label="Email" hint="Work address" [error]="error()" required>
      <input nwControl type="email" />
    </nw-form-field>
    <nw-form-field label="Role"><select nwControl></select></nw-form-field>
    <p id="page-error">Banner about the code</p>
    <nw-form-field label="Code" hint="6 digits" [errorRef]="errorRef()">
      <input nwControl class="code" />
    </nw-form-field>
  `,
})
class Host {
  readonly error = signal<string | undefined>(undefined);
  readonly errorRef = signal<string | undefined>(undefined);
}

describe('NwFormField', () => {
  it('labels the control and describes it by hint, then by hint and error', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector('input')!;
    const label = root.querySelector('label')!;
    expect(label.htmlFor).toBe(input.id);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Work address',
    );

    fixture.componentInstance.error.set('Enter a valid email address.');
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described.length).toBe(2);
    expect(root.querySelector(`#${described[1]}`)?.textContent).toContain(
      'Enter a valid email address.',
    );
  });

  it('gives every control a unique id and selects a chevron', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('input')!.id).not.toBe(root.querySelector('select')!.id);
    expect(root.querySelector('select')?.classList).toContain('nw-control--select');
    expect(root.querySelectorAll('.nw-form-field__chevron').length).toBe(1);
  });

  it('marks the control invalid and described by an error shown elsewhere, without repeating it', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const input = root.querySelector<HTMLInputElement>('input.code')!;
    expect(input.getAttribute('aria-invalid')).toBeNull();

    fixture.componentInstance.errorRef.set('page-error');
    await fixture.whenStable();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const described = input.getAttribute('aria-describedby')!.split(' ');
    expect(described[0]).toBe('page-error');
    expect(described.length).toBe(2);
    expect(input.closest('nw-form-field')?.querySelector('.nw-form-field__error')).toBeNull();
  });
});
