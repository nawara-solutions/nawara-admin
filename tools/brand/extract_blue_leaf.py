"""Extracts the blue-leaf Nawara logos from the owner's logo-family reference and splits them into accent-aware layers
(docs/BRAND.md §B1; B1 2026-11-01, accent correction the same day).

The reference (docs/brand/references/nawara-logo-family-2026-11-01.webp, 2000 x 667 WebP) shows "nawara admin",
"nawara solutions" and "nawara erp" on a flat near-white ground. It has no vector source, so every asset here is CUT FROM
ITS PIXELS, never redrawn, traced or re-lettered (owner decision B1, Option 1). Official SVG masters are still needed.

Extraction (per logo, inside a measured box):
- colour-to-alpha against the reference's measured ground (254, 254, 254): each pixel's alpha is how far it is from the
  ground toward the darkest ink channel, and its colour is un-blended from the ground, so anti-aliased edges keep their
  coverage and show no halo on dark grounds;
- the white glyph inside the upper leaf (people for Admin, puzzle for Solutions) belongs to the symbol: the enclosed ground
  regions centred in the measured glyph box, plus a 2 px rim, are the leaf's interior, opaque.

Layers (the owner requires the botanical symbol to follow the selected accent palette; the lettering and the white details
never change). Each logo becomes three aligned rasters of the same size, so `contain` places them identically:
- `-lettering` (light grounds: the reference's navy) and `-lettering-on-dark` (DERIVED: the dark theme's text colour
  #ffffff): the wordmark alone, with its own coverage;
- `-symbol-mask`: the symbol's coverage (leaf, circuit stems, rings, sprig) as alpha: painted at run time with the palette's
  primary token through a CSS mask, so an accent change recolours it at once, in the token's exact colour;
- `-symbol-details`: the white details inside the leaf, as alpha over the painted symbol. Inside the leaf each pixel is
  split by projecting it on the line from the reference blue to white, so the blue-to-white edges stay as drawn.
Composited with the reference blue, the layers give back the reference (checked below, `verify`).

Favicons cannot read CSS, so each palette and appearance gets its own tab icon at the existing file names, filled with the
palette's primary read from the token files (never approximated); Sapphire keeps the reference blue (owner decision). Static
icons (favicon.ico, icons/icon-*.png, apple-touch and maskable) cannot follow a palette: they use the default palette
(Coral, light primary).

Usage, from the repository root:
  python3 -B tools/brand/extract_blue_leaf.py docs/brand/references/nawara-logo-family-2026-11-01.webp
"""
import base64
import io
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recolor_artwork import PALETTES, hex_to_rgb, lch  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'public' / 'brand'
ICONS = ROOT / 'public' / 'icons'

GROUND = 254.0  # the reference's ground, every channel (median of the corners; std < 0.1)
INK_MIN = 4.0  # the darkest channel of both inks: navy #040b2d and blue #046efa (medians)
NOISE = 6.0  # differences from the ground below this are WebP noise, not ink
REFERENCE_BLUE = '#046efa'
DARK_LETTERING = np.array([255, 255, 255]) / 255  # dark theme --nw-text-primary (ink-0)
WHITE = np.array([1.0, 1.0, 1.0])  # the symbol's white details

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


def split_layers(rgba: np.ndarray, interior: np.ndarray):
    """(lettering, symbol mask, white details) as RGBA floats of the logo's size."""
    a = rgba[..., 3]
    w = np.where(interior, 1.0, blue_weight(rgba[..., :3]))
    # Only the solid blue shape and a 2 px rim (its anti-aliasing): WebP colour bleed gives the navy letters' edges a faint
    # blue weight, which must stay with the lettering.
    w = w * dilate((w > 0.5) & (a > 0.5), 2)
    # Inside the leaf: how much of each pixel is blue rather than white (projection on the blue-white line, sRGB).
    blue = hex_to_rgb(REFERENCE_BLUE)
    ground = np.full(3, GROUND / 255)
    d = ground - blue
    t = np.clip(((ground - rgba[..., :3]) @ d) / (d @ d), 0, 1)
    lettering = rgba.copy()
    lettering[..., 3] = np.where(interior, 0.0, a * (1 - w))
    mask = np.zeros_like(rgba)
    mask[..., :3] = 1
    mask[..., 3] = np.where(interior, 1.0, a * w)
    details = np.zeros_like(rgba)
    details[..., :3] = WHITE
    details[..., 3] = np.where(interior, 1 - t, 0.0)
    return lettering, mask, details


