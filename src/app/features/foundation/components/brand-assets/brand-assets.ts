import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';

/**
 * The Logo Kit (claude.ai design "Nawara Logo Kit", 2026-10-04; docs/BRAND.md §0) on a fixed light and a fixed dark
 * panel: the full logo, the wordmark, the flower symbol and the ink-circle favicon at real pixel sizes.
 */
@Component({
  selector: 'adm-brand-assets',
  imports: [TranslocoPipe, NwBrandMark],
  templateUrl: './brand-assets.html',
  styleUrl: './brand-assets.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'brand-assets', role: 'region', 'aria-labelledby': 'brand-title' },
})
export class BrandAssets {
  protected readonly themes = ['light', 'dark'] as const;
  protected readonly faviconSizes = [16, 32, 48, 64] as const;
}
