# Nawara brand in Nawara Admin

- **Source:** the *Nawara Solutions Brand Identity Board* supplied by the owner (2026-10-01), a **1536 × 1024 raster image**.
  No vector artwork, font files or written guidelines were supplied.
- **Purpose:** record what the board *states*, what was *sampled* from its pixels, and what Admin *proposes* for UI use, so an
  approximation is never mistaken for a brand value.
- **Status of the logo:** board rasters are faithful but small; the vector symbol is a **provisional reconstruction**.
  **An official vector source (symbol, wordmark, lockups) is still needed** (D-A2-6).

## 1. Provenance classes

| Class | Meaning | Where |
|---|---|---|
| **Printed** | written on the board as text; authoritative | the 8 palette hex codes, the 3 font family names, "Icon style (Lucide based)" |
| **Sampled** | measured from the board's pixels; approximate (raster, anti-aliasing, and the board's swatches do not match its own printed codes exactly) | gradient stops, petal colours, logo geometry |
| **Derived / proposed** | created by Admin for UI needs; not brand values | ramp steps, dark-theme surfaces, status colours, focus ring, type scale and weights |

## 2. Palette

Printed codes are used exactly, as the `brand`-marked values in `src/styles/tokens/_primitives.scss`.

| Name (board) | Printed | Board swatch as rendered (sampled) | Token |
|---|---|---|---|
| Primary | `#E6428B` | `#E6477A` | `--nw-ref-pink-500` |
| Secondary | `#FF8A3D` | `#FE8143` | `--nw-ref-orange-500` |
| Accent | `#FFC857` | `#FEBE5A` | `--nw-ref-amber-500` |
| Purple | `#7B2CBF` | `#742DBB` | `--nw-ref-purple-600` |
| Dark | `#1B1B24` | `#101117` | `--nw-ref-neutral-850` |
| Muted | `#6B7280` | `#686B78` | `--nw-ref-neutral-500` |
| Surface | `#FAF7F4` | `#F8F4F0` | `--nw-ref-neutral-50` |
| White | `#FFFFFF` | `#FEFEFE` | `--nw-ref-neutral-0` |

The rendered swatches differ from the printed codes by up to 17 per channel, so **pixel-sampled colours from this board are
approximate by nature**. A small garbled glyph follows the word "Primary" on the board; it carries no information.

**Gradients.** The board shows two bars and prints **no stop values**. Samples: bar 1 `#DB1863 → #F64D66 → #FEBD5A`, bar 2
`#6429B4 → #C033AF → #FE71A6`, left to right with a slight downward tilt (about 100°). Admin's `--nw-gradient-brand` and
`--nw-gradient-brand-cool` are **approximations built from the printed palette** at 90°. Gradients are reserved for brand
expression (hero emphasis, illustration), never for text backgrounds or controls.

**Contrast decides usage.** Primary pink on white is 3.81:1, below WCAG AA for body text, so solid actions use the derived
`#C42A6F` in light mode (white text, 5.37:1) and `#EB66A1` with dark ink in dark mode (5.65:1). Orange and amber are decorative
or status accents, not text colours on light surfaces.

**Derived, not brand:** every unmarked ramp step, the dark page `#13131A` and other dark surfaces, the inverse ink, status green
and red, the focus ring, shadows. `npm run check:contrast` checks the token pairs the controls use (61 pairs per theme).

## 3. Typography

| | Printed on the board | Admin (proposed) |
|---|---|---|
| UI family | **IBM Plex Sans** | weights 400 / 500 / 600 |
| Arabic family | **IBM Plex Sans Arabic** | weights 400 / 500 / 600; larger line height; no letter-spacing |
| Monospace | **IBM Plex Mono** | 400 / 500, for ids and codes |

- Only the **family names** are printed. Weights, sizes, line heights and spacing are **not on the board**; the scale in
  `src/styles/tokens/_scales.scss` is a proposal. The board's own specimen glyphs are malformed (it is an illustration), so
  they are not evidence of rendering.
- **Licences (verified in the installed packages):** `@fontsource/ibm-plex-sans`, `-sans-arabic`, `-mono` 5.3.0, SIL OFL 1.1,
  © IBM Corp. Self-hosted through the build; no font CDN.
- **Loading:** Plex Sans uses the package's range-declared files (`400.css` …), so a subset is downloaded only when a
  character needs it. Verified in the browser: an English page fetches `latin` only. `latin-ext` stays available for operator
  data (names such as "ő", "ş") at no cost until used. UI copy needs: EN and FR `latin`; AR `arabic` + `latin`.
