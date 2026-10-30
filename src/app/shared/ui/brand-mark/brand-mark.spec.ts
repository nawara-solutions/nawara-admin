import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NwBrandMark } from './brand-mark';

@Component({
  imports: [NwBrandMark],
  template: `<nw-brand-mark label="Nawara Solutions" wordmark />
    <nw-brand-mark label="Nawara Solutions" />
    <nw-brand-mark label="Nawara Solutions" full />
    <nw-brand-mark label="Nawara Solutions" inline />`,
})
class Host {}

describe('NwBrandMark', () => {
  it('is one labelled image: lettering and artwork are hidden from assistive technology', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const [wordmark, symbol, full, inline] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('nw-brand-mark'),
    );
    expect(wordmark?.getAttribute('role')).toBe('img');
    expect(wordmark?.getAttribute('aria-label')).toBe('Nawara Solutions');
    // The wordmark: the floral-R artwork (the --nw-logo-wordmark token, per theme and accent palette), no text.
    const word = wordmark?.querySelector('.nw-brand-mark__word');
    expect(word?.getAttribute('aria-hidden')).toBe('true');
    expect(word?.textContent).toBe('');
    expect(wordmark?.querySelector('svg')).toBeNull();
    expect(wordmark?.querySelector('img')).toBeNull();
    expect(wordmark?.querySelector('.nw-brand-mark__solutions')).toBeNull();

    // The floral R alone: artwork (the --nw-logo-symbol token), no text and no drawing.
    expect(symbol?.classList).toContain('nw-brand-mark--symbol');
    expect(symbol?.querySelector('.nw-brand-mark__word')).toBeNull();
    const mark = symbol?.querySelector('.nw-brand-mark__symbol');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(mark?.textContent).toBe('');
    expect(symbol?.querySelector('svg')).toBeNull();

    // The full logo adds the "SOLUTIONS" line between two rules.
    expect(full?.querySelector('.nw-brand-mark__solutions-text')?.textContent).toBe('SOLUTIONS');
    expect(full?.querySelector('.nw-brand-mark__solutions')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(full?.querySelectorAll('.nw-brand-mark__solutions > .nw-brand-mark__rule').length).toBe(
      2,
    );

    // The inline logo: the wordmark, a separator and "SOLUTIONS" on one line, without the rules.
    expect(inline?.classList).toContain('nw-brand-mark--inline');
    expect(inline?.querySelector('.nw-brand-mark__word')).not.toBeNull();
    expect(inline?.querySelector('.nw-brand-mark__separator')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(inline?.querySelector('.nw-brand-mark__solutions-text')?.textContent).toBe('SOLUTIONS');
    expect(inline?.querySelector('.nw-brand-mark__rule')).toBeNull();
  });
});
