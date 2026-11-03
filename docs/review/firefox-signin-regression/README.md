# Firefox sign-in comparison

Headless Chromium 149 and Firefox 159 screenshots were captured at DPR 1 with matching CSS viewport sizes. Firefox's headless window enforces a 500px minimum width, so the mobile comparison uses 500×844 in both browsers.

The `firefox-before-*` images reproduce the prior CSS by resetting only `white-space` on the company-name span in the page. They show the original Firefox line break; all other styles and assets are the same as the after images.

| Viewport | Light / Sapphire | Dark / Rose |
| --- | --- | --- |
| 1920×1080 | `chrome-light-sapphire-1920x1080.png`, `firefox-light-sapphire-1920x1080.png` | `chrome-dark-rose-1920x1080.png`, `firefox-dark-rose-1920x1080.png` |
| 1440×900 | `chrome-light-sapphire-1440x900.png`, `firefox-light-sapphire-1440x900.png` | `chrome-dark-rose-1440x900.png`, `firefox-dark-rose-1440x900.png` |
| 1280×800 | `chrome-light-sapphire-1280x800.png`, `firefox-light-sapphire-1280x800.png` | `chrome-dark-rose-1280x800.png`, `firefox-dark-rose-1280x800.png` |
| 500×844 mobile | `chrome-light-sapphire-500x844.png`, `firefox-light-sapphire-500x844.png` | `chrome-dark-rose-500x844.png`, `firefox-dark-rose-500x844.png` |

The measured layout and viewport geometry are in `metrics.json`.
