"""Derive the sidebar logo (flower + NAWARA + SOLUTIONS, without divider and tagline) from the board's lockups (docs/BRAND.md).

Provenance tool, not part of the build. Needs Python 3 with numpy and Pillow.
Usage: python3 tools/brand/derive_sidebar_logo.py

Input:  public/brand/nawara-logo-horizontal.png          (the brand board's own pixels, light lockup card)
        public/brand/nawara-logo-horizontal-on-dark.png  (the brand board's own pixels, dark lockup card)
        public/brand/nawara-logo-stacked.png             (the brand board's own pixels, large light logo with orbits)
Output: public/brand/nawara-logo-sidebar.png             light surfaces (horizontal)
        public/brand/nawara-logo-sidebar-on-dark.png     dark surfaces (horizontal)
        public/brand/nawara-logo-sidebar-stacked.png     light surfaces (stacked: flower with orbits, NAWARA, SOLUTIONS)

- No pixel is redrawn, recoloured or reshaped. The approved Company Overview shows the horizontal lockup without the
  divider and the "SMART SOLUTIONS, POWERED BY AI" tagline (about 4 px tall at sidebar size), so those rows are made
  transparent in the lettering columns only; the flower, which spans the full height, is untouched.
- The board's lockup flower is the slim rendition without orbit rings (docs/BRAND.md §4); the mockup's small orbit dots
  are not on the board's lockup and are not invented here.
- The stacked logo of the refined Company Overview (flower with orbit rings above NAWARA and SOLUTIONS) is the board's
  large light logo with only the divider and tagline rows made transparent. The board has NO transparent stacked logo
  for dark surfaces (its dark poster sits on a gradient glow that cannot be cut out cleanly), so none is derived.
- Resolution limit: about 370 px wide (113 px tall); at the sidebar's display width (about 12 rem) that is roughly
  1.9x density. It must not be enlarged further. Official vector artwork (D-A2-6) replaces both files, no consumer change.
"""
import numpy as np
from PIL import Image

# (source, output, first lettering column, first row below SOLUTIONS) measured from alpha occupancy:
# light: NAWARA rows 16-55, SOLUTIONS 62-76, divider 81-88, tagline 92-104, lettering from column 123;
# dark:  NAWARA rows 16-51, SOLUTIONS 62-73, divider 82-85, tagline 91-104, lettering from column 114;
# stacked: flower rows 2-265, NAWARA 283-338, SOLUTIONS 359-377, divider 394-396, tagline 413-430 (full width).
JOBS = [
    ('public/brand/nawara-logo-horizontal.png', 'public/brand/nawara-logo-sidebar.png', 110, 79),
    ('public/brand/nawara-logo-horizontal-on-dark.png', 'public/brand/nawara-logo-sidebar-on-dark.png', 108, 78),
    ('public/brand/nawara-logo-stacked.png', 'public/brand/nawara-logo-sidebar-stacked.png', 0, 386),
]

for src, out, lettering_x, cut_y in JOBS:
    im = np.asarray(Image.open(src).convert('RGBA')).copy()
    im[cut_y:, lettering_x:, 3] = 0
    alpha = im[..., 3] > 0
    ys, xs = np.where(alpha)
    cropped = im[: ys.max() + 1, : xs.max() + 1]
    Image.fromarray(cropped).save(out, optimize=True)
    print(f'{out}: {cropped.shape[1]}x{cropped.shape[0]}')
