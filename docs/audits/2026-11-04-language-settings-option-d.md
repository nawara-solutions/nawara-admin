# Language Settings — Option D visual review

Date: 2026-11-04. Branch: `codex/admin-header-toolbar-refinement`.
Reference: Owner-supplied “Six Language Settings UI Options.png”, Option D.

The Language page now presents three globe tiles with a language name and reading
direction beside each icon. The selected tile has a thin accent border, subtle
accent surface, accent text/icon and a small check at the upper trailing corner.
The browser-local explanation follows the tiles with a small information icon.
No flags, country imagery, gradients or tile shadows were introduced.

The grid uses the shared Settings width, capped at `72rem` so ultrawide tiles stay
proportionate. It has three equal columns from a `36rem` content width and stacks
below that. The supporting description and note retain a readable `65ch` limit.
Existing native radios remain the single-selection controls inside full-tile labels;
they use the existing visually hidden utility, visible tile focus rings, named
languages and explicit direction metadata. The language registry and LocaleService
still own immediate selection, catalog activation, direction and browser persistence.

## Changed files

- `src/app/features/settings/pages/language-settings.page.ts`: tile markup, shared
  icons, accessible names/descriptions and registry-derived direction metadata.
- `src/app/features/settings/pages/language-settings.page.scss`: local tile grid,
  accent/focus states, responsive spacing and readable text alignment.
- `src/app/features/settings/pages/settings-pages.spec.ts`: additional checks for
  globe/check rendering, selected-tile movement, accessible metadata, absence of
  nested controls and restoring Arabic on a direct Language route.
- This verification report.

No other production files are part of this change. Existing uncommitted Appearance,
branding and toolbar refinements were preserved and remain outside this commit.
The superseded Option B list is not included.

## Screenshots

Google Chrome 149.0.7827.196, 1080px viewport height, device scale factor 1 unless
noted. These are actual browser captures; full-page image height follows content.
Files are local review artifacts in the repository's already ignored `screenshot/`
directory.

| Case | Screenshot |
| --- | --- |
| Before: original narrow Language card, 1440px | [Before](../../screenshot/language-option-d-2026-11-04/before-en-1440.png) |
| English selected / Sapphire light / 1440px | [English](../../screenshot/language-option-d-2026-11-04/chrome-1440-en-sapphire-light.png) |
| Français selected / Sapphire light / 1440px | [Français](../../screenshot/language-option-d-2026-11-04/chrome-1440-fr-sapphire-light.png) |
| العربية selected / RTL / Sapphire light / 1440px | [Arabic RTL](../../screenshot/language-option-d-2026-11-04/chrome-1440-ar-sapphire-light.png) |
| Rose dark / 1440px | [Rose dark](../../screenshot/language-option-d-2026-11-04/chrome-1440-en-rose-dark.png) |
| Emerald light / 1440px | [Emerald light](../../screenshot/language-option-d-2026-11-04/chrome-1440-en-emerald-light.png) |
| Wide desktop / 1920px | [Wide desktop](../../screenshot/language-option-d-2026-11-04/chrome-1920-en-sapphire-light.png) |
| Compact desktop / Français / Rose dark / 1024px | [Compact desktop](../../screenshot/language-option-d-2026-11-04/chrome-1024-fr-rose-dark.png) |
| Tablet / 768px | [Tablet](../../screenshot/language-option-d-2026-11-04/chrome-768-en-sapphire-light.png) |
| Mobile / 390px | [Mobile](../../screenshot/language-option-d-2026-11-04/chrome-390-en-sapphire-light.png) |
| Arabic mobile / Emerald light / 390px | [Arabic mobile](../../screenshot/language-option-d-2026-11-04/chrome-390-ar-emerald-light.png) |
| Keyboard focus / Français / Pearl | [Keyboard focus](../../screenshot/language-option-d-2026-11-04/chrome-keyboard-focus-fr-1440.png) |
| System mode / Pearl / 1440px | [System](../../screenshot/language-option-d-2026-11-04/chrome-1440-en-pearl-system.png) |
| 200% zoom-equivalent reflow / Français | [Zoom reflow](../../screenshot/language-option-d-2026-11-04/chrome-zoom-200-fr.png) |

