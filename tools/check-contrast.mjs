// WCAG 2.2 AA contrast check for the semantic colour tokens (docs/ARCHITECTURE.md §13).
// It checks the token pairs the primitives combine. It is necessary, not sufficient: passing here does not prove WCAG
// conformance of a screen (text over gradients or images, real focus order, zoom and reflow need rendered checks).
// Reads the SCSS token sources directly, so the check always tests what ships. Run: `npm run check:contrast`.
import { readFileSync } from 'node:fs';

const TOKENS = 'src/styles/tokens';
const THEMES = { light: `${TOKENS}/_theme-light.scss`, dark: `${TOKENS}/_theme-dark.scss` };

// [foreground, background, minimum ratio]. 4.5 = body text, 3 = large text and UI components (WCAG 1.4.3, 1.4.11).
const TEXT_SURFACES = [
  '--nw-surface-page',
  '--nw-surface-raised',
  '--nw-surface-sunken',
  '--nw-surface-overlay',
  '--nw-surface-inset',
];
const PAIRS = [
  ...['--nw-text-primary', '--nw-text-secondary', '--nw-text-link', '--nw-text-brand'].flatMap(
    (fg) => TEXT_SURFACES.map((bg) => [fg, bg, 4.5]),
  ),
  ['--nw-text-primary', '--nw-surface-brand-subtle', 4.5],
  ['--nw-text-brand', '--nw-surface-brand-subtle', 4.5],
  ['--nw-text-inverse', '--nw-surface-inverse', 4.5],
  ['--nw-text-on-primary', '--nw-color-primary', 4.5],
  ['--nw-text-on-primary', '--nw-color-primary-hover', 4.5],
  ['--nw-text-on-primary', '--nw-color-primary-active', 4.5],
  ['--nw-text-primary', '--nw-color-neutral-hover', 4.5],
  ['--nw-text-primary', '--nw-color-neutral-active', 4.5],
  ['--nw-text-brand', '--nw-color-primary-subtle', 4.5],
  ...['success', 'warning', 'danger', 'info'].map((s) => [
    `--nw-status-${s}-fg`,
    `--nw-status-${s}-bg`,
    4.5,
  ]),
  ...['success', 'warning', 'danger', 'info'].map((s) => [
    `--nw-status-${s}-fg`,
    '--nw-surface-raised',
    4.5,
  ]),
  // Controls as used by the primitives (shared/ui): interaction states, overlays and boundaries
  ['--nw-text-on-danger', '--nw-color-danger-hover', 4.5], // danger button, hover
  ['--nw-text-on-danger', '--nw-color-danger-active', 4.5], // danger button, pressed
  ...TEXT_SURFACES.map((bg) => ['--nw-color-danger-hover', bg, 3]), // filled danger button against the page
  ...TEXT_SURFACES.map((bg) => ['--nw-status-danger-fg', bg, 3]), // danger button outline, invalid field border
  ...['success', 'warning', 'danger', 'info'].map((s) => [
    `--nw-status-${s}-fg`,
    '--nw-surface-overlay', // toasts and menus sit on the overlay surface
    4.5,
  ]),
  ['--nw-status-danger-fg', '--nw-color-neutral-hover', 4.5], // destructive menu item, highlighted
  ['--nw-text-secondary', '--nw-surface-brand-subtle', 4.5],
  ...TEXT_SURFACES.map((bg) => ['--nw-border-strong', bg, 3]), // input and checkbox boundary (WCAG 1.4.11)
  ...TEXT_SURFACES.map((bg) => ['--nw-focus-ring', bg, 3]),
  ...TEXT_SURFACES.map((bg) => ['--nw-color-primary', bg, 3]),
  // Shell sidebar (layout/): navigation text, group labels, active item, focus
  ...['--nw-text-primary', '--nw-text-secondary', '--nw-text-brand'].map((fg) => [
    fg,
    '--nw-surface-sidebar',
    4.5,
  ]),
  ['--nw-focus-ring', '--nw-surface-sidebar', 3],
  // Accent icon tiles and charts (graphics, WCAG 1.4.11)
  ...['pink', 'orange', 'amber', 'purple'].map((a) => [
    `--nw-accent-${a}-fg`,
    `--nw-accent-${a}-bg`,
    3,
  ]),
  ['--nw-accent-purple-bg', '--nw-accent-purple-fg', 4.5], // top-bar avatar: initials on the solid accent
  ['--nw-chart-line', '--nw-surface-raised', 3],
  // Owner design (2026-10-02): figure labels, muted control icons, the ink action and the sidebar wash
  ...['--nw-surface-raised', '--nw-surface-inset', '--nw-surface-page', '--nw-surface-sidebar'].map(
    (bg) => ['--nw-text-label', bg, 4.5],
  ),
  ...['--nw-surface-raised', '--nw-surface-sidebar', '--nw-color-neutral-hover'].map((bg) => [
    '--nw-icon-muted',
    bg,
    3,
  ]),
  ['--nw-text-inverse', '--nw-surface-inverse-hover', 4.5],
  ['--nw-text-secondary', '--nw-color-neutral-hover', 4.5],
  // Urgent attention items (fixed colours, not recoloured by accent palettes)
  ['--nw-urgent-fg', '--nw-urgent-bg', 4.5],
  ['--nw-urgent-on-solid', '--nw-urgent-solid', 4.5],
  // Appearance swatches: the check mark on each sample colour (a graphic, 3:1)
  ...['coral', 'rose', 'plum', 'indigo', 'teal', 'amber'].map((n) => [
    '--nw-swatch-check',
    `--nw-swatch-${n}`,
    3,
  ]),
  // Inline alerts (A4): text on the tone background, and the tone icon as a graphic
  ...['success', 'warning', 'danger', 'info'].flatMap((t) => [
    [`--nw-alert-${t}-fg`, `--nw-alert-${t}-bg`, 4.5],
    [`--nw-alert-${t}-icon`, `--nw-alert-${t}-bg`, 3],
  ]),
];

