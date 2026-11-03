// Regression check for the Nawara logos and favicons (B1; docs/BRAND.md §B1). Run: `npm run check:brand`.
// It reads what ships (token sources, component styles, public assets) and fails on any drift from the owner's decisions:
// 1. the logos paint their symbol with the accent token and their pictogram with the pictogram token (no fixed colour,
//    no filter), and every logo placement uses that layer system;
// 2. the decorative accent rules beside the copyright and the "NAWARA ADMIN" label above the headline are gone;
// 3. the logo boxes keep the logo's own proportions (no letterboxing, no distortion);
// 4. every tab favicon (11 palettes x 2 file names) is vector and coloured exactly with its palette's leaf and pictogram
//    colours for each browser scheme, read independently from the token files; the favicon map and the pre-paint script
//    still point at those files;
// 5. the static icons have their required pixel sizes.
// Pictogram contrast itself is held to 3:1 by check:contrast (--nw-logo-detail on --nw-logo-accent).
import { existsSync, readFileSync } from 'node:fs';

const errors = [];
const read = (path) => readFileSync(path, 'utf8');
const expect = (ok, message) => ok || errors.push(message);
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
const REFERENCE_BLUE = '#046efa';

// 1. The layer system
const logo = read('src/styles/abstracts/_logo.scss');
expect(
  /background-color: var\(--nw-logo-accent\);\s*mask: \$mask/.test(logo),
  '_logo.scss: the symbol must be painted with --nw-logo-accent through its mask',
);
expect(
  /background-color: var\(--nw-logo-detail\);\s*mask: \$details/.test(logo),
  '_logo.scss: the pictogram must be painted with --nw-logo-detail through its mask',
);
expect(!/filter\s*:/.test(logo), '_logo.scss: no CSS filter on the logos');
for (const [file, layers] of [
  [
    'src/app/shared/ui/brand-mark/brand-mark.scss',
    ['--nw-logo-admin-lockup-symbol-mask', '--nw-logo-admin-mark-mask'],
  ],
  // The desktop brand panel's copyright is plain text since the owner layout of 2026-11-02 (no Solutions mark there).
  [
    'src/app/features/auth/components/auth-frame/auth-frame.scss',
    ['--nw-logo-solutions-symbol-mask'],
  ],
]) {
  const source = read(file);
  for (const layer of layers)
    expect(
      source.includes(`var(${layer})`) && source.includes('nw.accent-logo('),
      `${file}: must draw ${layer} with nw.accent-logo`,
    );
}
for (const theme of ['light', 'dark']) {
  const source = read(`src/styles/tokens/_theme-${theme}.scss`);
  expect(
    source.includes('--nw-logo-accent: var(--nw-color-primary);'),
    `_theme-${theme}.scss: --nw-logo-accent must follow --nw-color-primary`,
  );
  expect(/--nw-logo-detail: [^;]+;/.test(source), `_theme-${theme}.scss: --nw-logo-detail missing`);
}

// 2. No decorative rules beside the sign-in label and the copyright
const panel = read('src/app/features/auth/components/auth-brand-panel/auth-brand-panel.scss');
expect(
  !panel.includes('--nw-logo-line'),
  'auth-brand-panel.scss: the decorative accent rules (--nw-logo-line) must stay removed',
);
expect(
  !panel.includes('auth-brand-panel__eyebrow'),
  'auth-brand-panel.scss: the "NAWARA ADMIN" label above the headline stays removed',
);
expect(
  !read('src/app/features/auth/components/auth-brand-panel/auth-brand-panel.html').includes(
    'eyebrow',
  ),
  'auth-brand-panel.html: no "NAWARA ADMIN" label above the headline',
);
for (const block of ['auth-brand-panel__copyright {']) {
  const start = panel.indexOf(`.${block}`);
  const body = panel.slice(start, panel.indexOf('\n}', start));
  expect(
    start >= 0 && !body.includes('::before') && !body.includes('::after'),
    `auth-brand-panel.scss: .${block} must have no decorative pseudo-element`,
  );
}

