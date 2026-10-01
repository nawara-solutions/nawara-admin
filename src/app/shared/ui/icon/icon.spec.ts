import { TestBed } from '@angular/core/testing';
import { NwIcon } from './icon';
import { NW_ICONS } from './icon.registry';

describe('NwIcon', () => {
  it('renders the Lucide nodes as decorative inline SVG', async () => {
    const fixture = TestBed.createComponent(NwIcon);
    fixture.componentRef.setInput('name', 'house');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('svg')?.children.length).toBe(NW_ICONS.house.node.length);
  });

  it('replaces the drawing when the name changes and flags directional icons', async () => {
    const fixture = TestBed.createComponent(NwIcon);
    fixture.componentRef.setInput('name', 'house');
    await fixture.whenStable();
    fixture.componentRef.setInput('name', 'chevron-right');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('svg')?.children.length).toBe(NW_ICONS['chevron-right'].node.length);
    expect(host.classList).toContain('nw-icon--directional');
  });
});
