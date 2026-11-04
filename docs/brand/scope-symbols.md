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

Desktop selector allocation changes from 8rem (12rem wide) to 17rem (19rem wide), with the compact 3.375rem presentation
retained below desktop. The primary and secondary label sizes are 0.875rem and 0.75rem; the symbol height is 1.875rem.
Language and Appearance remain in Settings, using the existing LocaleService, ThemeService and AppearancePanel.
