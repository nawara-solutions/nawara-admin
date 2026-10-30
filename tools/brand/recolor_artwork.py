"""Recolours the coral master artwork for the accent palettes (docs/BRAND.md §0).

The botanical illustrations are single-hue transparent rasters (every visible pixel sits at hue 345-360 deg), so a
per-pixel hue rotation in OKLCH is a faithful recolour: each pixel keeps its perceived lightness (L) and its alpha, so
petal shapes, folds, highlights and fine lines are unchanged. The hue moves by the difference between the palette's
primary and coral's primary; chroma follows the palette's primary (ratio, capped at 1) and is reduced further only
where a colour would leave the sRGB gamut. The masters are never modified.

Near-neutral accents (Midnight, Pearl) have no hue to rotate toward, so a rotation would only grey the artwork: they
use a tonal mapping instead (TONAL: lightness re-ranged per appearance, a faint tint). Accents defined by depth as well
as hue (Burgundy) scale lightness after the rotation (DEPTH). Both are per appearance, so the dark masters get the dark
variant; for the hue-only palettes the appearance makes no difference.

The same transform recolours the logo's hex colours (bloom, flourish), printed as tokens for tokens/_accents.scss, so
logo and artwork always agree. The floral-R wordmark and favicon rasters (tools/brand/extract_floral_r.py) mix coral
with neutral lettering and grounds, so only their coral pixels move (recolor_floral_r).

Run from the repository root:  python3 tools/brand/recolor_artwork.py [palette ...]
It writes public/illustrations/nawara-botanical-*-<palette>*.webp, the floral-R wordmarks and favicons of each palette
(public/brand/nawara-floral-r-{wordmark,symbol}*-<palette>.webp, favicon.svg, icons/favicon-*.svg) and
src/styles/tokens/_brand-artwork.scss.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ILLUSTRATIONS = ROOT / 'public' / 'illustrations'

CORAL_PRIMARY = '#c42427'
# The light primary of each palette (tokens/_accents.scss): the target hue and chroma. Display order after coral.
PALETTES = {
    'rose': '#be185d',
    'plum': '#7e22ce',
    'indigo': '#4338ca',
    'teal': '#0f766e',
    'amber': '#b45309',
    'midnight': '#17131f',
    'pearl': '#5e5769',
    'sapphire': '#2563eb',
    'emerald': '#047857',
    'burgundy': '#8e2849',
}
# Near-neutral palettes: (lightness offset, lightness scale, chroma scale, hue in degrees) per appearance. Midnight is
# deep ink-violet on light grounds and silvery lilac on dark; Pearl is grey-mauve on light and pearl-white on dark.
TONAL = {
    'midnight': {'light': (0.06, 0.55, 0.30, 292), 'dark': (0.56, 0.42, 0.26, 292)},
    'pearl': {'light': (0.30, 0.45, 0.22, 318), 'dark': (0.70, 0.30, 0.18, 318)},
}
# Palettes defined by depth as well as hue: lightness scale after the hue rotation, per appearance.
DEPTH = {'burgundy': {'light': 0.8, 'dark': 0.94}}
# master file stem -> (output stem pattern ({p} = palette), appearance of the master)
MASTERS = {
    'nawara-botanical-coral': ('nawara-botanical-{p}', 'light'),
    'nawara-botanical-dark': ('nawara-botanical-{p}-dark', 'dark'),
    'nawara-botanical-corner-coral': ('nawara-botanical-corner-{p}', 'light'),
    'nawara-botanical-corner-dark': ('nawara-botanical-corner-{p}-dark', 'dark'),
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


def tonal(rgb, mapping):
    """Re-ranges lightness and sets a faint fixed tint (a near-neutral palette); chroma lowered only for the gamut."""
    offset, scale, chroma, hue = mapping
    L, C, H = lch(rgb)
    L = np.clip(offset + scale * L, 0, 1)
    C = C * chroma
    H = np.full_like(H, np.radians(hue))
    for _ in range(24):
        out = from_oklab(np.stack([L, C * np.cos(H), C * np.sin(H)], axis=-1))
        bad = np.any((out < -1e-4) | (out > 1 + 1e-4), axis=-1)
        if not bad.any():
            break
        C = np.where(bad, C * 0.92, C)
    return np.clip(out, 0, 1)


def recolor(rgb, palette: str, theme: str):
    """The palette's colours for an (..., 3) sRGB array of coral artwork in the given appearance."""
    if palette in TONAL:
        return tonal(rgb, TONAL[palette][theme])
    out = transform(rgb, PALETTES[palette])
    if palette in DEPTH:
        L, C, H = lch(out)
        out = np.clip(from_oklab(np.stack([L * DEPTH[palette][theme], C * np.cos(H), C * np.sin(H)], axis=-1)), 0, 1)
    return out


