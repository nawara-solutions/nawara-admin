# B1 final correction: review evidence (2026-11-01)

Sign-in logo 11 % smaller; Sapphire pictogram white in light mode and navy in dark mode. Dev server (ng serve, demo
build) on `main` `79bd1b7` + this branch; Chromium (Playwright); design tokens 0.1.0, byte-identical to the published
package.

| File | Shows |
|---|---|
| `sapphire-light-dark-side-by-side.webp` | Sapphire and Coral, light and dark: sign-in logo, the copyright Solutions puzzle, phone header |
| `favicons-sapphire-coral.webp` | tab favicons at 16 / 32 / 64 px: Sapphire light (white people), Sapphire dark (navy people), Coral |
| `compact-sapphire-light-dark.webp` | signed-in top bar and sidebar, Sapphire light and dark |
| `signin-*.webp` | full sign-in pages |

## Checks

```
sapphire light 1440px: logo 213.3 x 46.7 at (52.8, 44.0); copyright mark 126.6 x 24.7; favicon icons/favicon-sapphire-light.svg?v=b1
sapphire light 390px: logo 105.2 x 23.0 at (17.6, 19.8); favicon icons/favicon-sapphire-light.svg?v=b1
sapphire dark 1440px: logo 213.3 x 46.7 at (52.8, 44.0); copyright mark 126.6 x 24.7; favicon icons/favicon-sapphire.svg?v=b1
sapphire dark 390px: logo 105.2 x 23.0 at (17.6, 19.8); favicon icons/favicon-sapphire.svg?v=b1
coral light 1440px: logo 213.3 x 46.7 at (52.8, 44.0); copyright mark 126.6 x 24.7; favicon icons/favicon-coral-light.svg?v=b1
coral light 390px: logo 105.2 x 23.0 at (17.6, 19.8); favicon icons/favicon-coral-light.svg?v=b1
coral dark 1440px: logo 213.3 x 46.7 at (52.8, 44.0); copyright mark 126.6 x 24.7; favicon favicon.svg?v=b1
coral dark 390px: logo 105.2 x 23.0 at (17.6, 19.8); favicon favicon.svg?v=b1
signed in, Sapphire light: favicon icons/favicon-sapphire-light.svg?v=b1
after switching to dark (no reload): favicon icons/favicon-sapphire.svg?v=b1
after reload: theme stored=dark favicon icons/favicon-sapphire.svg?v=b1
```

Before this change: desktop sign-in logo 240.0 x 52.6, phone header 118.4 x 25.9 (docs/review/b1-polish/rendered-checks.txt).
