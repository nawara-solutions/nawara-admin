import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwMenu, NwMenuItem, NwMenuTrigger } from './menu';

@Component({
  imports: [NwMenu, NwMenuItem, NwMenuTrigger],
  template: `
    <button type="button" [nwMenuTriggerFor]="menu">Actions</button>
    <ng-template #menu>
      <nw-menu>
        <button nw-menu-item (triggered)="picked = 'edit'">Edit</button>
        <button nw-menu-item danger>Delete</button>
      </nw-menu>
    </ng-template>
  `,
})
class Host {
  picked = '';
}

describe('NwMenu', () => {
  afterEach(() => document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove()));

  it('opens an ARIA menu from its trigger and reports the triggered item', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector('button')!;
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');

    trigger.click();
    await fixture.whenStable();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const items = document.querySelectorAll<HTMLButtonElement>('[role="menu"] [role="menuitem"]');
    expect(items.length).toBe(2);
    expect(items[1]?.classList).toContain('nw-menu-item--danger');

    items[0]!.click();
    expect(fixture.componentInstance.picked).toBe('edit');
  });
});