def recolor_image(src: Path, dst: Path, palette: str, theme: str):
    rgba = np.asarray(Image.open(src).convert('RGBA')).astype(np.float64) / 255
    rgb = recolor(rgba[..., :3], palette, theme)
    out = np.concatenate([rgb, rgba[..., 3:]], axis=-1)
    Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=90, method=6)


def recolor_hex(h: str, palette: str, theme: str) -> str:
    rgb = recolor(hex_to_rgb(h)[None, :], palette, theme)[0]
    return '#' + ''.join(f'{round(v * 255):02x}' for v in rgb)


def recolor_floral_r(rgba: np.ndarray, palette: str, theme: str) -> np.ndarray:
    """Moves only the coral pixels of a floral-R raster (R, petals, their glow); lettering and tile grounds keep their
    colour. The weight rises with OKLCH chroma and falls off beyond 50 deg of coral's hue."""
    rgb = rgba[..., :3]
    _, c, h = lch(rgb)
    _, _, h0 = lch(hex_to_rgb(CORAL_PRIMARY))
    dh = np.abs((h - h0 + np.pi) % (2 * np.pi) - np.pi)
    w = np.clip((c - 0.02) / 0.04, 0, 1) * np.clip(1 - (dh - np.radians(50)) / np.radians(30), 0, 1)
    out = rgb * (1 - w[..., None]) + recolor(rgb, palette, theme) * w[..., None]
    return np.concatenate([out, rgba[..., 3:]], axis=-1)


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
BRAND = ROOT / 'public' / 'brand'
# The floral-R masters (tools/brand/extract_floral_r.py): wordmark and symbol per theme.
WORDMARK = {'light': 'nawara-floral-r-wordmark', 'dark': 'nawara-floral-r-wordmark-on-dark'}
SYMBOL = {'light': 'nawara-floral-r-symbol', 'dark': 'nawara-floral-r-symbol-on-dark'}
FAVICON_PX = 128  # embedded raster of the SVG favicon: 2x the largest tab size (32 px at 2x)


def wordmark_href(palette: str, theme: str) -> str:
    """The served wordmark: WebP for every palette, coral included (the PNG masters are lossless sources)."""
    return f'/brand/{WORDMARK[theme]}-{palette}.webp'


def symbol_href(palette: str, theme: str) -> str:
    """The served floral-R symbol, like the wordmark."""
    return f'/brand/{SYMBOL[theme]}-{palette}.webp'


def write_floral_r_symbols(palettes):
    """The complete floral R alone (the logo's symbol) of each palette and theme."""
    for palette in ['coral', *palettes]:
        for theme in ('light', 'dark'):
            src = np.asarray(Image.open(BRAND / f'{SYMBOL[theme]}.png').convert('RGBA')).astype(np.float64) / 255
            dst = ROOT / 'public' / symbol_href(palette, theme).lstrip('/')
            out = src if palette == 'coral' else recolor_floral_r(src, palette, theme)
            Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=92, method=6)
            print(f'{dst.relative_to(ROOT)} written')


def favicon_href(palette: str, theme: str = 'dark') -> str:
    """Dark keeps the original file names; light icons are `icons/favicon-<palette>-light.svg` (coral included)."""
    if theme == 'light':
        return f'icons/favicon-{palette}-light.svg'
    return 'favicon.svg' if palette == 'coral' else f'icons/favicon-{palette}.svg'


