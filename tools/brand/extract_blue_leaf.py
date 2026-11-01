"""Extracts the blue-leaf Nawara logos from the owner's logo-family reference (docs/BRAND.md §0, B1, 2026-11-01).

The reference (docs/brand/references/nawara-logo-family-2026-11-01.webp, 2000 x 667 WebP) shows "nawara admin",
"nawara solutions" and "nawara erp" on a flat near-white ground. It has no vector source, so every asset here is CUT FROM
ITS PIXELS, never redrawn, traced or re-lettered (owner decision B1, Option 1). Official SVG masters are still needed.

Method (per logo, inside a measured box):
- colour-to-alpha against the reference's measured ground (254, 254, 254): each pixel's alpha is how far it is from the
  ground toward the darkest ink channel, and its colour is un-blended from the ground, so anti-aliased edges keep the true
  ink colour and show no light halo on dark grounds;
- the white glyph inside the upper leaf (people for Admin, puzzle for Solutions) is part of the symbol: the enclosed
  ground regions whose centre lies in the measured glyph box, plus a 2 px rim, keep the reference's own pixels at full
  opacity (blue-to-white edges as drawn). The stem rings and letter counters stay transparent;
- nothing is resized, re-coloured or re-shaped in the logo files.

Outputs (public/brand/):
- nawara-admin-logo.webp             "nawara admin" as in the reference (light grounds)
- nawara-admin-logo-on-dark.webp     DERIVED: the same pixels with only the navy lettering set to the dark theme's text
                                     colour (#ffffff); the blue symbol and its glyph unchanged
- nawara-solutions-logo.webp, nawara-solutions-logo-on-dark.webp   the same for "nawara solutions"
- nawara-admin-symbol.webp           the Admin symbol alone (leaf, glyph, stems, rings, sprig), letters removed by colour
and the icon family from the Admin symbol (public/): favicon.ico (16/32/48), icons/icon-{16,32,48,192,512}.png and
apple-touch-icon.png / icons/icon-maskable-512.png (opaque white squares: iOS and Android need an opaque icon) in the
reference colours; the browser-tab SVG favicons (favicon.svg, icons/favicon-<palette>[-light].svg) with the blue mapped
to each accent palette (only the blue pixels move; geometry, alpha and the white glyph never change).

Usage, from the repository root:
  python3 tools/brand/extract_blue_leaf.py docs/brand/references/nawara-logo-family-2026-11-01.webp
"""
import base64
import io
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recolor_artwork import DEPTH, PALETTES, TONAL, from_oklab, hex_to_rgb, lch, tonal  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'public' / 'brand'
ICONS = ROOT / 'public' / 'icons'

GROUND = 254.0  # the reference's ground, every channel (median of the corners; std < 0.1)
INK_MIN = 4.0  # the darkest channel of both inks: navy #040b2d and blue #046efa (medians)
NOISE = 6.0  # differences from the ground below this are WebP noise, not ink
REFERENCE_BLUE = '#046efa'
DARK_LETTERING = np.array([255, 255, 255]) / 255  # dark theme --nw-text-primary (ink-0)

# Measured on the 2000 x 667 reference: (x0, y0, x1, y1) of each logo with a 6 px margin, and of its leaf glyph.
LOGOS = {
    'admin': {'box': (114, 111, 908, 285), 'glyph': (555, 135, 645, 198), 'symbol_x': (440, 668)},
    'solutions': {'box': (1011, 111, 1902, 285), 'glyph': (1450, 130, 1532, 202), 'symbol_x': None},
}
FAVICON_PX = 128  # embedded raster of the SVG favicon: 2x the largest tab size (32 px at 2x)


