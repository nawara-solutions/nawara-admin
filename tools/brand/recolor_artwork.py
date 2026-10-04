"""Recolours the coral master artwork for the accent palettes (docs/BRAND.md §0).

The botanical illustrations are single-hue transparent rasters (every visible pixel sits at hue 345-360 deg), so a
per-pixel hue rotation in OKLCH is a faithful recolour: each pixel keeps its perceived lightness (L) and its alpha, so
petal shapes, folds, highlights and fine lines are unchanged. The hue moves by the difference between the palette's
primary and coral's primary; chroma follows the palette's primary (ratio, capped at 1) and is reduced further only
where a colour would leave the sRGB gamut. The masters are never modified.

The same transform recolours the logo's hex colours (bloom, flourish), printed as tokens for tokens/_accents.scss, so
logo and artwork always agree.

Run from the repository root:  python3 tools/brand/recolor_artwork.py [palette ...]
It writes public/illustrations/nawara-botanical-*-<palette>*.webp and src/styles/tokens/_brand-artwork.scss.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ILLUSTRATIONS = ROOT / 'public' / 'illustrations'

CORAL_PRIMARY = '#c42427'
# The light primary of each palette (tokens/_accents.scss): the target hue and chroma.
PALETTES = {
    'rose': '#be185d',
    'plum': '#7e22ce',
    'indigo': '#4338ca',
    'teal': '#0f766e',
    'amber': '#b45309',
}
# master file stem -> output stem pattern ({p} = palette)
MASTERS = {
    'nawara-botanical-coral': 'nawara-botanical-{p}',
    'nawara-botanical-dark': 'nawara-botanical-{p}-dark',
    'nawara-botanical-corner-coral': 'nawara-botanical-corner-{p}',
    'nawara-botanical-corner-dark': 'nawara-botanical-corner-{p}-dark',
}


def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)


def to_oklab(rgb):
    lin = srgb_to_linear(rgb)
    lms = lin @ np.array(
        [[0.4122214708, 0.2119034982, 0.0883024619],
         [0.5363325363, 0.6806995451, 0.2817188376],
         [0.0514459929, 0.1073969566, 0.6299787005]])
    lms = np.cbrt(lms)
    return lms @ np.array(
        [[0.2104542553, 1.9779984951, 0.0259040371],
         [0.7936177850, -2.4285922050, 0.7827717662],
         [-0.0040720468, 0.4505937099, -0.8086757660]])


def from_oklab(lab):
    lms = lab @ np.array(
        [[1.0, 1.0, 1.0],
         [0.3963377774, -0.1055613458, -0.0894841775],
         [0.2158037573, -0.0638541728, -1.2914855480]])
    lin = (lms ** 3) @ np.array(
        [[4.0767416621, -1.2684380046, -0.0041960863],
         [-3.3077115913, 2.6097574011, -0.7034186147],
         [0.2309699292, -0.3413193965, 1.7076147010]])
    return linear_to_srgb(lin)


def hex_to_rgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def lch(rgb):
    lab = to_oklab(rgb)
    return lab[..., 0], np.hypot(lab[..., 1], lab[..., 2]), np.arctan2(lab[..., 2], lab[..., 1])


def transform(rgb, target):
    """Rotates hue and rescales chroma of an (..., 3) sRGB array in [0, 1] toward the target palette."""
    _, c0, h0 = lch(hex_to_rgb(CORAL_PRIMARY))
    _, c1, h1 = lch(hex_to_rgb(target))
    dh, scale = h1 - h0, min(1.0, float(c1 / c0))
    L, C, H = lch(rgb)
    H = H + dh
    C = C * scale
    # Gamut: lower chroma (never lightness or hue) until the colour fits in sRGB.
    for _ in range(24):
        out = from_oklab(np.stack([L, C * np.cos(H), C * np.sin(H)], axis=-1))
        bad = np.any((out < -1e-4) | (out > 1 + 1e-4), axis=-1)
        if not bad.any():
            break
        C = np.where(bad, C * 0.92, C)
    return np.clip(out, 0, 1)


def recolor_image(src: Path, dst: Path, target: str):
    rgba = np.asarray(Image.open(src).convert('RGBA')).astype(np.float64) / 255
    rgb = transform(rgba[..., :3], target)
    out = np.concatenate([rgb, rgba[..., 3:]], axis=-1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=90, method=6)


def recolor_hex(h: str, target: str) -> str:
    rgb = transform(hex_to_rgb(h)[None, :], target)[0]
    return '#' + ''.join(f'{round(v * 255):02x}' for v in rgb)


# The logo's colours (public/brand/nawara-bloom-*.svg, nawara-solutions-flourish*.svg) and the "SOLUTIONS" gradient,
# per theme, as coral defines them. Each palette gets the same transform as the artwork.
LOGO = {
    'light': {
        'highlight': '#ffffff', 'deep': '#c42427', 'mid': '#e5383b', 'light': '#ff7a7d', 'petal': '#ff9597', 'stem': '#e0916a',
        'bead-hi': '#ffe3e4', 'bead-mid': '#f0646a', 'bead-pale': '#f6b3b6', 'leaf': '#e5383b',
        'leaf-pale': '#ffc2c3', 'line': '#e8676d', 'sol-1': '#a01c1f', 'sol-2': '#e5383b', 'sol-3': '#ff7a7d',
    },
    'dark': {
        'highlight': '#ffffff', 'deep': '#e5383b', 'mid': '#ff5c5f', 'light': '#ff9597', 'petal': '#ff9597', 'stem': '#e8a27e',
        'bead-hi': '#ffe3e4', 'bead-mid': '#ff7a7d', 'bead-pale': '#ffc2c3', 'leaf': '#ff5c5f',
        'leaf-pale': '#ffc2c3', 'line': '#ff8a8d', 'sol-1': '#e5383b', 'sol-2': '#ff5c5f', 'sol-3': '#ffc2c3',
    },
}
ARTWORK = {
    'light': ('nawara-botanical-{p}.webp', 'nawara-botanical-corner-{p}.webp'),
    'dark': ('nawara-botanical-{p}-dark.webp', 'nawara-botanical-corner-{p}-dark.webp'),
}
CORAL_ARTWORK = {
    'light': ('nawara-botanical-coral.png', 'nawara-botanical-corner-coral.png'),
    'dark': ('nawara-botanical-dark.png', 'nawara-botanical-corner-dark.png'),
}
TOKENS_FILE = ROOT / 'src' / 'styles' / 'tokens' / '_brand-artwork.scss'
MAPPING_FILE = ROOT / 'src' / 'app' / 'core' / 'theme' / 'palette-artwork.ts'


def write_tokens():
    out = [
        '// GENERATED by tools/brand/recolor_artwork.py: do not edit by hand.\n'
        '// Logo colours and botanical artwork per accent palette and theme (docs/BRAND.md §0). Coral is the master; every\n'
        '// other palette is the same OKLCH transform as its artwork, so the logo and the illustrations always agree.\n'
        '// Used by the themes (coral) and by tokens/_accents.scss (the other palettes).\n'
    ]
    for palette in ['coral', *PALETTES]:
        for theme in ('light', 'dark'):
            lines = []
            for name, value in LOGO[theme].items():
                colour = value if palette == 'coral' else recolor_hex(value, PALETTES[palette])
                lines.append(f'  --nw-logo-{name}: {colour};')
            full, corner = (CORAL_ARTWORK if palette == 'coral' else ARTWORK)[theme]
            lines.append(f"  --nw-illustration-botanical: url('/illustrations/{full.format(p=palette)}');")
            lines.append(f"  --nw-illustration-botanical-corner: url('/illustrations/{corner.format(p=palette)}');")
            out.append(f'\n@mixin {palette}-{theme} {{\n' + '\n'.join(lines) + '\n}\n')
    TOKENS_FILE.write_text(''.join(out))
    print(f'{TOKENS_FILE.relative_to(ROOT)} written')
    entries = []
    for palette in ['coral', *PALETTES]:
        themes = []
        for theme in ('light', 'dark'):
            full, corner = (CORAL_ARTWORK if palette == 'coral' else ARTWORK)[theme]
            themes.append(
                f"    {theme}: {{ full: '/illustrations/{full.format(p=palette)}', "
                f"corner: '/illustrations/{corner.format(p=palette)}' }},"
            )
        entries.append(f'  {palette}: {{\n' + '\n'.join(themes) + '\n  },')
    MAPPING_FILE.write_text(
        "// GENERATED by tools/brand/recolor_artwork.py: do not edit by hand.\n"
        "import type { AccentPalette, ResolvedTheme } from './theme.service';\n\n"
        "/**\n * The botanical artwork of each accent palette and theme: the single palette-to-artwork mapping. The CSS tokens\n"
        " * (tokens/_brand-artwork.scss) are generated from the same data; ThemeService preloads these files before a switch.\n */\n"
        "export const PALETTE_ARTWORK: Readonly<\n  Record<AccentPalette, Record<ResolvedTheme, { readonly full: string; readonly corner: string }>>\n> = {\n"
        + '\n'.join(entries) + '\n};\n'
    )
    print(f'{MAPPING_FILE.relative_to(ROOT)} written')


if __name__ == '__main__':
    chosen = sys.argv[1:] or list(PALETTES)
    for palette in chosen:
        for master, pattern in MASTERS.items():
            dst = ILLUSTRATIONS / (pattern.format(p=palette) + '.webp')
            recolor_image(ILLUSTRATIONS / f'{master}.png', dst, PALETTES[palette])
            print(f'{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024} KB')
    write_tokens()