def with_colour(rgba: np.ndarray, rgb) -> np.ndarray:
    out = rgba.copy()
    out[..., :3] = rgb
    return out


def over(top: np.ndarray, bottom: np.ndarray) -> np.ndarray:
    """Porter-Duff source-over of straight-alpha RGBA floats."""
    ta, ba = top[..., 3:], bottom[..., 3:]
    oa = ta + ba * (1 - ta)
    rgb = (top[..., :3] * ta + bottom[..., :3] * ba * (1 - ta)) / np.where(oa > 0, oa, 1)
    return np.concatenate([rgb, oa], axis=-1)


def composite(lettering, mask, details, colour) -> np.ndarray:
    """What the browser draws: lettering, then the symbol in `colour`, then the white details."""
    symbol = with_colour(mask, hex_to_rgb(colour))
    base = symbol if lettering is None else over(symbol, lettering)
    return over(details, base)


def verify(original: np.ndarray, layers, name: str) -> None:
    """With the reference blue, the layers must give back the reference (premultiplied difference, 0-255)."""
    back = composite(*layers, REFERENCE_BLUE)
    pre = lambda x: x[..., :3] * x[..., 3:]  # noqa: E731
    err = np.abs(pre(back) - pre(original)) * 255
    print(f'{name}: layers vs reference, premultiplied |diff| mean {err.mean():.2f}, 99.9th pct {np.percentile(err, 99.9):.1f}')


def crop_symbol(layers, x_range, box_x0: int):
    """The symbol alone (mask and details) cropped to its bounds; the lettering is dropped."""
    _, mask, details = layers
    mask = mask.copy()
    lo, hi = x_range[0] - box_x0, x_range[1] - box_x0
    mask[:, :lo, 3] = 0
    mask[:, hi:, 3] = 0
    ys, xs = np.nonzero(mask[..., 3] > 0.02)
    box = (slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1))
    return mask[box], details[box]


def to_image(rgba: np.ndarray) -> Image.Image:
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def save_webp(rgba: np.ndarray, name: str) -> None:
    dst = BRAND / name
    to_image(rgba).save(dst, 'WEBP', lossless=True, quality=100, method=6)
    print(f'{dst.relative_to(ROOT)}  {rgba.shape[1]} x {rgba.shape[0]}  {dst.stat().st_size // 1024} KB')


