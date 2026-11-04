import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PlatformProduct } from '../../../core/context/scope.model';

/** Approved source-extracted botanical symbols; null/unknown products keep the company identity. */
export const PRODUCT_BRANDS = {
  solutions: {
    mask: '/brand/nawara-scope-solutions-mask.webp',
    details: '/brand/nawara-scope-solutions-details.webp',
    ratio: '227 / 188',
  },
  school: {
    mask: '/brand/nawara-scope-school-mask.webp',
    details: '/brand/nawara-scope-school-details.webp',
    ratio: '181 / 170',
  },
  drive: {
    mask: '/brand/nawara-scope-drive-mask.webp',
    details: '/brand/nawara-scope-drive-details.webp',
    ratio: '178 / 170',
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
  },
})
export class ProductSymbol {
  readonly product = input<PlatformProduct | null>(null);
  protected artwork() {
    return PRODUCT_BRANDS[this.product() ?? 'solutions'];
  }
}
