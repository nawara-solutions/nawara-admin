# Scope product symbols

## Small-size clarity update (2026-11-06)

The UI now uses optical SVG redraws of the leaf and the Solutions puzzle, Drive car/road, and School cap/book. These are small-size UI artwork, not official vector masters. `nawara-scope-leaf-mask.svg` and the three `nawara-scope-*-details.svg` files share a 64-unit viewBox and render with `contain`, eliminating fractional raster cropping and stray branch fragments. Theme-driven leaf and pictogram colors are preserved. The extracted WebP layers and original references remain available unchanged below.

The Admin favicon uses the same leaf proportions, with a three-person pictogram drawn directly on the 64-unit grid. The former unequal X/Y scaling is removed. All 22 theme variants and the PNG/ICO/app-icon fallbacks are regenerated from `docs/brand/nawara-admin-favicon.svg`; favicon URLs use cache version `b11`.

## Earlier extracted raster assets

The scope switcher uses the Owner-provided `references/owner-logo-suite-aligned.png` (Solutions puzzle leaf) and
`references/owner-drive-school.png` (School book/cap leaf and Drive vehicle/road leaf). No SVG source was supplied or
found for these identities. These are source-extracted lossless WebP alpha masks and detail layers, following the
existing blue-leaf pipeline, not generated replacement artwork. Geometry and pictograms are not redrawn or enlarged.

Regenerate from the repository root:

```sh
python3 -B tools/brand/extract_scope_symbols.py docs/brand/references/owner-logo-suite-aligned.png docs/brand/references/owner-drive-school.png
```

`ProductSymbol.PRODUCT_BRANDS` maps products to the matching original layers, leaf crop aspect ratios and mask sizes.
The compact marks now show the right-hand leaf and pictogram alone, following the favicon treatment. CSS positions both
source layers at the top right at the same scale; the branches and lower sprig fall outside the crop. The original assets
are preserved, and the same crop is used in the platform cards, selected scope and menu options. Company and unknown
products use Solutions. The same component renders the selected scope and every menu option. The existing
`accent-logo` mixin supplies `--nw-logo-accent` and theme-aware `--nw-logo-detail`; there is no independent logo color state.

The selector expands when its `topbar` container is at least 42rem wide, rather than depending on the viewport alone.
Its expanded allocation is shrinkable from 18rem to 16rem, with 12px inline padding and gaps, 4px block padding, and a
44px height. Below that threshold the existing 3.375rem compact control remains. The primary and secondary label sizes
are 0.875rem and 0.75rem; symbol heights remain 1.875rem expanded and 1.25rem compact.

The popup is capped at 22rem and the viewport width minus 1.5rem, with 8px panel padding and 12px row padding/gaps.
The company row shows the existing All platforms label. Known School/Drive product types show the localized descriptions
from the Owner’s platform-selector reference; unknown products receive no guessed description. Platform names remain domain data.

Header outer padding was unchanged by the logo correction and remains 14px on mobile, space-6 from tablet and space-7
from laptop. The regression was the non-shrinking 17rem selector allocation combined with narrow 6px/10px internal padding.
Toolbar gaps now use space-3 (12px) from tablet, with space-4 (16px) between navigation and tools; the mobile tool gap is
space-2 (8px). Header minimum height stays 4rem. Language and Appearance remain in Settings using existing state/services.

The reference-aligned dropdown uses a 1rem bold title, theme-secondary 0.875rem description, 1.75rem product symbols,
3rem minimum row height, thin row dividers and the existing restrained accent selection surface. The group heading is removed.
