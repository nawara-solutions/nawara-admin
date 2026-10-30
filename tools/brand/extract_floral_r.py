"""Extracts the floral-R identity from the owner's "Nawara Software and Drive Branding Board" (docs/BRAND.md §0).

The board (1536 x 1024 raster, 2026-10-30) has no vector source, so every asset here is cut from its pixels, never
redrawn. The FIRST design (top row) is used:
- the "nawara" wordmark with the floral R, top-left panel, matted against the panel's measured dark background;
- the two standalone floral-R app tiles, top-right (dark navy and light), cropped square around the R.

Outputs (public/brand/):
- nawara-floral-r-wordmark-on-dark.png  the wordmark as on the board (light lettering), transparent
- nawara-floral-r-wordmark.png          the same pixels with the neutral lettering set in the board's own ink (the
                                        board's light-ground variant, row 2), the floral R unchanged: DERIVED
- nawara-floral-r-tile-dark.png, -light.png   opaque square crops of the two tiles, centred on the R
- nawara-floral-r-symbol-on-dark.png    the complete floral R alone, matted against the dark tile (dark grounds)
- nawara-floral-r-symbol.png            the same, matted against the light tile (light grounds)
and the coral icon set: public/favicon.ico and icons/icon-{16,32,48,192,512}.png are the floral R alone on transparency
(the light-tile matte, which stays solid on light and dark browser chrome); apple-touch-icon.png and
icons/icon-maskable-512.png keep the dark tile, because iOS and Android need an opaque square (transparency turns black
or is cropped).
The palette variants (favicons and wordmarks) are written by tools/brand/recolor_artwork.py from these masters.

"SOFTWARE" is not extracted: the logo sets "SOLUTIONS" as live text beneath the wordmark (nw-brand-mark).

Usage, from the repository root:  python3 tools/brand/extract_floral_r.py "<path to the branding board>"
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'public' / 'brand'
ICONS = ROOT / 'public' / 'icons'

# Board coordinates (x0, y0, x1, y1), measured on the 1536 x 1024 board.
WORD = (168, 44, 812, 254)  # "nawara" with the floral R, above the subtitle row (y 262-292), which is excluded
TILE_DARK = (1032, 103, 1200, 271)  # 168 px square centred on the R (R bounds 1052-1179 x 115-259)
TILE_LIGHT = (1284, 102, 1452, 270)  # same size, centred on the R (R bounds 1304-1431 x 114-258)
# Ink of the board's own light-ground lettering (row 2, left panel: median of its letter pixels).
INK = np.array([17, 19, 32]) / 255


def board_rgb(board: Image.Image, box) -> np.ndarray:
    return np.asarray(board.crop(box).convert('RGB')).astype(np.float64) / 255


def background(rgb: np.ndarray, fg: np.ndarray) -> np.ndarray:
    """The panel behind the lettering: a normalized blur of the pixels outside the (dilated) glyph mask."""
    known = Image.fromarray(((~fg) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(9))
    w = np.asarray(known).astype(np.float64) / 255
    out = np.empty_like(rgb)
    weight = np.asarray(Image.fromarray((w * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(28))) / 255
    for c in range(3):
        layer = Image.fromarray(np.clip(rgb[..., c] * w * 255, 0, 255).astype(np.uint8))
        out[..., c] = np.asarray(layer.filter(ImageFilter.GaussianBlur(28))) / 255 / np.maximum(weight, 1e-3)
    return np.clip(out, 0, 1)


def matte_on_dark(rgb: np.ndarray):
    """Alpha and colour of light artwork over a dark ground: fully covered pixels keep their board colour."""
    fg = (rgb.max(-1) - 0.16) > 0
    bg = background(rgb, fg)
    raw = np.max((rgb - bg) / np.maximum(1 - bg, 1e-3), axis=-1)
    alpha = np.clip(raw / 0.9, 0, 1)  # solid glyph interiors reach ~0.9 of the channel headroom
    alpha[alpha < 0.03] = 0
    colour = bg + (rgb - bg) / np.maximum(alpha, 1e-3)[..., None]
    colour = np.where(alpha[..., None] > 0.97, rgb, np.clip(colour, 0, 1))
    return colour, alpha


def matte_on_light(rgb: np.ndarray):
    """Alpha and colour of coloured artwork over a light ground (the light tile): the mirror of matte_on_dark."""
    fg = rgb.min(-1) < 0.8
    bg = background(rgb, fg)
    raw = np.max((bg - rgb) / np.maximum(bg, 1e-3), axis=-1)
    alpha = np.clip(raw / 0.75, 0, 1)  # the coral's solid interior removes ~0.75 of the ground's green channel
    alpha[alpha < 0.03] = 0
    colour = bg - (bg - rgb) / np.maximum(alpha, 1e-3)[..., None]
    colour = np.where(alpha[..., None] > 0.97, rgb, np.clip(colour, 0, 1))
    return colour, alpha


def coral_weight(colour: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """1 on the floral R and its petals, 0 on the neutral lettering. Decided per connected shape, not per pixel, so the
    petals' pale highlights and the thin stem stay coral: a shape is coral when its covered pixels are saturated on
    average. Faint edge pixels outside every shape follow the coral shapes within 3 px."""
    solid = alpha > 0.25
    labels = np.zeros(alpha.shape, np.int32)
    sat = colour.max(-1) - colour.min(-1)
    coral = np.zeros(alpha.shape, bool)
    h, w = alpha.shape
    for y0, x0 in zip(*np.nonzero(solid)):
        if labels[y0, x0]:
            continue
        label = labels.max() + 1
        stack, members = [(y0, x0)], []
        labels[y0, x0] = label
        while stack:
            y, x = stack.pop()
            members.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = label
                        stack.append((ny, nx))
        ys, xs = np.array(members).T
        if sat[ys, xs].mean() > 0.3:
            coral[ys, xs] = True
    near = np.asarray(Image.fromarray(coral.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
    return (coral | (near & ~solid)).astype(np.float64)


def save_rgba(colour, alpha, path: Path):
    ys, xs = np.where(alpha > 0)
    y0, y1, x0, x1 = max(ys.min() - 2, 0), ys.max() + 3, max(xs.min() - 2, 0), xs.max() + 3
    rgba = np.concatenate([colour, alpha[..., None]], axis=-1)[y0:y1, x0:x1]
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(path, optimize=True)
    print(f'{path.relative_to(ROOT)}  {x1 - x0} x {y1 - y0}')


def symbol_square(margin: float = 0.03) -> Image.Image:
    """The light-tile floral R centred on a transparent square, with a small margin (the favicon's artwork)."""
    sym = Image.open(BRAND / 'nawara-floral-r-symbol.png').convert('RGBA')
    side = round(max(sym.size) * (1 + 2 * margin))
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    out.alpha_composite(sym, ((side - sym.width) // 2, (side - sym.height) // 2))
    return out


def crisp(img: Image.Image, size: int) -> Image.Image:
    """A small icon size: Lanczos, a light unsharp mask and slightly firmer edges, so the R holds at 16-48 px."""
    small = np.asarray(img.resize((size, size), Image.LANCZOS)).astype(np.float64)
    rgb = Image.fromarray(small[..., :3].astype(np.uint8)).filter(
        ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=0))
    alpha = np.clip((small[..., 3] / 255) ** 0.8 * 255 + 0.5, 0, 255)
    return Image.fromarray(np.dstack([np.asarray(rgb), alpha]).astype(np.uint8), 'RGBA')


def write_transparent_icons():
    """favicon.ico (16/32/48) and the PNG icons: the floral R alone, transparent."""
    sym = symbol_square()
    small = {size: crisp(sym, size) for size in (16, 32, 48)}
    for size, img in small.items():
        img.save(ICONS / f'icon-{size}.png', optimize=True)
    for size in (192, 512):
        sym.resize((size, size), Image.LANCZOS).save(ICONS / f'icon-{size}.png', optimize=True)
    small[48].save(ROOT / 'public' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)],
                   append_images=[small[16], small[32]])
    print('public/favicon.ico, icons/icon-{16,32,48,192,512}.png (transparent floral R)')


