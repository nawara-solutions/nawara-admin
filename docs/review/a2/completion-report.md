# A2 completion pass: report (2026-10-01)

**A2 branch ✅ → Brand assets ⚠️ → Tooling/policies ✅ → Interaction fixes ✅ → Validation ✅ → Visual/RTL/accessibility ⚠️**

The two ⚠️ are limits, not unfinished work: the logo is still an approximation because only a raster brand board exists,
and the rendered checks cover Chrome only, without a real screen reader. **A2 is not marked delivered.**

## 1. What this checkpoint contains

- Brand tokens (the 8 printed palette values, derived ramps), semantic light and dark themes, scales.
- Brand assets: the board's logos, wordmarks and symbols as transparent rasters; a provisional vector symbol; Nawara favicon,
  app icons and manifest.
- Self-hosted IBM Plex fonts, loaded per subset on demand.
- Transloco with English, French and Arabic; `<html lang dir>`; Latin digits for Arabic.
- Theme (system / light / dark) and language preferences in one registry, applied before first paint.
- Five approved primitives and nine extra ones (section 4), and a design-foundation gallery as the root route.
- Checks in `npm run validate`: Prettier, ESLint, Stylelint, translation check, contrast check, unit tests, production build.

No application shell, authentication, organization context or business feature exists.

## 2. Brand: extracted versus approximated

| Item | Status |
|---|---|
| 8 palette colours | **Printed** on the board; used exactly |
| Font family names (IBM Plex Sans, Sans Arabic, Mono) and "Lucide based" | **Printed**; licences verified (OFL-1.1, ISC) |
| Logos, wordmarks and raster symbols | **The board's own pixels**, cut out with transparency; small (largest 388 × 433) |
| Favicon at 16, 32, 48 px | Downscaled from the board raster; readable on light and dark |
| Gradients | **Approximation**: the board prints no stop values |
| Vector symbol (`public/brand/nawara-symbol.svg`) | **Reconstruction, provisional.** Genuine vector paths. Matches the separated petals, central negative space, midrib highlight and magenta tips; does not reproduce the board's fine highlights; colours are pixel samples |
| Icons at 180, 192, 512 px and the maskable icon | Rendered from the reconstruction; maskable safe zone measured inside the limit |
| Font weights, type scale, dark surfaces, status colours | **Proposed** by Admin, not on the board |

Not extracted: the dark poster logo (its glow background cannot be cut out cleanly) and the "N" monogram. The board draws
the flower in two ways (wider petals with orbit rings in the large logo; slimmer without orbits elsewhere); the slimmer one
is used, because the board itself uses it for icons. **An official vector source is still needed.**
Full detail: [`docs/BRAND.md`](../../BRAND.md).

## 3. Tooling and policies

- **Stylelint** (approved): `stylelint-config-recommended-scss` plus project rules: no `@import`; no raw colours outside
  `src/styles/tokens/` (`transparent`, `currentColor` and system colours allowed); BEM-shaped class names.
- **Translation check**: en/fr/ar key parity, and every key referenced as a string literal in templates and TypeScript
  (including `translate('…')`). **Limitation:** a key built at runtime cannot be checked; a literal key prefix is rejected,
  so full keys must be listed.
- **Arabic digits**: Latin digits 0–9 (approved). `formattingLocaleOf` returns `ar-u-nu-latn`; unit-tested; shown in the gallery.
- **Typography**: `latin-ext` was not removed. The per-subset font files declare no `unicode-range`, so every subset was
  downloaded for every user. Plex Sans now uses the range-declared files: an English page fetches only `latin`
  (verified in the browser), and `latin-ext` stays available for names in operator data.
- **Contrast check**: 61 token pairs per theme, including control states and boundaries.

## 4. Extra primitives: for the owner's scope decision

Approved and kept: `nw-icon`, `nw-button`, `nw-form-field`, input (the `nwControl` directive on native `<input>`,
`<select>`, `<textarea>`; native semantics, any forms API), `nw-status-badge`. Nothing below was deleted or extended.

| Extra primitive | Purpose | Depends on | Needed for A2? |
|---|---|---|---|
| `nw-brand-mark` | the logo | brand assets | **Yes** |
| `nw-icon-button` | icon-only button with a required accessible name | `nw-icon` | No (first need: A3 top bar) |
| `nw-link` | inline link styling | — | No |
| `nw-checkbox` | checkbox on a native input | `nw-icon`, Angular forms | No (first real form) |
| `nw-dialog` + service | modal dialog | **CDK Dialog**, `nw-icon-button` | No (first confirmation) |
| `nw-menu` | action menu | **CDK Menu** | No (A3) |
| `nw-data-state` | loading / empty / error block | `nw-icon`, `nw-skeleton` | No (first data view) |
| `nw-skeleton` | loading placeholder | — | No |
| `nw-toast-outlet` + service | transient feedback | `nw-icon`, `nw-icon-button` | No (first mutation) |

Angular CDK is used by dialog, menu, the overlay styles and the locale service's direction sync. If dialog and menu are
deferred, CDK can go with them. Angular Material is not installed.

## 5. Interaction fixes

- The danger button has distinct hover (solid fill) and pressed (darker) states with readable labels, in both themes.
- A link styled as a button with `aria-disabled="true"` no longer activates by click or Enter; it stays focusable.
- The wordmark follows the system palette in forced-colours mode.
- A duplicate landmark name in the gallery was removed (found by axe).

## 6. Results

`npm run validate`, exit 0 ([`validate-output.txt`](validate-output.txt)):

| Step | Result |
|---|---|
| Prettier check, ESLint, Stylelint | pass |
| Translation check | 107 keys in each of en, fr, ar; 112 static references resolve |
| Contrast check | 61 token pairs × 2 themes pass |
| Unit tests | 18 files, 35 tests pass |
| Production build | 295.63 kB initial; no budget warning; budgets unchanged |
| `npm audit` | 0 vulnerabilities |

Rendered checks on the production build ([`rendered-checks.txt`](rendered-checks.txt)):

- 12 renders (light / dark × EN / FR / AR × 1440 / 390 px): theme, language and direction correct before Angular starts;
  no horizontal overflow; no broken images; no console errors.
- System theme followed when nothing is stored; theme and language survive a reload using only `nw.theme` and `nw.locale`.
- Keyboard: 26 tab stops, each with a visible focus ring; the disabled button is skipped.
- Dialog: labelled modal `alertdialog`, focus trapped, Escape closes, focus returns to the trigger. Menu: arrow keys, RTL placement.
- RTL: directional icons mirror, the logo does not; Arabic dates and numbers use Latin digits.
- Reduced motion collapses transitions to 1 ms; forced colours keep control borders.
- axe-core 4.13: 0 violations in all 12 renders and with the dialog open.

A1 guarantees are intact: strict TypeScript and templates, zoneless, the `HttpClient` and forbidden-framework lint rules.

## 7. Open decisions and remaining issues

1. **Official vector logo files** (D-A2-6).
2. **Primitive scope** (D-A2-7): keep or defer the nine extras.
3. Which flower rendition is canonical; whether the compact toolbar logo (symbol + wordmark, no tagline) is acceptable.
4. axe as a project dependency with Playwright (D-A2-5, A3).
5. A Stylelint rule banning physical `left`/`right` properties (D-A2-8); no violation exists today.
6. Not verified: a real screen reader, browsers other than Chrome, text over the gradient, 400 % zoom.
7. One unused translation key: `common.loading`.
8. The CSP hash for the no-flash inline script is scheduled for A14.
