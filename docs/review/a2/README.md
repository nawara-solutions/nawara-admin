# A2 review evidence

Evidence preserved for the owner's review of **A2 — Design-system foundation**. Captured 2026-10-01 from the production build
of the tree in this checkpoint commit, in headless Chrome.

> **A2 is not approved or delivered.** This is a checkpoint for review. Two items remain open: the logo's vector symbol is a
> **provisional reconstruction** (official vector files are still needed), and the **scope of the nine extra primitives** is
> the owner's decision. See [`completion-report.md`](completion-report.md) and [`../../BRAND.md`](../../BRAND.md).

| File | What it shows |
|---|---|
| [`completion-report.md`](completion-report.md) | What was done, brand extraction versus approximation, the extra-primitive table, results, open decisions |
| [`validate-output.txt`](validate-output.txt) | Output of the final `npm run validate` (exit 0) |
| [`rendered-checks.txt`](rendered-checks.txt) | Raw output of the rendered checks: 12-render matrix, system theme, fonts loaded, axe, keyboard, dialog, menu, states, persistence, reduced motion, forced colours |
| `screenshots/desktop-light-en.png` | Gallery, 1440 px, light, English (full page) |
| `screenshots/desktop-dark-ar.png` | Gallery, 1440 px, dark, Arabic, right-to-left (full page) |
| `screenshots/desktop-dark-fr.png` | Gallery, 1440 px, dark, French (full page) |
| `screenshots/mobile-light-en.png` | Gallery, 390 px, light, English (full page) |
| `screenshots/mobile-light-ar.png` | Gallery, 390 px, light, Arabic, right-to-left (full page) |
| `screenshots/mobile-dark-fr.png` | Gallery, 390 px, dark, French (full page) |
| `screenshots/interaction-dialog-forced-colours-rtl-menu-focus.png` | Four panels: confirmation dialog with focus on "Close"; forced-colours mode; menu opened by keyboard in Arabic dark; focus ring on the primary button |
| `screenshots/logo-comparison-board-vs-reconstruction.png` | The brand board's symbol beside the vector reconstruction, on light and dark, with the board's large flower for reference |
| `screenshots/raster-symbols-light-dark.png` | The two raster symbols cut from the board, on their intended backgrounds |
| `screenshots/favicon-16-32-48-light-dark.png` | Favicon at 16, 32 and 48 px on light and dark (enlarged 6× for inspection) |
| `screenshots/app-icons-512-maskable-apple.png` | 512 px icon on light and dark, the maskable icon and the Apple touch icon |

**How it was produced.** The build was served locally and driven through the Chrome DevTools protocol; axe-core 4.13 was
injected at run time. Neither the driver scripts nor axe-core are part of this repository (axe as a project dependency is
decision D-A2-5).

**Limits.** Chrome only. No real screen reader, no other browsers, no 400 % zoom/reflow check; axe cannot assess text over
gradients. Passing token contrast ratios is necessary, not proof of WCAG conformance.
