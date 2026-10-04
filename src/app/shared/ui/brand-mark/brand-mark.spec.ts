import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwBrandMark } from './brand-mark';

@Component({
  imports: [NwBrandMark],
  template: `<nw-brand-mark label="Nawara Solutions" wordmark />
    <nw-brand-mark label="Nawara Solutions" />
    <nw-brand-mark label="Nawara Solutions" full />`,
})
class Host {}

const sources = (element: Element | undefined) =>
  Array.from(element?.querySelectorAll('img') ?? []).map((image) => image.getAttribute('src'));

describe('NwBrandMark', () => {
  it('is one labelled image: lettering and artwork are hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [wordmark, symbol, full] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nw-brand-mark'),
    );
    expect(wordmark?.getAttribute('role')).toBe('img');
    expect(wordmark?.getAttribute('aria-label')).toBe('Nawara Solutions');
    // The wordmark: "nawa", the bloom for the "r" (one file per background), "a".
    const word = wordmark?.querySelector('.nw-brand-mark__word');
    expect(word?.getAttribute('aria-hidden')).toBe('true');
    expect(word?.textContent?.replace(/\s+/g, '')).toBe('nawaa');
    expect(sources(wordmark)).toEqual([
      'brand/nawara-bloom-coral.svg',
      'brand/nawara-bloom-glow.svg',
    ]);
    expect(Array.from(wordmark?.querySelectorAll('img') ?? []).every((i) => i.alt === '')).toBe(
      true,
    );
    expect(wordmark?.querySelector('.nw-brand-mark__solutions')).toBeNull();

    // The bloom alone.
    expect(symbol?.classList).toContain('nw-brand-mark--symbol');
    expect(symbol?.querySelector('.nw-brand-mark__word')).toBeNull();
    expect(sources(symbol)).toEqual([
      'brand/nawara-bloom-coral.svg',
      'brand/nawara-bloom-glow.svg',
    ]);

    // The full logo adds the "SOLUTIONS" line and its flourish.
    expect(full?.querySelector('.nw-brand-mark__solutions-text')?.textContent).toBe('SOLUTIONS');
    expect(full?.querySelector('.nw-brand-mark__solutions')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(sources(full)).toContain('brand/nawara-solutions-flourish.svg');
    expect(sources(full)).toContain('brand/nawara-solutions-flourish-glow.svg');
  });
});
