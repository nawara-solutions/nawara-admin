"""Repairs the erased rectangle in the sign-in botanical illustrations (owner B1 finishing pass, 2026-11-01).

The botanical masters (public/illustrations/nawara-botanical-coral.png and -dark.png, 836 x 941) carry a fully transparent
rectangle at their bottom start corner (rows 859-895, columns 0-250): an area erased in the source artwork, which shows as
a hard-edged patch behind the sign-in copyright line. Every palette variant (nawara-botanical-<palette>[-dark].webp) is
generated from those masters, so it carries the same patch.

Repair, per file and in its own colours (no recolouring): each row of the rectangle is a blend of the illustration mirrored
from just above it and just below it, in premultiplied colour, weighted by distance, so the faint wash, grain and fine
lines continue across without a seam. Nothing outside the rectangle is touched: the PNG masters are rewritten losslessly;
the WebP variants are re-encoded at their generator's quality (90), and the script reports the change outside the
rectangle from that one re-encode.

Usage, from the repository root:  python3 -B tools/brand/repair_botanical_patch.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ILLUSTRATIONS = ROOT / 'public' / 'illustrations'
TOP, BOTTOM, RIGHT = 859, 895, 251  # the erased block: rows TOP..BOTTOM inclusive, columns 0..RIGHT-1
FEATHER = 6  # columns over which the repair blends into the untouched pixels at its end edge


def repair(rgba: np.ndarray) -> np.ndarray:
    a = rgba[..., 3:] / 255.0
    pre = np.concatenate([rgba[..., :3] * a, rgba[..., 3:]], axis=-1).astype(np.float64)
    out = pre.copy()
    height = BOTTOM - TOP + 1
    for k in range(height):
        y = TOP + k
        above = pre[TOP - 1 - k, :RIGHT]  # mirrored from above the block
        below = pre[BOTTOM + 1 + (height - 1 - k), :RIGHT]  # mirrored from below the block
        w = (k + 1) / (height + 1)
        out[y, :RIGHT] = above * (1 - w) + below * w
    # feather the block's end edge toward the first untouched column, row by row, so no seam shows there
    edge = pre[TOP:BOTTOM + 1, RIGHT]
    for i in range(FEATHER):
        x = RIGHT - FEATHER + i
        t = (i + 1) / (FEATHER + 1)
        out[TOP:BOTTOM + 1, x] = out[TOP:BOTTOM + 1, x] * (1 - t) + edge * t
    alpha = out[..., 3:]
    rgb = np.where(alpha > 0, out[..., :3] / np.maximum(alpha, 1e-9) * 255.0, 0)
    return np.clip(np.concatenate([rgb, alpha], axis=-1) + 0.5, 0, 255).astype(np.uint8)


def has_patch(rgba: np.ndarray) -> bool:
    return bool((rgba[TOP + 2:BOTTOM - 1, 2:RIGHT - 2, 3] == 0).all())


def main() -> None:
    files = sorted(ILLUSTRATIONS.glob('nawara-botanical-*.png')) + sorted(ILLUSTRATIONS.glob('nawara-botanical-*.webp'))
    files = [f for f in files if 'corner' not in f.name]
    for path in files:
        rgba = np.asarray(Image.open(path).convert('RGBA'))
        if rgba.shape[:2] != (941, 836) or not has_patch(rgba):
            print(f'{path.name}: no erased block, unchanged')
            continue
        fixed = repair(rgba)
        if path.suffix == '.png':
            Image.fromarray(fixed, 'RGBA').save(path, optimize=True)
            note = 'lossless'
        else:
            Image.fromarray(fixed, 'RGBA').save(path, 'WEBP', quality=90, method=6)
            back = np.asarray(Image.open(path).convert('RGBA')).astype(int)
            outside = np.ones(back.shape[:2], bool)
            outside[TOP:BOTTOM + 1, :RIGHT] = False
            diff = np.abs(back - rgba.astype(int))[outside]
            note = f're-encoded q90; outside the block: mean |diff| {diff.mean():.2f}, max {diff.max()}'
        print(f'{path.name}: repaired ({note})')


if __name__ == '__main__':
    main()
