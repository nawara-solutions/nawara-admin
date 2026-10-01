import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwButton } from './button';

@Component({
  imports: [NwButton],
  template: `<button nw-button variant="danger" size="sm" type="button">Revoke</button>
    <a nw-button href="/x">Open</a>
    <a nw-button href="/y" aria-disabled="true" (click)="activations = activations + 1">Later</a>
    <a nw-button href="/z" (click)="$event.preventDefault(); activations = activations + 1">Go</a>`,
})
class Host {
  activations = 0;
}

describe('NwButton', () => {
  const render = async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const elements = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.nw-button'),
    );
    return { fixture, elements };
  };

  it('keeps native elements and applies BEM variant classes', async () => {
    const { elements } = await render();
    const [button, link] = elements;
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.classList).toContain('nw-button--danger');
    expect(button?.classList).toContain('nw-button--sm');
    expect(link?.tagName).toBe('A');
    expect(link?.classList).toContain('nw-button--primary');
  });

  it('does not activate a link marked aria-disabled, by click or by keyboard (Enter fires click)', async () => {
    const { fixture, elements } = await render();
    const disabled = elements[2];
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    disabled?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // no navigation
    expect(fixture.componentInstance.activations).toBe(0); // no handler ran
    expect(disabled?.getAttribute('tabindex')).toBeNull(); // stays focusable, so it is discoverable
  });

  it('leaves an enabled link fully active', async () => {
    const { fixture, elements } = await render();
    elements[3]?.click();
    expect(fixture.componentInstance.activations).toBe(1);
  });
});