def padded(tile: Image.Image, size: int, share: float) -> Image.Image:
    """An opaque square whose central `share` is the tile; the margin continues the tile's own edge pixels, blurred
    so the ground stays smooth (maskable safe zone)."""
    inner = round(size * share)
    pad = (size - inner) // 2
    core = np.asarray(tile.convert('RGB').resize((inner, inner), Image.LANCZOS))
    ground = np.pad(core, ((pad, size - inner - pad), (pad, size - inner - pad), (0, 0)), mode='edge')
    soft = np.asarray(Image.fromarray(ground).filter(ImageFilter.GaussianBlur(24)))
    out = soft.copy()
    out[pad:pad + inner, pad:pad + inner] = core
    # Blend the seam: inside a 12 px band at the tile's edge, move from the blurred ground to the tile.
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.minimum.reduce([xx - pad, yy - pad, pad + inner - 1 - xx, pad + inner - 1 - yy]).astype(np.float64)
    t = np.clip(d / 12, 0, 1)[..., None]
    return Image.fromarray((soft * (1 - t) + out * t + 0.5).astype(np.uint8), 'RGB')


def write_symbols(board: Image.Image):
    """The complete floral R of each tile, without the tile, for the logo's symbol (scope switcher, gallery)."""
    save_rgba(*matte_on_dark(board_rgb(board, TILE_DARK)), BRAND / 'nawara-floral-r-symbol-on-dark.png')
    save_rgba(*matte_on_light(board_rgb(board, TILE_LIGHT)), BRAND / 'nawara-floral-r-symbol.png')


def main(board_path: str):
    board = Image.open(board_path).convert('RGB')
    if board.size != (1536, 1024):
        sys.exit(f'expected the 1536 x 1024 branding board, got {board.size}')

    colour, alpha = matte_on_dark(board_rgb(board, WORD))
    save_rgba(colour, alpha, BRAND / 'nawara-floral-r-wordmark-on-dark.png')
    w = coral_weight(colour, alpha)[..., None]
    save_rgba(colour * w + INK * (1 - w), alpha, BRAND / 'nawara-floral-r-wordmark.png')

    tiles = {}
    for name, box in (('dark', TILE_DARK), ('light', TILE_LIGHT)):
        tiles[name] = board.crop(box)
        tiles[name].save(BRAND / f'nawara-floral-r-tile-{name}.png', optimize=True)
        print(f'public/brand/nawara-floral-r-tile-{name}.png  {box[2] - box[0]} px')
    write_symbols(board)

    write_transparent_icons()
    dark = tiles['dark']
    dark.resize((180, 180), Image.LANCZOS).save(ROOT / 'public' / 'apple-touch-icon.png', optimize=True)
    padded(dark, 512, 0.74).save(ICONS / 'icon-maskable-512.png', optimize=True)
    print('public/apple-touch-icon.png, icons/icon-maskable-512.png (dark tile, opaque)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