const declarations = (file) =>
  Object.fromEntries(
    [...readFileSync(file, 'utf8').matchAll(/(--nw-[\w-]+):\s*([^;]+);/g)].map((m) => [
      m[1],
      m[2].trim(),
    ]),
  );

const primitives = declarations(`${TOKENS}/_primitives.scss`);

const resolve = (scope, name, seen = new Set()) => {
  if (seen.has(name)) throw new Error(`circular token ${name}`);
  seen.add(name);
  const value = scope[name] ?? primitives[name];
  if (value === undefined) throw new Error(`undefined token ${name}`);
  const ref = /^var\((--nw-[\w-]+)\)$/.exec(value);
  if (ref) return resolve(scope, ref[1], seen);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} is not a solid #rrggbb colour: ${value}`);
  return value;
};

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Accent palettes (tokens/_accents.scss): each `@mixin <accent>-<theme>` block overrides the theme's accent tokens and
// is checked with the same pairs as the default palette.
const accentSource = readFileSync(`${TOKENS}/_accents.scss`, 'utf8');
const accents = [...accentSource.matchAll(/@mixin ([a-z]+)-(light|dark) \{([^}]*)\}/g)].map(
  (m) => ({
    name: m[1],
    theme: m[2],
    overrides: Object.fromEntries(
      [...m[3].matchAll(/(--nw-[\w-]+):\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()]),
    ),
  }),
);
const scopes = [
  ...Object.entries(THEMES).map(([theme, file]) => ({ label: theme, scope: declarations(file) })),
  ...accents.map((a) => ({
    label: `${a.name}/${a.theme}`,
    scope: { ...declarations(THEMES[a.theme]), ...a.overrides },
  })),
];

let failures = 0;
for (const { label, scope } of scopes) {
  for (const [fg, bg, min] of PAIRS) {
    const value = ratio(resolve(scope, fg), resolve(scope, bg));
    if (value < min) {
      failures++;
      console.error(`✖ ${label}: ${fg} on ${bg} = ${value.toFixed(2)} (needs ${min})`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast failure(s).`);
  process.exit(1);
}
console.log(
  `✔ contrast: ${PAIRS.length} token pairs × ${scopes.length} theme/palette combinations meet the WCAG 2.2 AA ratios`,
);