def write_floral_r(palettes):
    """The wordmark of each palette and the browser-tab favicons of every palette and appearance (the floral R alone,
    transparent, as a raster embedded in an SVG file)."""
    import base64
    import io
    for palette in ['coral', *palettes]:
        for theme in ('light', 'dark'):
            src = np.asarray(Image.open(BRAND / f'{WORDMARK[theme]}.png').convert('RGBA')).astype(np.float64) / 255
            dst = ROOT / 'public' / wordmark_href(palette, theme).lstrip('/')
            out = src if palette == 'coral' else recolor_floral_r(src, palette, theme)
            Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA').save(dst, 'WEBP', quality=92, method=6)
            print(f'{dst.relative_to(ROOT)} written')
    # The tab icon: the floral R alone on transparency, drawn from the light-tile matte, which stays solid on light and
    # dark browser chrome. Hue palettes look the same in both appearances; tonal palettes (Midnight, Pearl) take each
    # appearance's own variant, so they stay visible in a dark tab. One file per palette and appearance keeps each switch
    # a new URL.
    for palette in ['coral', *palettes]:
        for theme in ('light', 'dark'):
            sym = Image.open(BRAND / f"{SYMBOL['light']}.png").convert('RGBA')
            side = round(max(sym.size) * 1.06)
            square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
            square.alpha_composite(sym, ((side - sym.width) // 2, (side - sym.height) // 2))
            icon = square.resize((FAVICON_PX,) * 2, Image.LANCZOS)
            if palette != 'coral':
                rgba = recolor_floral_r(np.asarray(icon).astype(np.float64) / 255, palette, theme)
                icon = Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA')
            buf = io.BytesIO()
            icon.save(buf, 'PNG', optimize=True)
            data = base64.b64encode(buf.getvalue()).decode()
            dst = ROOT / 'public' / favicon_href(palette, theme)
            dst.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64">'
                f'<image width="64" height="64" xlink:href="data:image/png;base64,{data}"/></svg>\n'
            )
            print(f'{dst.relative_to(ROOT)} written')


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
                colour = value if palette == 'coral' else recolor_hex(value, palette, theme)
                lines.append(f'  --nw-logo-{name}: {colour};')
            full, corner = (CORAL_ARTWORK if palette == 'coral' else ARTWORK)[theme]
            lines.append(f"  --nw-logo-wordmark: url('{wordmark_href(palette, theme)}');")
            lines.append(f"  --nw-logo-symbol: url('{symbol_href(palette, theme)}');")
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
                f"    {theme}: {{\n      full: '/illustrations/{full.format(p=palette)}',\n"
                f"      corner: '/illustrations/{corner.format(p=palette)}',\n"
                f"      wordmark: '{wordmark_href(palette, theme)}',\n"
                f"      symbol: '{symbol_href(palette, theme)}',\n    }},"
            )
        themes.append(
            f"    favicon: {{ light: '{favicon_href(palette, 'light')}', dark: '{favicon_href(palette, 'dark')}' }},"
        )
        entries.append(f'  {palette}: {{\n' + '\n'.join(themes) + '\n  },')
    MAPPING_FILE.write_text(
        "// GENERATED by tools/brand/recolor_artwork.py: do not edit by hand.\n"
        "import type { AccentPalette, ResolvedTheme } from './theme.service';\n\n"
        "/**\n * The artwork of each accent palette and theme (botanical illustrations, floral-R wordmark and symbol): the single\n"
        " * palette-to-artwork mapping. The CSS tokens (tokens/_brand-artwork.scss) are generated from the same data;\n"
        " * ThemeService preloads these files before a switch.\n */\n"
        "export interface PaletteArtwork\n  extends Record<\n    ResolvedTheme,\n    {\n      readonly full: string;\n"
        "      readonly corner: string;\n      readonly wordmark: string;\n      readonly symbol: string;\n    }\n  > {\n"
        "  /**\n   * The browser-tab icon in the palette's colours, per resolved appearance: the transparent floral R. One file per\n"
        "   * palette and appearance, so each switch is a new URL, never a stale cached icon.\n   */\n"
        "  readonly favicon: Readonly<Record<ResolvedTheme, string>>;\n}\n\n"
        "export const PALETTE_ARTWORK: Readonly<Record<AccentPalette, PaletteArtwork>> = {\n"
        + '\n'.join(entries) + '\n};\n'
    )
    print(f'{MAPPING_FILE.relative_to(ROOT)} written')


if __name__ == '__main__':
    chosen = sys.argv[1:] or list(PALETTES)
    for palette in chosen:
        for master, (pattern, theme) in MASTERS.items():
            dst = ILLUSTRATIONS / (pattern.format(p=palette) + '.webp')
            recolor_image(ILLUSTRATIONS / f'{master}.png', dst, palette, theme)
            print(f'{dst.relative_to(ROOT)}  {dst.stat().st_size // 1024} KB')
    write_tokens()
    write_floral_r(chosen)
    write_floral_r_symbols(chosen)

