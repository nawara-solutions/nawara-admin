import { TestBed } from '@angular/core/testing';
import { NwDataState } from './data-state';

describe('NwDataState', () => {
  const render = async (state: 'loading' | 'empty' | 'error') => {
    const fixture = TestBed.createComponent(NwDataState);
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('title', 'Organizations');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('announces loading politely with a hidden label and skeleton', async () => {
    const host = await render('loading');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Organizations');
    expect(host.querySelector('nw-skeleton')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('announces errors as alerts and empty states as status', async () => {
    expect((await render('error')).querySelector('[role="alert"]')?.textContent).toContain(
      'Organizations',
    );
    expect((await render('empty')).querySelector('[role="status"]')).not.toBeNull();
  });
});
