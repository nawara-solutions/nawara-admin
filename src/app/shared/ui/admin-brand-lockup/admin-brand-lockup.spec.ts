import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminBrandLockup } from './admin-brand-lockup';

@Component({
  imports: [AdminBrandLockup],
  template: '<nw-admin-brand-lockup label="Nawara Admin" />',
})
class Host {}

describe('AdminBrandLockup', () => {
  it('keeps the wordmark order, hierarchy labels, and a single accessible name', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const logo = (fixture.nativeElement as HTMLElement).querySelector('nw-admin-brand-lockup');
    expect(logo?.getAttribute('role')).toBe('img');
    expect(logo?.getAttribute('aria-label')).toBe('Nawara Admin');

    const artwork = logo?.querySelector('nw-brand-mark');
    expect(artwork?.getAttribute('aria-hidden')).toBe('true');
    expect(artwork?.querySelector('.nw-brand-mark__word')).not.toBeNull();
    expect(artwork?.querySelector('.nw-brand-mark__word-symbol')).not.toBeNull();
    expect(logo?.querySelector('.admin-brand-lockup__symbol')).toBeNull();
  });
});
