// Foundation token collision check (nawara-frontend SHARED-CONTRIBUTION-POLICY §3, docs/ARCHITECTURE.md §13).
// @nawara-solutions/design-tokens owns every name in its manifest. Admin's stylesheets may define their own tokens and
// may alias foundation tokens, but they never redefine a foundation name, except the manifest's `accentControlled`
// tokens inside an accent palette (`@mixin <accent>-<theme>` in tokens/_accents.scss, applied under [data-accent]).
// Also checks that the package is pinned exactly, matches the installed manifest and loads before Admin's styles.
// Run: `npm run check:tokens`.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const PACKAGE = '@nawara-solutions/design-tokens';
const ACCENTS = 'src/styles/tokens/_accents.scss';
const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync(require.resolve(`${PACKAGE}/manifest.json`), 'utf8'));
const owned = new Set(manifest.tokens.map((t) => t.name));
const accentControlled = new Set(manifest.accentControlled);
const problems = [];

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

/** Each custom-property declaration with its line and the innermost `@mixin` it sits in (if any). */
function declarations(text) {
  const found = [];
  const mixins = [];
  let depth = 0;
  text.split('\n').forEach((line, index) => {
    const code = line.replace(/\/\/.*$/, '');
    const mixin = /@mixin\s+([\w-]+)/.exec(code);
    if (mixin) mixins.push({ name: mixin[1], depth });
    // A declaration anywhere on the line (`--x: …`, also in one-line rules); `var(--x)` references never match.
    for (const declared of code.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) {
      found.push({ name: declared[1], line: index + 1, mixin: mixins.at(-1)?.name });
    }
    for (const ch of code) {
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (mixins.length && mixins.at(-1).depth === depth) mixins.pop();
      }
    }
  });
  return found;
}

const sources = walk('src').filter((file) => /\.(scss|css)$/.test(file));
let declared = 0;
for (const file of sources) {
  const path = relative('.', file);
  for (const { name, line, mixin } of declarations(readFileSync(file, 'utf8'))) {
    declared++;
    if (!owned.has(name)) continue;
    const accentPalette = path === ACCENTS && /^[a-z]+-(light|dark)$/.test(mixin ?? '');
    if (accentPalette && accentControlled.has(name)) continue;
    problems.push(
      accentPalette
        ? `${path}:${line}: ${name} is foundation-owned and not accent-controlled; a palette may override only ${[...accentControlled].join(', ')}`
        : `${path}:${line}: ${name} is owned by ${PACKAGE} and must not be redefined (alias it under an Admin name instead)`,
    );
  }
}

// Exact pin, matching the installed artifact.
const pinned = JSON.parse(readFileSync('package.json', 'utf8')).dependencies?.[PACKAGE];
if (pinned !== manifest.version) {
  problems.push(
    `package.json: ${PACKAGE} must be pinned exactly to the installed ${manifest.version} (found "${pinned}")`,
  );
}

// The foundation stylesheet loads before Admin's own global styles.
const styles = JSON.parse(readFileSync('angular.json', 'utf8')).projects['nawara-admin'].architect
  .build.options.styles;
const foundationAt = styles.indexOf(`${PACKAGE}/tokens.css`);
const adminAt = styles.indexOf('src/styles/styles.scss');
if (foundationAt === -1 || adminAt === -1 || foundationAt > adminAt) {
  problems.push(
    `angular.json: "${PACKAGE}/tokens.css" must be listed before "src/styles/styles.scss" in the build styles`,
  );
}

if (problems.length > 0) {
  console.error(`✖ token collisions (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `✔ tokens: ${declared} custom-property declarations in ${sources.length} stylesheets redefine none of the ${owned.size} names of ${PACKAGE}@${manifest.version} (accent palettes override only its ${accentControlled.size} accent-controlled tokens); pinned exactly; foundation stylesheet loads first`,
);
