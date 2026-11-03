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

    const content = logo?.querySelector('.admin-brand-lockup__content');
    expect(content?.getAttribute('aria-hidden')).toBe('true');
    const symbol = content?.querySelector('.admin-brand-lockup__symbol');
    const word = content?.querySelector('.admin-brand-lockup__word');
    const nawara = content?.querySelector('.admin-brand-lockup__nawara');
    const separator = content?.querySelector('.admin-brand-lockup__separator');
    const admin = content?.querySelector('.admin-brand-lockup__admin');
    expect(nawara?.textContent).toBe('Nawara');
    expect(admin?.textContent).toBe('Admin');
    expect(symbol!.compareDocumentPosition(word!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(nawara!.compareDocumentPosition(separator!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(separator!.compareDocumentPosition(admin!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
