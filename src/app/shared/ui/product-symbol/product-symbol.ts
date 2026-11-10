import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlatformProduct } from '../../../core/context/scope.model';

/** Optical SVG emblems for small UI sizes; unknown products use Solutions. */
export const PRODUCT_BRANDS = {
  solutions: {
    mask: '/brand/nawara-scope-leaf-mask.svg',
    details: '/brand/nawara-scope-solutions-details.svg',
    ratio: '1 / 1',
    maskSize: 'contain',
  },
  school: {
    mask: '/brand/nawara-scope-leaf-mask.svg',
    details: '/brand/nawara-scope-school-details.svg',
    ratio: '1 / 1',
    maskSize: 'contain',
  },
  drive: {
    mask: '/brand/nawara-scope-leaf-mask.svg',
    details: '/brand/nawara-scope-drive-details.svg',
    ratio: '1 / 1',
    maskSize: 'contain',
  },
} as const;

@Component({
  selector: 'nw-product-symbol',
  template: '',
  styleUrl: './product-symbol.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[style.--nw-product-mask]': '"url(" + artwork().mask + ")"',
    '[style.--nw-product-details]': '"url(" + artwork().details + ")"',
    '[style.aspect-ratio]': 'artwork().ratio',
    '[style.--nw-product-mask-size]': 'artwork().maskSize',
  },
})
export class ProductSymbol {
  readonly product = input<PlatformProduct | null>(null);
  protected artwork() {
    return PRODUCT_BRANDS[this.product() ?? 'solutions'];
  }
}
