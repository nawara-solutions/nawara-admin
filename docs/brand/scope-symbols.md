# Scope product symbols

The scope switcher uses the Owner-provided `references/owner-logo-suite-aligned.png` (Solutions puzzle leaf) and
`references/owner-drive-school.png` (School book/cap leaf and Drive vehicle/road leaf). No SVG source was supplied or
found for these identities. These are source-extracted lossless WebP alpha masks and detail layers, following the
existing blue-leaf pipeline, not generated replacement artwork. Geometry and pictograms are not redrawn or enlarged.

Regenerate from the repository root:

```sh
python3 -B tools/brand/extract_scope_symbols.py docs/brand/references/owner-logo-suite-aligned.png docs/brand/references/owner-drive-school.png
```

`ProductSymbol.PRODUCT_BRANDS` maps products to the matching layers and their source aspect ratios. Company and unknown
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

The reference-aligned dropdown uses a 1rem bold title, theme-secondary 0.875rem description, 2.5rem product symbols,
5rem minimum row height, thin row dividers and the existing restrained accent selection surface. The group heading is removed.
