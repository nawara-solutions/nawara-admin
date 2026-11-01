# F1-S6a — visual evidence (shared step-up code entry)

Captured 2026-11-01 with Playwright (Chromium) against `ng serve` (demo build), signed in as the fictional demo owner, on the
**Create platform** verification step (the one migrated flow). Styles come from the real `@nawara-solutions/design-tokens` **0.1.0**
(built from `nawara-frontend` tag `design-tokens-v0.1.0`; its tarball's sha512 equals the lockfile's `integrity`).

| File | Shows |
|---|---|
| `sheet-accents-light.png`, `sheet-accents-dark.png` | the verification step in all 11 accent palettes, light and dark |
| `compare-main-vs-branch-refused.png` | a refused code on `main` (left) and on this branch (right): **pixel-identical** (no differing pixel, 528 × 530) |
| `state-paste-en-dark.png` | after pasting "123 456": the field holds `123456` |
| `rtl-ar-light.png`, `rtl-ar-dark-refused.png` | Arabic, right to left (code field stays left to right), idle and refused |
| `fr-dark.png` | French, dark |
| `mobile-360-ar-dark.png`, `mobile-360-en-light-refused.png` | 360 px wide (device scale 2), Arabic idle and English refused |

Checked in every capture (29 configurations): focus is on the code; `aria-describedby` reads purpose, hint and, when refused, the
error; a refused code is `aria-invalid` and stays in the field; the page has no horizontal scroll. On `main` the purpose was not in
`aria-describedby` (only hint and error).