def square(image: Image.Image, margin: float, ground=(0, 0, 0, 0)) -> Image.Image:
    """The image centred on a square canvas, `margin` of the side free on each side."""
    side = round(max(image.size) / (1 - 2 * margin))
    canvas = Image.new('RGBA', (side, side), ground)
    canvas.alpha_composite(image, ((side - image.width) // 2, (side - image.height) // 2))
    return canvas


def primaries() -> dict:
    """Each palette's --nw-color-primary per appearance, read from the token files (never approximated)."""
    import re
    out = {}
    accents = (ROOT / 'src' / 'styles' / 'tokens' / '_accents.scss').read_text()
    for name, theme, body in re.findall(r'@mixin (\w+)-(light|dark) \{(.*?)\n\}', accents, re.S):
        out.setdefault(name, {})[theme] = re.search(r'--nw-color-primary: (#[0-9a-f]{6});', body).group(1)
    foundation = (ROOT / 'node_modules' / '@nawara-solutions' / 'design-tokens' / 'dist' / 'tokens.css').read_text()
    ref = lambda n: re.search(rf'--nw-ref-coral-{n}: (#[0-9a-f]{{6}});', foundation).group(1)  # noqa: E731
    out['coral'] = {'light': ref(600), 'dark': ref(400)}  # foundation: --nw-color-primary is coral-600 / coral-400
    assert set(out) == {'coral', *PALETTES}, sorted(out)
    return out


def symbol_colour(palette: str, theme: str, table: dict) -> str:
    """The token the logos use: the palette's primary; Sapphire, the blue palette, keeps the reference blue (owner)."""
    return REFERENCE_BLUE if palette == 'sapphire' else table[palette][theme]


def favicon_href(palette: str, theme: str) -> str:
    """The existing file names (index.html, core/theme/palette-artwork.ts): unchanged, so no code changes."""
    if theme == 'light':
        return f'icons/favicon-{palette}-light.svg'
    return 'favicon.svg' if palette == 'coral' else f'icons/favicon-{palette}.svg'


def write_icons(mask: np.ndarray, details: np.ndarray) -> None:
    table = primaries()
    def icon(colour: str, margin: float, ground=(0, 0, 0, 0)) -> Image.Image:
        return square(to_image(composite(None, mask, details, colour)), margin, ground)
    for palette in ['coral', *PALETTES]:
        for theme in ('light', 'dark'):
            img = icon(symbol_colour(palette, theme, table), 0.03).resize((FAVICON_PX,) * 2, Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, 'PNG', optimize=True)
            data = base64.b64encode(buf.getvalue()).decode()
            dst = ROOT / 'public' / favicon_href(palette, theme)
            dst.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
                f'<image width="64" height="64" xlink:href="data:image/png;base64,{data}"/></svg>\n'
            )
    print('public/favicon.svg and public/icons/favicon-<palette>[-light].svg written (22 files)')
    default = symbol_colour('coral', 'light', table)
    tab = icon(default, 0.03)
    for size in (16, 32, 48, 192, 512):
        tab.resize((size, size), Image.LANCZOS).save(ICONS / f'icon-{size}.png', optimize=True)
    tab.save(ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    white = (255, 255, 255, 255)
    icon(default, 0.12, white).resize((180, 180), Image.LANCZOS).convert('RGB').save(ROOT / 'public' / 'apple-touch-icon.png', optimize=True)
    # Maskable: the symbol inside the central 80 % safe zone.
    icon(default, 0.2, white).resize((512, 512), Image.LANCZOS).convert('RGB').save(ICONS / 'icon-maskable-512.png', optimize=True)
    print(f'static icons in the default palette (coral light primary {default}) written')


def main(path: str) -> None:
    board = np.asarray(Image.open(path).convert('RGB'))
    assert board.shape[:2] == (667, 2000), f'unexpected reference size {board.shape[1]} x {board.shape[0]}'
    for name in ('admin', 'solutions'):
        rgba, interior = extract(board, LOGOS[name])
        layers = split_layers(rgba, interior)
        verify(rgba, layers, name)
        lettering, mask, details = layers
        save_webp(lettering, f'nawara-{name}-lettering.webp')
        save_webp(with_colour(lettering, DARK_LETTERING), f'nawara-{name}-lettering-on-dark.webp')
        save_webp(mask, f'nawara-{name}-symbol-mask.webp')
        save_webp(details, f'nawara-{name}-symbol-details.webp')
        if name == 'admin':
            mark_mask, mark_details = crop_symbol(layers, LOGOS['admin']['symbol_x'], LOGOS['admin']['box'][0])
            save_webp(mark_mask, 'nawara-admin-mark-mask.webp')
            save_webp(mark_details, 'nawara-admin-mark-details.webp')
            write_icons(mark_mask, mark_details)


if __name__ == '__main__':
    main(sys.argv[1])