def flood(mask: np.ndarray, seeds) -> np.ndarray:
    """4-connected flood fill of `mask` from the seed pixels."""
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    queue = deque()
    for y, x in seeds:
        if mask[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def components(mask: np.ndarray):
    """The 4-connected components of `mask`, as boolean arrays."""
    left = mask.copy()
    while left.any():
        y, x = map(int, np.argwhere(left)[0])
        part = flood(left, [(y, x)])
        left &= ~part
        yield part


def dilate(mask: np.ndarray, r: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(r):
        grown = out.copy()
        grown[1:] |= out[:-1]
        grown[:-1] |= out[1:]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def blue_weight(rgb: np.ndarray) -> np.ndarray:
    """1 on the blue symbol, 0 on the navy lettering and on white (by OKLCH chroma and hue around the reference blue)."""
    _, c, h = lch(rgb)
    _, _, h0 = lch(hex_to_rgb(REFERENCE_BLUE))
    dh = np.abs((h - h0 + np.pi) % (2 * np.pi) - np.pi)
    return np.clip((c - 0.09) / 0.05, 0, 1) * np.clip(1 - (dh - np.radians(30)) / np.radians(20), 0, 1)


def extract(board: np.ndarray, spec: dict):
    """RGBA (floats in [0, 1]) of one logo, and the mask of its opaque leaf interior."""
    x0, y0, x1, y1 = spec['box']
    px = board[y0:y1, x0:x1].astype(np.float64)
    diff = (GROUND - px).max(axis=2)
    alpha = np.clip((diff - NOISE) / (GROUND - INK_MIN - NOISE), 0, 1)
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    rgb = np.clip(GROUND - (GROUND - px) / safe, 0, 255)

    # The leaf glyph: ground regions not reachable from the box edge, centred in the glyph box.
    ink = alpha > 0.5
    h, w = ink.shape
    edge = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] + [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    outside = flood(~ink, edge)
    gx0, gy0, gx1, gy1 = spec['glyph']
    glyph = np.zeros_like(ink)
    for hole in components(~ink & ~outside):
        ys, xs = np.nonzero(hole)
        cx, cy = xs.mean() + x0, ys.mean() + y0
        if gx0 <= cx <= gx1 and gy0 <= cy <= gy1:
            glyph |= hole
    interior = dilate(glyph, 2) & ~outside | glyph
    rgb[interior] = px[interior]
    alpha[interior] = 1.0
    return np.concatenate([rgb / 255, alpha[..., None]], axis=-1), interior


def on_dark(rgba: np.ndarray, interior: np.ndarray) -> np.ndarray:
    """Only the navy lettering takes the dark theme's text colour; the symbol (and its glyph) keeps its pixels."""
    w = blue_weight(rgba[..., :3])
    w = np.where(interior, 1.0, w)[..., None]
    rgb = rgba[..., :3] * w + DARK_LETTERING * (1 - w)
    return np.concatenate([rgb, rgba[..., 3:]], axis=-1)


def symbol_only(rgba: np.ndarray, interior: np.ndarray, x_range, box_x0: int) -> np.ndarray:
    """The blue symbol alone: lettering removed by colour, cropped to the symbol's own bounds."""
    w = np.where(interior, 1.0, blue_weight(rgba[..., :3]))
    # Only the solid blue shape and a 2 px rim (its anti-aliasing): WebP colour bleed gives the navy letters' edges a
    # faint blue weight, which must not survive as ghost outlines.
    w = w * dilate((w > 0.5) & (rgba[..., 3] > 0.5), 2)
    out = rgba.copy()
    out[..., 3] = rgba[..., 3] * w
    lo, hi = x_range[0] - box_x0, x_range[1] - box_x0
    out[:, :lo, 3] = 0
    out[:, hi:, 3] = 0
    ys, xs = np.nonzero(out[..., 3] > 0.02)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def save_webp(rgba: np.ndarray, name: str) -> None:
    dst = BRAND / name
    to_image(rgba).save(dst, 'WEBP', lossless=True, quality=100, method=6)
    print(f'{dst.relative_to(ROOT)}  {rgba.shape[1]} x {rgba.shape[0]}  {dst.stat().st_size // 1024} KB')


def square(symbol: Image.Image, margin: float, ground=(0, 0, 0, 0)) -> Image.Image:
    """The symbol centred on a square canvas, `margin` of the side free on each side."""
    side = round(max(symbol.size) / (1 - 2 * margin))
    canvas = Image.new('RGBA', (side, side), ground)
    canvas.alpha_composite(symbol, ((side - symbol.width) // 2, (side - symbol.height) // 2))
    return canvas


def accent_blue(rgb: np.ndarray, palette: str, theme: str) -> np.ndarray:
    """The reference blue mapped to a palette: hue to the palette's primary (tokens/_accents.scss), chroma scaled to it,
    lightness kept (the near-neutral Midnight and Pearl use their tonal mapping, Burgundy its depth, as the artwork)."""
    if palette in TONAL:
        return tonal(rgb, TONAL[palette][theme])
    target = '#c42427' if palette == 'coral' else PALETTES[palette]
    _, c0, h0 = lch(hex_to_rgb(REFERENCE_BLUE))
    _, c1, h1 = lch(hex_to_rgb(target))
    L, C, H = lch(rgb)
    H = H + (h1 - h0)
    C = C * min(1.0, float(c1 / c0))
    if palette in DEPTH:
        L = L * DEPTH[palette][theme]
    for _ in range(24):
        out = from_oklab(np.stack([L, C * np.cos(H), C * np.sin(H)], axis=-1))
        bad = np.any((out < -1e-4) | (out > 1 + 1e-4), axis=-1)
        if not bad.any():
            break
        C = np.where(bad, C * 0.92, C)
    return np.clip(out, 0, 1)


def recolor_symbol(icon: Image.Image, palette: str, theme: str) -> Image.Image:
    rgba = np.asarray(icon).astype(np.float64) / 255
    w = blue_weight(rgba[..., :3])[..., None]
    rgb = rgba[..., :3] * (1 - w) + accent_blue(rgba[..., :3], palette, theme) * w
    return to_image(np.concatenate([rgb, rgba[..., 3:]], axis=-1))


def favicon_href(palette: str, theme: str) -> str:
    """The existing file names (index.html, core/theme/palette-artwork.ts): unchanged, so no code changes."""
    if theme == 'light':
        return f'icons/favicon-{palette}-light.svg'
    return 'favicon.svg' if palette == 'coral' else f'icons/favicon-{palette}.svg'


def write_icons(symbol: Image.Image) -> None:
    tab = square(symbol, 0.03)
    # Browser-tab favicons, per palette and appearance (an embedded 128 px raster, as before).
    for palette in ['coral', *PALETTES]:
        for theme in ('light', 'dark'):
            icon = recolor_symbol(tab.resize((FAVICON_PX,) * 2, Image.LANCZOS), palette, theme)
            buf = io.BytesIO()
            icon.save(buf, 'PNG', optimize=True)
            data = base64.b64encode(buf.getvalue()).decode()
            dst = ROOT / 'public' / favicon_href(palette, theme)
            dst.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
                f'<image width="64" height="64" xlink:href="data:image/png;base64,{data}"/></svg>\n'
            )
    print('public/favicon.svg and public/icons/favicon-<palette>[-light].svg written (22 files)')
    # Static icons in the reference colours (they cannot follow a palette).
    for size in (16, 32, 48, 192, 512):
        tab.resize((size, size), Image.LANCZOS).save(ICONS / f'icon-{size}.png', optimize=True)
    tab.save(ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    white = (255, 255, 255, 255)
    square(symbol, 0.12, white).resize((180, 180), Image.LANCZOS).convert('RGB').save(ROOT / 'public' / 'apple-touch-icon.png', optimize=True)
    # Maskable: the symbol inside the central 80 % safe zone.
    square(symbol, 0.2, white).resize((512, 512), Image.LANCZOS).convert('RGB').save(ICONS / 'icon-maskable-512.png', optimize=True)
    print('public/favicon.ico, icons/icon-{16,32,48,192,512}.png, apple-touch-icon.png, icons/icon-maskable-512.png written')


def main(path: str) -> None:
    board = np.asarray(Image.open(path).convert('RGB'))
    assert board.shape[:2] == (667, 2000), f'unexpected reference size {board.shape[1]} x {board.shape[0]}'
    admin, admin_interior = extract(board, LOGOS['admin'])
    solutions, solutions_interior = extract(board, LOGOS['solutions'])
    save_webp(admin, 'nawara-admin-logo.webp')
    save_webp(on_dark(admin, admin_interior), 'nawara-admin-logo-on-dark.webp')
    save_webp(solutions, 'nawara-solutions-logo.webp')
    save_webp(on_dark(solutions, solutions_interior), 'nawara-solutions-logo-on-dark.webp')
    symbol = symbol_only(admin, admin_interior, LOGOS['admin']['symbol_x'], LOGOS['admin']['box'][0])
    save_webp(symbol, 'nawara-admin-symbol.webp')
    write_icons(to_image(symbol))


if __name__ == '__main__':
    main(sys.argv[1])
