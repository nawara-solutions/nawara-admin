import { TestBed } from '@angular/core/testing';
import { ProductSymbol, PRODUCT_BRANDS } from './product-symbol';

describe('ProductSymbol', () => {
  it('uses the approved company identity as fallback and distinct product assets', async () => {
    const fixture = TestBed.createComponent(ProductSymbol);
    await fixture.whenStable();
    const symbol = fixture.nativeElement as HTMLElement;
    expect(symbol.getAttribute('aria-hidden')).toBe('true');
    expect(symbol.style.getPropertyValue('--nw-product-mask')).toContain(
      PRODUCT_BRANDS.solutions.mask,
    );
    for (const product of ['school', 'drive'] as const) {
      fixture.componentRef.setInput('product', product);
      await fixture.whenStable();
      expect(symbol.style.getPropertyValue('--nw-product-mask')).toContain(
        PRODUCT_BRANDS[product].mask,
      );
      expect(symbol.style.getPropertyValue('--nw-product-details')).toContain(
        PRODUCT_BRANDS[product].details,
      );
    }
  });
});
