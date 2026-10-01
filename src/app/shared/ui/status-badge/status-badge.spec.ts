import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwStatusBadge } from './status-badge';

@Component({
  imports: [NwStatusBadge],
  template: '<nw-status-badge tone="warning">Pending</nw-status-badge>',
})
class Host {}

describe('NwStatusBadge', () => {
  it('carries meaning by text and icon, not colour alone', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('nw-status-badge');
    expect(badge?.classList).toContain('nw-status-badge');
    expect(badge?.classList).toContain('nw-status-badge--warning');
    expect(badge?.textContent?.trim()).toBe('Pending');
    expect(badge?.querySelector('nw-icon svg')).not.toBeNull();
  });
});