- **Logo lettering is not a UI font.** "NAWARA" on the board is custom geometric lettering (rounded stroke ends; each "A" has
  no crossbar and carries a pink dot). It is never typeset with IBM Plex or any other font.
- **Arabic digits:** Latin digits 0–9 (owner decision D-A2-3, approved). Formatting uses `ar-u-nu-latn`
  (`formattingLocaleOf` in `src/app/core/i18n/locale.ts`).

## 4. Logo assets (`public/brand/`)

| File | Size (px) | Source | Use |
|---|---|---|---|
| `nawara-logo-stacked.png` | 388 × 433 | board, large light logo (flower with orbits, wordmark, divider, tagline) | light backgrounds |
| `nawara-logo-horizontal.png` | 370 × 113 | board, light lockup card | light backgrounds |
| `nawara-logo-horizontal-on-dark.png` | 347 × 114 | board, dark lockup card | dark backgrounds |
| `nawara-wordmark.png` | 251 × 64 | board, light lockup ("NAWARA" + "SOLUTIONS") | light backgrounds |
| `nawara-wordmark-on-dark.png` | 219 × 61 | board, dark lockup | dark backgrounds |
| `nawara-symbol.png` | 105 × 113 | board, light lockup flower | light backgrounds |
| `nawara-symbol-on-dark.png` | 98 × 113 | board, dark lockup flower (glow with real transparency) | dark backgrounds, transparent icons |
| `nawara-symbol.svg` | vector | **reconstruction, provisional** | in-app symbol, large icons |

- The PNGs are **the board's own pixels**, cut out with transparency by `tools/brand/extract_board_assets.py`; nothing is
  redrawn. They are at the board's native resolution and must not be enlarged.
- **Not extracted:** the dark poster logo (its background is a strong gradient glow, so a clean cut-out is not possible) and
  the "N" monogram tile. Use the dark horizontal lockup on dark backgrounds.
- **The board is not internally consistent:** the large logo's flower has wider petals and orbit rings; the lockups and app
  tiles show a slimmer flower without orbits. Admin uses the lockup rendition as "the symbol", because the board itself uses
  it for icons. The owner should confirm which is canonical.

### The vector symbol is a reconstruction

`nawara-symbol.svg` contains genuine vector paths (no embedded raster). It was redrawn from measurements of the board:
six petals 60° apart, each a lens from 0.08 R to the tip with a maximum half-width of about 0.23 R, two-toned along its
midrib, running cream → amber → coral → pink → magenta (tips sampled at `#DC30A1` / `#CB2496`, colours that are not in the
printed palette), with a warm white centre glow. It matches the board's separated petals, central negative space, midrib
highlight and tip colour; it does **not** reproduce the board's fine brush-like highlights, and its colours are samples.
It is close, **not exact**. The design-foundation gallery shows it beside the board raster on light and dark panels.

### In the application

`nw-brand-mark` renders the reconstruction symbol and, when asked for the wordmark, the **board's own wordmark raster**
(dark lettering on light surfaces, light lettering on dark ones). The tagline is omitted at toolbar size, where it would be
about 4 px tall; the full lockups with the tagline are the PNG files above. *This compact usage is a proposal for owner
confirmation.* The logo never mirrors in right-to-left layouts.

## 5. Icons

| File | Size | Source | Notes |
|---|---|---|---|
| `public/favicon.ico` | 16, 32, 48 | board raster symbol, downscaled | transparent; checked readable on light and dark |
| `public/icons/icon-16.png`, `-32`, `-48` | as named | board raster symbol, downscaled | |
| `public/icons/icon-192.png`, `-512` | as named | **reconstruction** | transparent; the 102 px board raster cannot be enlarged 5× |
| `public/apple-touch-icon.png` | 180 | **reconstruction** on white | opaque, as iOS requires |
| `public/icons/icon-maskable-512.png` | 512 | **reconstruction** on white | **safe zone verified**: artwork within 144.9 px of the centre (limit 204.8 px) |
| `public/manifest.webmanifest` | — | | `display: browser`; an operator console, not an installable app |

Declared in `src/index.html`. UI icons are **Lucide** through `nw-icon` (the board prints "Lucide based"); the flower is a
logo, never a UI icon set.

## 6. Open items for the owner

1. **Official vector artwork** (symbol, wordmark, lockups, light and dark): replaces the reconstruction and the rasters with no
   consumer change (D-A2-6).
2. Which flower rendition is canonical (with or without orbits).
3. Confirm the compact toolbar usage (symbol + wordmark, no tagline).
4. Exact gradient stops and angle, if the brand defines them.
5. Whether a monogram ("N") mark is part of the identity.
