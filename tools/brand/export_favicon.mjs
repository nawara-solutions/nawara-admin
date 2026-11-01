// Exports the Nawara Admin favicon family from its vector master (B2; docs/BRAND.md §B1).
//
// Master: docs/brand/nawara-admin-favicon.svg (Option A, owner selection 2026-11-01): hand-drawn on a 64-unit grid, the
// botanical colour `currentColor`, the users glyph (class "detail") painted with the palette's pictogram colour.
//
// Outputs (the existing paths; ThemeService applies them with a version suffix, tools/brand/recolor_artwork.py FAVICON_VERSION):
// - public/favicon.svg and public/icons/favicon-<palette>[-light].svg: real vector SVGs (no embedded raster), one per
//   palette and appearance file name, each in that appearance's leaf and pictogram colours: the APP's resolved
//   appearance, which the file name encodes (B1 finishing pass; no browser-scheme switching, so the dark-mode tab icon
//   always carries the dark treatment). Colours are read from the token files, never approximated: tokens/_accents.scss (`--nw-color-primary`
//   per palette and appearance), the foundation's coral-600 / coral-400 for Coral, and the reference blue #046efa for
//   Sapphire (owner decision B1, `--nw-logo-accent`).
// - public/favicon.ico (16, 32, 48), public/icons/icon-{16,32,48,192,512}.png (transparent), public/apple-touch-icon.png
//   (180, opaque white, 12 % margin) and public/icons/icon-maskable-512.png (opaque white, symbol inside the 80 % safe
//   zone): rasterized by Chromium from the master in the default palette (Coral, light value), since a raster cannot
//   follow a palette.
//
// Deterministic for a given Chromium (the environment's Playwright; not a project dependency, like the Python tools).
// Usage, from the repository root:  node tools/brand/export_favicon.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MASTER = readFileSync(resolve(ROOT, 'docs/brand/nawara-admin-favicon.svg'), 'utf8');
const REFERENCE_BLUE = '#046efa';
const PALETTES = [
  'coral',
  'rose',
  'plum',
  'indigo',
  'teal',
  'amber',
  'midnight',
  'pearl',
  'sapphire',
  'emerald',
  'burgundy',
];

function logoColours() {
  const accents = readFileSync(resolve(ROOT, 'src/styles/tokens/_accents.scss'), 'utf8');
  const foundation = readFileSync(
    resolve(ROOT, 'node_modules/@nawara-solutions/design-tokens/dist/tokens.css'),
    'utf8',
  );
  const ref = (name) => foundation.match(new RegExp(`${name}: (#[0-9a-f]{6});`))[1];
  const value = (v) => (v.startsWith('var(') ? ref(v.slice(4, -1)) : v);
  // The pictogram colour per appearance (theme defaults), then each palette's override (tokens/_accents.scss).
  const detail = {};
  for (const theme of ['light', 'dark']) {
    const source = readFileSync(resolve(ROOT, `src/styles/tokens/_theme-${theme}.scss`), 'utf8');
    detail[theme] = value(source.match(/--nw-logo-detail: ([^;]+);/)[1]);
  }
  const table = {};
  for (const [, name, theme, body] of accents.matchAll(
    /@mixin (\w+)-(light|dark) \{([\s\S]*?)\n\}/g,
  )) {
    const primary = body.match(/--nw-color-primary: (#[0-9a-f]{6});/)[1];
    const logo = body.match(/--nw-logo-accent: (#[0-9a-f]{6});/)?.[1];
    const own = body.match(/--nw-logo-detail: ([^;]+);/)?.[1];
    (table[name] ??= {})[theme] = {
      leaf: logo ?? primary,
      detail: own ? value(own) : detail[theme],
    };
  }
  table.coral = {
    light: { leaf: ref('--nw-ref-coral-600'), detail: detail.light },
    dark: { leaf: ref('--nw-ref-coral-400'), detail: detail.dark },
  };
  for (const p of PALETTES)
    if (!table[p]?.light || !table[p]?.dark) throw new Error(`no colour for ${p}`);
  if (table.sapphire.light.leaf !== REFERENCE_BLUE || table.sapphire.dark.leaf !== REFERENCE_BLUE)
    throw new Error('sapphire must keep the reference blue');
  return table;
}

/** The master in one appearance's colours: its leaf and its pictogram. */
function themed(colours) {
  const style = `<style>svg{color:${colours.leaf}}.detail{fill:${colours.detail}}</style>`;
  return MASTER.replace(/<!--[\s\S]*?-->\s*/, '')
    .replace(/ color="#[0-9a-f]{6}"/, '')
    .replace(/(<svg[^>]*>)/, `$1${style}`)
    .replace(/\n\s*/g, '')
    .concat('\n');
}

const href = (palette, theme) =>
  theme === 'light'
    ? `icons/favicon-${palette}-light.svg`
    : palette === 'coral'
      ? 'favicon.svg'
      : `icons/favicon-${palette}.svg`;

function writeIco(pngs, file) {
  // ICONDIR + one ICONDIRENTRY per PNG (PNG-compressed entries, supported by every current browser).
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size % 256, e);
    header.writeUInt8(size % 256, e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  writeFileSync(file, Buffer.concat([header, ...pngs.map((p) => p.data)]));
}

const colours = logoColours();
for (const palette of PALETTES) {
  for (const theme of ['light', 'dark'])
    writeFileSync(resolve(ROOT, 'public', href(palette, theme)), themed(colours[palette][theme]));
}
console.log(
  'public/favicon.svg and public/icons/favicon-<palette>[-light].svg written (22 vector files)',
);

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
const master =
  'data:image/svg+xml;base64,' + Buffer.from(themed(colours.coral.light)).toString('base64');
async function render(size, margin = 0, ground = 'transparent') {
  const inner = Math.round(size * (1 - 2 * margin));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${ground}"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">` +
      `<img src="${master}" width="${inner}" height="${inner}" style="display:block"></div>`,
  );
  await page.waitForFunction(() => document.images[0].complete);
  return page.screenshot({
    omitBackground: ground === 'transparent',
    clip: { x: 0, y: 0, width: size, height: size },
  });
}
const icons = {};
for (const size of [16, 32, 48, 192, 512]) {
  icons[size] = await render(size);
  writeFileSync(resolve(ROOT, `public/icons/icon-${size}.png`), icons[size]);
}
writeIco(
  [16, 32, 48].map((size) => ({ size, data: icons[size] })),
  resolve(ROOT, 'public/favicon.ico'),
);
writeFileSync(resolve(ROOT, 'public/apple-touch-icon.png'), await render(180, 0.12, '#ffffff'));
writeFileSync(
  resolve(ROOT, 'public/icons/icon-maskable-512.png'),
  await render(512, 0.2, '#ffffff'),
);
await browser.close();
console.log(
  `favicon.ico, icons/icon-{16,32,48,192,512}.png, apple-touch-icon.png, icons/icon-maskable-512.png written (Coral ${colours.coral.light.leaf})`,
);
