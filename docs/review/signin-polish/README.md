# Sign-in brand position and spacing polish: review evidence (2026-11-03)

Baseline: `main` `d3cadb4` (#86 merged). Dev server (ng serve, demo build); Chromium (Playwright), deviceScaleFactor 2;
design tokens 0.1.0, byte-identical to the published package. Before and after use the same viewport sizes.

| File | Shows |
|---|---|
| `dark-midnight-1440.webp`, `dark-rose-1440.webp`, `light-coral-1440.webp` | the full sign-in page, before / after |
| `ar-dark-midnight-1440.webp` | Arabic RTL, dark: the Latin lockup keeps its order, inline-start corner |
| `light-coral-1920.webp`, `light-coral-1280x720.webp` | large and narrow desktop: the three anchors |
| `light-coral-1024x640.webp`, `fr-light-tablet-820.webp`, `fr-dark-mobile-390.webp` | below the desktop breakpoint (no brand panel): phone/tablet header logo |
| `logo-closeup-before-after.webp` | `nawara [symbol] admin` → `[symbol] nawara admin`, dark Midnight and light Coral |
| `reset-button-before-after.webp` | the Appearance popup: full-width bordered reset, icon and label centred |
| `logo-live-accents-dark.webp` | the lockup recoloured live (Rose, Emerald, Sapphire, Midnight), no reload |
| `shell-sidebar-1440-ar-dark.webp`, `shell-sidebar-320-ar-dark.webp` | the sidebar lockup, desktop and the 320 px drawer |

## Measurements (CSS px; x, y, width, height)

| Viewport | Logo before → after | Hero gaps before (top / bottom) | Hero gaps after: box (text) | Card, copyright |
|---|---|---|---|---|
| 1440 x 900 | 35,22 189.4x41.5 → 35,22 216.2x41.5 | 260 / 386 | 288 / 288 (text: 288 / 352) | unchanged |
| 1440 x 900 AR | 1215,22 → 1189,22 (inline-start edge kept) | 269 / 395 | 297 / 297 (297 / 361) | unchanged |
| 1920 x 1080 | 189.4 → 216.2 wide | 330 / 481 | 370 / 370 (370 / 434) | unchanged |
| 1280 x 720 | 189.4 → 216.2 wide | 186 / 287 | 201 / 201 (201 / 265) | unchanged |
| 1024 / 820 / 390 | header logo 105.2 → 120.1 wide, same height | (no brand panel) | (no brand panel) | unchanged |

No horizontal overflow at any size; the sidebar lockup fits at 1440 and in the 320 px drawer (no overflow).

## Behaviour

- Reset (keyboard Enter): dark + Rose → system mode, Coral (accent cleared), favicon `icons/favicon-coral-light.svg`, and the
  button disables itself; the reset logic is unchanged.
- Accent picker (live, no reload): Rose `#f472b6`, Emerald `#34d399`, Sapphire `#046efa`, Midnight `#c8c2dc` on the logo, with
  the matching favicon; Midnight restored after reload.
- Sign-in as the demo owner (EN desktop, AR 320 px): reaches `/overview`.