// 3. Logo boxes at the logo's own proportions
const mark = read('src/app/shared/ui/brand-mark/brand-mark.scss');
expect(
  /\.nw-brand-mark__word \{[\s\S]*?inline-size: 4\.247em;\s*block-size: 1\.028em;[\s\S]*?background-size: 5\.352em auto;/.test(
    mark,
  ) &&
    /\.nw-brand-mark__word-symbol \{[\s\S]*?inline-size: 0\.969em;\s*block-size: 0\.786em;[\s\S]*?mask-size: 5\.352em auto;/.test(
      mark,
    ),
  'brand-mark.scss: the trailing-symbol lockup must preserve the original lettering and symbol scales',
);
expect(
  /inline-size: 1\.227em;\s*block-size: 1em;/.test(mark),
  'brand-mark.scss: the symbol box must be 1.227em x 1em (200 / 163)',
);
// The desktop panel's copyright is plain text since the owner layout of 2026-11-02; the phone footer keeps the mark.
for (const file of ['auth-frame/auth-frame.scss'])
  expect(
    /aspect-ratio: 891 \/ 174;/.test(read(`src/app/features/auth/components/${file}`)),
    `${file}: the copyright mark must keep 891 / 174`,
  );

// 4. Favicons: colours from the tokens, independently of the export script
const foundation = read('node_modules/@nawara-solutions/design-tokens/dist/tokens.css');
const ref = (name) => foundation.match(new RegExp(`${name}: (#[0-9a-f]{6});`))?.[1];
const value = (v) => (v.startsWith('var(') ? ref(v.slice(4, -1)) : v);
const detailDefault = Object.fromEntries(
  ['light', 'dark'].map((t) => [
    t,
    value(read(`src/styles/tokens/_theme-${t}.scss`).match(/--nw-logo-detail: ([^;]+);/)[1]),
  ]),
);
const expected = {
  coral: {
    light: [ref('--nw-ref-coral-600'), detailDefault.light],
    dark: [ref('--nw-ref-coral-400'), detailDefault.dark],
  },
};
for (const [, name, theme, body] of read('src/styles/tokens/_accents.scss').matchAll(
  /@mixin (\w+)-(light|dark) \{([\s\S]*?)\n\}/g,
)) {
  const leaf =
    body.match(/--nw-logo-accent: (#[0-9a-f]{6});/)?.[1] ??
    body.match(/--nw-color-primary: (#[0-9a-f]{6});/)[1];
  const own = body.match(/--nw-logo-detail: ([^;]+);/)?.[1];
  (expected[name] ??= {})[theme] = [leaf, own ? value(own) : detailDefault[theme]];
}
expect(
  expected.sapphire?.light[0] === REFERENCE_BLUE && expected.sapphire?.dark[0] === REFERENCE_BLUE,
  'Sapphire must keep the reference blue',
);
const artwork = read('src/app/core/theme/palette-artwork.ts');
const index = read('src/index.html');
for (const palette of PALETTES) {
  for (const theme of ['light', 'dark']) {
    // Each file follows the app appearance its name encodes (B1 finishing pass), never the browser scheme.
    const [leaf, detail] = expected[palette][theme];
    const style = `<style>svg{color:${leaf}}.detail{fill:${detail}}</style>`;
    const file =
      theme === 'light'
        ? `icons/favicon-${palette}-light.svg`
        : palette === 'coral'
          ? 'favicon.svg'
          : `icons/favicon-${palette}.svg`;
    const path = `public/${file}`;
    if (!existsSync(path)) {
      errors.push(`${path} missing`);
      continue;
    }
    const svg = read(path);
    expect(svg.includes(style), `${path}: colours must be ${style}`);
    expect(!svg.includes('prefers-color-scheme'), `${path}: must not switch on the browser scheme`);
    expect(
      !svg.includes('<image') && svg.includes('<path'),
      `${path}: must be vector (no embedded raster)`,
    );
    expect(artwork.includes(`'${file}?v=`), `palette-artwork.ts: no versioned entry for ${file}`);
  }
}
expect(
  index.includes("'icons/favicon-' + accent + '-light.svg'") &&
    index.includes('link id="nw-favicon"'),
  'index.html: the pre-paint favicon selection must stay',
);

// 5. Static icon sizes (PNG IHDR width / height; ICO directory)
const png = (path) => {
  const b = readFileSync(path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
for (const [path, size] of [
  ['public/apple-touch-icon.png', 180],
  ['public/icons/icon-16.png', 16],
  ['public/icons/icon-32.png', 32],
  ['public/icons/icon-48.png', 48],
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-maskable-512.png', 512],
]) {
  const [w, h] = png(path);
  expect(w === size && h === size, `${path}: ${w}x${h}, expected ${size}x${size}`);
}
const ico = readFileSync('public/favicon.ico');
const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico.readUInt8(6 + 16 * i)).sort(
  (a, b) => a - b,
);
expect(sizes.join() === '16,32,48', `public/favicon.ico: sizes ${sizes.join()}, expected 16,32,48`);

if (errors.length) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}
console.log(
  `✔ brand: logo layers, no decorative rules, logo proportions, ${PALETTES.length * 2} favicons coloured from the tokens, icon sizes`,
);
