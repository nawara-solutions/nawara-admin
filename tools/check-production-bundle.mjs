// Production demo-data check (docs/ARCHITECTURE.md §3, §24): the production build must contain no demo session, mock
// adapter or fixture. src/environments/environment.ts sets `demo: null` and never imports src/app/demo/, so none of
// the markers below may appear in the built files. Run after `ng build` (production): `npm run check:production`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/nawara-admin/browser';
// Strings that exist only in demo modules: fixture ids, the demo owner, and mock adapter internals.
const MARKERS = [
  'demo.nawara.invalid', // demo owner email (src/app/demo/demo-bindings.ts)
  '0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a01', // demo Company id (scope-directory.fixtures.ts)
  'demo-activity-1', // activity fixture (company-overview.fixtures.ts)
  'DEMO_LATENCY_MS', // mock adapter token (scope-directory.mock.ts)
  'COMPANY_OVERVIEW_DEMO_SCENARIO', // mock adapter token (company-overview.mock.ts)
];

if (!existsSync(DIST)) {
  console.error(`✖ ${DIST} not found: run the production build first.`);
  process.exit(1);
}

const files = readdirSync(DIST).filter((name) => /\.(js|html)$/.test(name));
const problems = [];
for (const name of files) {
  const source = readFileSync(join(DIST, name), 'utf8');
  for (const marker of MARKERS) if (source.includes(marker)) problems.push(`${name}: "${marker}"`);
}

if (problems.length > 0) {
  console.error(problems.map((p) => `✖ demo content in the production build: ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✔ production bundle: ${files.length} files, no demo session, mock adapter or fixture`);
