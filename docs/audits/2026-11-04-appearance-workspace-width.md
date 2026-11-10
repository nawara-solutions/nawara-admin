# Appearance workspace width — Owner visual review

Date: 2026-11-04. Branch: `codex/admin-header-toolbar-refinement`.

The shared Settings host capped its children at `64rem`, inside the shell's existing
`90rem` cap and responsive padding. Removing the nested cap expands the heading,
tabs, Appearance surface, preview and action bar together. The shell's padding and
cap remain authoritative. Language, Account and Company retain their existing
`40rem`, `44rem` and `52rem` form limits.

The existing `2fr 3fr` grid remains 40% controls / 60% preview, excluding the gap.
Its existing `54rem` container breakpoint remains in place. The preview's existing
responsive dashboard and SVG sizing naturally use the extra space; no preview,
card, tile, typography, colour, shadow or preference logic changes were needed.

One compact layout correction keeps the workspace footer in normal flow when
stacked: previously its sticky position covered accent tiles or the preview and
left a reserved blank area below. Desktop sticky positioning and the authentication
popover are unchanged. The bar retains its styling, content and action behavior.

## Measured widths

All values are CSS pixels, measured from the rendered browser. Available width is
the shell main content box after padding. Settings and panel values are border-box
widths. Column widths include each column's own padding/border where applicable.
Fractional differences below 1px are browser rounding. The page uses the existing
17.6px root font, so its rem limits differ from a 16px assumption.

| Viewport width | Available content | Settings before → after | Appearance panel before → after | New controls / preview | Layout |
| --- | --- | --- | --- | --- | --- |
| 1920 | 1513.6 | 1126.4 → 1513.6 | 1126.4 → 1513.6 | 573.0 / 859.5 | 40% / 60% |
| 1440 | 1079.6 | 1079.2 → 1079.2 | 1079.2 → 1079.2 | 399.2 / 598.8 | 40% / 60% |
| 1280 | 919.6 | 919.2 → 919.2 | 919.2 → 919.2 | 864.5 / 864.5 | Stacked |
| 1024 | 663.6 | 663.2 → 663.2 | 663.2 → 663.2 | 626.0 / 626.0 | Stacked |
| 768 | 715.2 | 715.2 → 715.2 | 715.2 → 715.2 | 660.4 / 660.4 | Stacked |
| 390 | 359.2 | 359.2 → 359.2 | 359.2 → 359.2 | 322.0 / 322.0 | Stacked |

At 1920px, Settings uses 100% of its available workspace instead of 74.4%.
The panel gains 387.2px (34.4%); the preview column gains 232.3px (37.0%).
The illustrative dashboard itself grows from 590.0px to 822.3px.
The existing card minimum heights and swatch/icon sizes remain unchanged; the grid
reflows naturally. At the smaller requested widths, the original panel widths
already fill the shell, so they remain unchanged.

## Paired browser screenshots

Chromium, device scale factor 1, viewport height 1080px at every width; identical
before/after viewport dimensions and preference drafts. Full-page captures include
all controls, preview and footer; image height follows the page content. These pairs
show Sapphire light as an unapplied draft, preserving the unsaved indicator.

| Width | Current Appearance | Expanded Appearance |
| --- | --- | --- |
| 1920px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-1920-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-1920-sapphire-light.png) |
| 1440px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-1440-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-1440-sapphire-light.png) |
| 1280px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-1280-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-1280-sapphire-light.png) |
| 1024px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-1024-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-1024-sapphire-light.png) |
| 768px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-768-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-768-sapphire-light.png) |
| 390px | [Before](../../screenshot/appearance-width-2026-11-04/before-en-390-sapphire-light.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-390-sapphire-light.png) |

| Additional comparison | Before | After |
| --- | --- | --- |
| Rose dark draft, wide desktop | [Before](../../screenshot/appearance-width-2026-11-04/before-en-1920-rose-dark.png) | [After](../../screenshot/appearance-width-2026-11-04/after-en-1920-rose-dark.png) |
| Arabic RTL, wide desktop | [Before](../../screenshot/appearance-width-2026-11-04/before-ar-1920-rose-dark.png) | [After](../../screenshot/appearance-width-2026-11-04/after-ar-1920-rose-dark.png) |
| Arabic RTL, mobile | [Before](../../screenshot/appearance-width-2026-11-04/before-ar-390-rose-dark.png) | [After](../../screenshot/appearance-width-2026-11-04/after-ar-390-rose-dark.png) |

Applied themes, including the surrounding shell:

- [Sapphire light, 1920px](../../screenshot/appearance-width-2026-11-04/applied-en-1920-sapphire-light.png).
- [Rose dark, 1440px](../../screenshot/appearance-width-2026-11-04/applied-en-1440-rose-dark.png).
- [Arabic Sapphire light, 1920px](../../screenshot/appearance-width-2026-11-04/applied-ar-1920-sapphire-light.png).
- [Arabic Rose dark, 1440px](../../screenshot/appearance-width-2026-11-04/applied-ar-1440-rose-dark.png).

## Verification

Browser matrix: 1920, 1440, 1280, 1024, 768 and 390px × English/Arabic × Sapphire
light/Rose dark. All 24 final cases passed assertions for full workspace usage,
tab/panel alignment, document width, element overflow, direction, 40/60 columns
where split, footer following the preview where stacked, and action buttons inside
their footer and reachable in the viewport. Both before/after matrices were captured;
selected screenshots are retained in the locally ignored screenshot directory with complete [before measurements](../../screenshot/appearance-width-2026-11-04/before-measurements.json)
and [after measurements](../../screenshot/appearance-width-2026-11-04/after-measurements.json).

The existing tab strip scrolls horizontally within its own boundaries on narrow
screens; all tabs remain reachable. The page naturally scrolls vertically on
compact screens. No document horizontal overflow or nested vertical scrolling was
introduced. Visual inspection covered wide desktop, compact desktop, tablet,
mobile and Arabic RTL; the existing preview labels wrap at mobile widths without
reducing text size. The dashboard, charts, logo and illustrative-data caption remain.

Browser interaction checks passed for draft isolation, applying Sapphire light and
Rose dark globally, reset remaining a draft until applied, and unchanged Language,
Account and Company form widths in English and Arabic.

`npm run validate` passed formatting, ESLint, Stylelint, translations, tokens,
contrast and brand checks. ESLint reports the existing unused disable warning in
`src/main.ts`. Default parallel tests encountered timing-sensitive intermediate-state
failures in `create-organization.action.spec.ts` (first run: 2566/2567 tests passed)
and `admin-invitations.spec.ts` (second run: 2565/2567 passed). Both assertions expect
the in-progress dialog before a short simulated operation completes. No changes to
these tests or their code are included.

Production build and production bundle checks passed. Seven component-style budget
warnings remain, including AppearancePanel (5.42kB against its 4kB warning threshold;
below the 8kB error limit).

The complete suite passed with serial execution: **198 files, 2567 tests**.
Command: `npm test -- --runner-config /tmp/nawara-vitest-serial.mjs`, using a temporary
configuration of `{ test: { maxWorkers: 1, fileParallelism: false } }`. No repository
runner settings were changed. This supports the diagnosis of scheduler-sensitive
failures in the parallel runs; the default `npm run validate` runs themselves were
not entirely green. Production build and bundle checks were executed separately
because that command stops at its failing test step.

Existing unrelated work remains outside this commit. No branch creation, push,
PR, merge or deployment. Awaiting Owner visual review.
