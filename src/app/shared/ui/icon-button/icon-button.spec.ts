import { TestBed } from '@angular/core/testing';
import { NwIconButton } from './icon-button';

describe('NwIconButton', () => {
  it('exposes the label as the accessible name', async () => {
    const fixture = TestBed.createComponent(NwIconButton);
    fixture.componentRef.setInput('icon', 'bell');
    fixture.componentRef.setInput('label', 'Notifications');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('aria-label')).toBe('Notifications');
    expect(host.querySelector('nw-icon')?.getAttribute('aria-hidden')).toBe('true');
  });
});