Firefox could not be tested: the available `/usr/bin/firefoxdev` launcher points to
`/home/anwar/Downloads/firefox/firefox`, which does not exist; no Playwright Firefox
binary is installed. No browser downloads or dependencies were added.

## Verification

- Focused Settings/localization/route tests: **5 files, 21 tests passed**.
- Repository `npm run validate`: **passed**, including all **198 files / 2568 tests**,
  formatting, ESLint, Stylelint, translations, tokens, contrast, brand checks,
  production build and production-bundle checks. No test failures on this run.
- The production build/bundle checks and focused formatting/Stylelint checks were
  repeated after the final CSS text-alignment correction and passed.
- Existing warnings: unused ESLint disable in `src/main.ts`; seven component-style
  warning budgets outside the Language page. No Language style budget warning.
- Browser matrix: **72 cases** — six widths (1920, 1440, 1280, 1024, 768, 390) × three
  locales × Sapphire light, Rose dark, Emerald light and Pearl System.
- Browser assertions cover tile heights/positions, workspace alignment, no document
  horizontal overflow or clipped content, exactly three options, one selected
  check, accessible language names, translation updates and correct RTL/LTR.
- All **11 accents in Light and Dark** passed selected tint and state checks.
  Actual rendered selected-label contrast was checked for all 22 combinations:
  minimum **5.21:1**, exceeding 4.5:1. Selected globe colours match the label tokens.
- Native keyboard arrows moved English → Français → العربية → Français, updating
  selected radios, locale and direction without leaving the Language route.
  Keyboard focus remained visible on the tile; Tab left the radio group as one stop.
- Browser-local persistence, Settings tab navigation and the saved French selection
  after refresh/re-authentication passed. The direct-route unit test restores Arabic.
- System mode followed both emulated OS dark and light preferences.
- Zoom-equivalent reflow passed for all three locales at **200% and 400%**. These
  checks used 720×540 / 360×270 CSS viewports with 2× / 4× device metrics, equivalent
  to the available CSS space of a 1440×1080 display at those zoom levels; they do not
  claim a browser-toolbar zoom interaction. No horizontal overflow was observed.
- No browser page errors were recorded.

The demo session lives only in memory. Refreshing a protected Language URL requires
sign-in again; the existing sign-in return allowlist lands the owner on Overview.
Returning to Language retains the saved selection and translation. This existing
routing limitation was verified and left unchanged under the strict Language-only
scope.

Complete [browser measurements](../../screenshot/language-option-d-2026-11-04/measurements.json)
and additional locale/theme screenshots are retained with the local review artifacts.

## Rendered dimensions

CSS pixels, Sapphire light / English. The existing root font is 17.6px.

| Viewport | Settings width | Tile grid width | Tile width | Tile height | Layout |
| --- | --- | --- | --- | --- | --- |
| 1920 | 1513.6 | 1267.2 | 410.7 | 123.2 | Three columns |
| 1440 | 1079.2 | 1079.2 | 348.0 | 123.2 | Three columns |
| 1280 | 919.2 | 919.2 | 294.7 | 123.2 | Three columns |
| 1024 | 663.2 | 663.2 | 209.3 | 123.2 | Three columns |
| 768 | 715.2 | 715.2 | 226.7 | 123.2 | Three columns |
| 390 | 359.2 | 359.2 | 359.2 | 123.2 | Stacked |

Original Language host width at 1440px was 704px (`40rem`); the new tile grid uses
the full 1079.2px Settings workspace there. At 1920px, the 1267.2px (`72rem`) grid
cap keeps each tile near 410.7px rather than stretching across all 1513.6px.
In Arabic the capped grid stays aligned to the workspace's right reading edge.

No branch switch, push, PR, merge or deployment. Stopped for Owner visual review.
