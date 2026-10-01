import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Brand artwork review for the A2 preview (docs/BRAND.md): the brand board's raster symbol next to its vector
 * reconstruction, the favicon sizes and the board's logos, each on a fixed light and a fixed dark panel.
 */
@Component({
  selector: 'adm-brand-assets',
  imports: [TranslocoPipe],
  templateUrl: './brand-assets.html',
  styleUrl: './brand-assets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'brand-assets', role: 'region', 'aria-labelledby': 'brand-title' },
})
export class BrandAssets {
  protected readonly panels = [
    {
      theme: 'light',
      symbol: 'brand/nawara-symbol.png',
      symbolWidth: 105,
      lockup: 'brand/nawara-logo-horizontal.png',
      lockupKey: 'foundation.brand.lockupLight',
      width: 370,
      height: 113,
    },
    {
      theme: 'dark',
      symbol: 'brand/nawara-symbol-on-dark.png',
      symbolWidth: 98,
      lockup: 'brand/nawara-logo-horizontal-on-dark.png',
      lockupKey: 'foundation.brand.lockupDark',
      width: 347,
      height: 114,
    },
  ] as const;
  protected readonly faviconSizes = [16, 32, 48] as const;
}
