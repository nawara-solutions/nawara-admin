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

describe('NwBrandMark', () => {
  it('is one labelled image: lettering and artwork are hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [wordmark, symbol, full] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nw-brand-mark'),
    );
    expect(wordmark?.getAttribute('role')).toBe('img');
    expect(wordmark?.getAttribute('aria-label')).toBe('Nawara Solutions');
    // The wordmark: "nawa", the bloom for the "r" (inline, palette-coloured), "a".
    const word = wordmark?.querySelector('.nw-brand-mark__word');
    expect(word?.getAttribute('aria-hidden')).toBe('true');
    expect(word?.textContent?.replace(/\s+/g, '')).toBe('nawaa');
    const bloom = wordmark?.querySelector('svg.nw-brand-mark__bloom');
    expect(bloom?.getAttribute('aria-hidden')).toBe('true');
    // Colours come from the --nw-logo-* tokens, so the logo follows the theme and the accent palette.
    expect(bloom?.querySelector('rect')?.getAttribute('style')).toContain('var(--nw-logo-mid)');
    expect(wordmark?.querySelector('img')).toBeNull();
    expect(wordmark?.querySelector('.nw-brand-mark__solutions')).toBeNull();

    // The bloom alone.
    expect(symbol?.classList).toContain('nw-brand-mark--symbol');
    expect(symbol?.querySelector('.nw-brand-mark__word')).toBeNull();
    expect(symbol?.querySelector('svg.nw-brand-mark__bloom')).not.toBeNull();

    // The full logo adds the "SOLUTIONS" line and its flourish.
    expect(full?.querySelector('.nw-brand-mark__solutions-text')?.textContent).toBe('SOLUTIONS');
    expect(full?.querySelector('.nw-brand-mark__solutions')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(full?.querySelector('svg.nw-brand-mark__flourish')).not.toBeNull();
  });

  it('gives every logo its own gradient ids, so several can share a page', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const ids = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('linearGradient, radialGradient'),
    ).map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    const used = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[fill^="url(#"]'),
    );
    expect(used.every((el) => ids.includes(el.getAttribute('fill')!.slice(5, -1)))).toBe(true);
  });
});
