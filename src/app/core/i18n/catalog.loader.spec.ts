import { TestBed } from '@angular/core/testing';
import { CatalogLoader } from './catalog.loader';

describe('CatalogLoader', () => {
  it('loads each supported catalog', async () => {
    const loader = TestBed.inject(CatalogLoader);
    for (const locale of ['en', 'fr', 'ar']) {
      const catalog = await loader.getTranslation(locale);
      expect(Object.keys(catalog)).toContain('brand');
    }
  });

  it('rejects an unsupported locale', async () => {
    await expect(TestBed.inject(CatalogLoader).getTranslation('de')).rejects.toThrow(
      'Unsupported locale',
    );
  });
});
