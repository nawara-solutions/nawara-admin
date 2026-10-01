import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwBrandMark } from './brand-mark';

@Component({
  imports: [NwBrandMark],
  template: `<nw-brand-mark label="Nawara Solutions" wordmark />
    <nw-brand-mark label="Nawara Solutions" />`,
})
class Host {}

describe('NwBrandMark', () => {
  it('is one labelled image built from the brand artwork files', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [lockup, symbol] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nw-brand-mark'),
    );
    expect(lockup?.getAttribute('role')).toBe('img');
    expect(lockup?.getAttribute('aria-label')).toBe('Nawara Solutions');
    // The artwork is decorative inside the labelled host: one accessible name, announced once.
    const images = Array.from(lockup?.querySelectorAll('img') ?? []);
    expect(images.map((image) => image.getAttribute('src'))).toEqual([
      'brand/nawara-symbol.svg',
      'brand/nawara-wordmark.png',
      'brand/nawara-wordmark-on-dark.png',
    ]);
    expect(images.every((image) => image.getAttribute('alt') === '')).toBe(true);
    expect(symbol?.classList).toContain('nw-brand-mark--symbol');
    expect(symbol?.querySelectorAll('img').length).toBe(1);
  });
});
