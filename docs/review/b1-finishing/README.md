# B1 finishing pass: review evidence (2026-11-01)

Owner finishing pass before merge: a larger people pictogram in the Admin leaf, no "NAWARA ADMIN" label above the sign-in
headline, no patch behind the footer logo, and dark-mode favicons that carry the dark treatment. Dev server (ng serve,
demo build) on `main` `14f1fc6` + this branch; Chromium (Playwright); design tokens 0.1.0, byte-identical to the
published package.

| File | Shows |
|---|---|
| `1-signin-midnight-dark.webp`, `1-signin-coral-dark.webp`, `1-signin-sapphire-dark.webp` | dark sign-in: no label above the headline, larger people pictogram, clean footer |
| `1-people-pictogram-before-after.webp` | the Admin leaf before (left) and after (right): pictogram 1.20x about its centre, 3 px inside the leaf |
| `2-footer-before-after-midnight-dark.webp` | the footer before (top: the erased rectangle in the illustration) and after (bottom) |
| `2-footer-coral-dark.webp`, `2-footer-coral-light.webp` | the footer in Coral, dark and light |
| `3-compact-header-sidebar.webp`, `3-phone-header-midnight-dark.webp`, `3-signin-logo-midnight-dark.webp` | sidebar logo, top-bar scope symbol, phone header |
| `4-favicons-dark-mode.webp` | the 11 dark-mode favicons at 16 / 32 / 64 px on a dark and a light tab: navy pictogram, dark leaf value |

## Checks

```
sign-in midnight dark: eyebrow present=false; headline="Smart solutions powered by AI."; favicon=icons/favicon-midnight.svg?v=b1; copyright line height=16.125
sign-in coral dark: eyebrow present=false; headline="Smart solutions powered by AI."; favicon=favicon.svg?v=b1; copyright line height=16.125
sign-in coral light: eyebrow present=false; headline="Smart solutions powered by AI."; favicon=icons/favicon-coral-light.svg?v=b1; copyright line height=16.125
sign-in sapphire dark: eyebrow present=false; headline="Smart solutions powered by AI."; favicon=icons/favicon-sapphire.svg?v=b1; copyright line height=16.125
shell midnight dark: favicon=icons/favicon-midnight.svg?v=b1
shell sapphire dark: favicon=icons/favicon-sapphire.svg?v=b1
shell emerald light: favicon=icons/favicon-emerald-light.svg?v=b1
```

Footer repair (`tools/brand/repair_botanical_patch.py`): the 2 masters and 22 palette variants of the sign-in illustration
had a fully transparent block (rows 859-895, columns 0-250). Outside the block every file is unchanged to within a mean
premultiplied difference of 0.22 / 255 (one WebP re-encode), alpha identical; the PNG masters are rewritten losslessly.
