"""Extract the transparent logo assets in public/brand/ from the Nawara brand board (docs/BRAND.md).

Provenance tool, not part of the build. Needs Python 3 with numpy, scipy and Pillow.
Usage: python3 tools/brand/extract_board_assets.py "<path to the brand board PNG>" <output directory>

Each asset is matted against the background measured around it on the board:
- fully covered pixels keep their exact board colour at alpha 1;
- edge pixels get alpha by projecting (pixel - background) onto (local foreground - background) and take the local
  foreground colour, which removes the background fringe;
- on the dark card only pixels lighter than the card count, so its shadow smudges are not artwork;
- holes are filled only at the flower's centre (its white glow on the white card), never in lettering.
No pixel is redrawn or reshaped. Favicons and large icons are produced separately (docs/BRAND.md).
"""
import sys, json
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

BOARD = sys.argv[1]
OUT = sys.argv[2]
im = np.asarray(Image.open(BOARD).convert('RGB')).astype(np.float64)


def smooth_background(region, fg_mask):
    """Background model: normalized convolution of non-foreground pixels (handles the hero's soft gradient)."""
    w = (~fg_mask).astype(np.float64)
    bg = np.empty_like(region)
    for c in range(3):
        num = ndi.gaussian_filter(region[..., c] * w, 25)
        den = ndi.gaussian_filter(w, 25)
        bg[..., c] = num / np.maximum(den, 1e-6)
    return bg


def extract(box, t_hi, t_lo, flat=True, min_component=4, fill_box=None, lighter_only=False, tidy=False):
    x0, y0, x1, y1 = box
    r = im[y0:y1, x0:x1]
    border = np.concatenate([r[0], r[-1], r[:, 0], r[:, -1]])
    bg = np.broadcast_to(np.median(border, 0), r.shape).copy()
    if not flat:
        rough = np.linalg.norm(r - bg, axis=2) > t_lo
        bg = smooth_background(r, ndi.binary_dilation(rough, iterations=6))
    # On a dark background only pixels LIGHTER than it are foreground (excludes the card's shadow smudges).
    d = np.linalg.norm(np.maximum(r - bg, 0) if lighter_only else r - bg, axis=2)

    core = d > t_hi
    if fill_box is not None:
        # Fill holes only inside the flower (keeps its white centre glow); never in text, whose counters stay open.
        fx0, fy0, fx1, fy1 = fill_box
        sub = ndi.binary_closing(core[fy0:fy1, fx0:fx1], iterations=3)
        holes, _ = ndi.label(ndi.binary_fill_holes(sub) & ~sub)
        centre = holes[(fy1 - fy0) // 2, (fx1 - fx0) // 2]   # only the hole at the flower's centre (its glow)
        if centre:
            core[fy0:fy1, fx0:fx1] |= (holes == centre) | sub
    lab, n = ndi.label(core)
    sizes = ndi.sum(core, lab, range(1, n + 1))
    core = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_component])

    cand = (d > t_lo) | core
    solid = ndi.binary_erosion(core)          # fully covered pixels: exact colour, alpha 1
    d_inner = np.where(solid, d + 1000, d)    # prefer a fully covered neighbour as the local foreground colour
    # Local foreground colour: the pixel with the largest distance from background in a 5x5 window.
    idx = np.arange(d.size).reshape(d.shape)
    best = ndi.generic_filter(d_inner, lambda v: np.argmax(v), size=5, mode='nearest').astype(int)
    oy, ox = np.divmod(best, 5)
    yy, xx = np.indices(d.shape)
    fy = np.clip(yy + oy - 2, 0, d.shape[0] - 1)
    fx = np.clip(xx + ox - 2, 0, d.shape[1] - 1)
    F = r[fy, fx]
    strong_f = d[fy, fx] > min(t_hi, 40) * 0.75   # an edge pixel must border real foreground, not a pale speck
    diff = F - bg
    alpha = np.einsum('ijk,ijk->ij', r - bg, diff) / np.maximum(np.einsum('ijk,ijk->ij', diff, diff), 1e-6)
    alpha = np.clip(alpha, 0, 1)
    near = ndi.binary_dilation(cand, iterations=1)
    alpha = np.where(solid, 1.0, np.where(near & strong_f, alpha, 0.0))
    alpha[alpha < 0.03] = 0
    # Drop small detached fragments (noise); long thin orbit lines survive.
    lab, n = ndi.label(alpha > 0, structure=np.ones((3, 3)))
    sizes = ndi.sum(alpha > 0, lab, range(1, n + 1))
    alpha[~np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= min_component])] = 0
    solid &= alpha > 0
    if tidy:
        # Symbol only: faint glow speckle in the gaps between petals is not artwork; keep soft edges next to solid pixels.
        far = ndi.distance_transform_edt(~solid) > 1.5
        alpha[far & (alpha < 0.45)] = 0

    a = np.maximum(alpha, 1e-6)[..., None]
    # Colour decontamination: an edge pixel takes its local foreground colour (no background fringe); core keeps its pixel.
    color = np.where(solid[..., None], r, F)
    rgba = np.dstack([color, alpha * 255]).round().astype(np.uint8)

    ys, xs = np.nonzero(alpha > 0)
    pad = 2
    crop = rgba[max(ys.min() - pad, 0):ys.max() + pad + 1, max(xs.min() - pad, 0):xs.max() + pad + 1]
    return Image.fromarray(crop, 'RGBA'), {
        'board_box': box, 'background_rgb': [int(v) for v in np.median(border, 0)], 'background_model': 'flat' if flat else 'smoothed',
        'size_px': list(crop.shape[1::-1]),
    }


JOBS = {
    # name: (board box, t_hi, t_lo, flat background, flower fill box relative to the box, lighter-only)
    # Symbol for light backgrounds: from the light lockup card (its centre glow is filled, white on white).
    'nawara-symbol': ((1112, 36, 1238, 168), 40, 8, True, (0, 0, 126, 132), False),
    # Symbol for dark backgrounds and for transparent icons: from the dark lockup card (the glow keeps real alpha).
    'nawara-symbol-on-dark': ((1112, 195, 1240, 330), 90, 10, True, None, True, True),
    'nawara-logo-horizontal': ((1108, 36, 1508, 163), 40, 8, True, (0, 0, 124, 127), False),
    'nawara-logo-horizontal-on-dark': ((1108, 197, 1508, 332), 90, 10, True, None, True),
    'nawara-logo-stacked': ((160, 35, 590, 485), 45, 10, False, (113, 50, 313, 250), False),
    'nawara-wordmark': ((1240, 52, 1500, 128), 40, 8, True, None, False),
    'nawara-wordmark-on-dark': ((1245, 213, 1480, 284), 40, 10, True, None, True),
}
meta = {}
for name, (box, hi, lo, flat, fill, lighter, *rest) in JOBS.items():
    img, m = extract(box, hi, lo, flat, fill_box=fill, lighter_only=lighter, tidy=bool(rest and rest[0]))
    img.save(f'{OUT}/{name}.png', optimize=True)
    meta[name] = m
    print(name, m)
json.dump(meta, open(f'{OUT}/extraction-meta.json', 'w'), indent=2)
