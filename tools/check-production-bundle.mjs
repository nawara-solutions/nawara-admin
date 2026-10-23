// Production demo-data check (docs/ARCHITECTURE.md §3, §24): the production build must contain no demo session, mock
// adapter or fixture. src/environments/environment.ts sets `demo: null` and never imports src/app/demo/, so none of
// the markers below may appear in the built files. Run after `ng build` (production): `npm run check:production`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist/nawara-admin/browser';
// Strings that exist only in demo modules: demo world records, the demo accounts, and mock adapter internals.
const MARKERS = [
  'demo.nawara.invalid', // demo account emails (src/app/core/auth/auth.fixtures.ts)
  'nawara-demo-2026', // demo password (auth.fixtures.ts)
  'simulated-passkey', // simulated passkey assertion (auth.mock.ts)
  '0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1a01', // demo Company id (src/app/demo/world/seed.ts)
  '3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c', // demo Organization ids (seed.ts)
  'platform-activity-s1', // demo activity record (seed.ts)
  'admin-invitation-1', // demo invitation record (seed.ts)
  'DEMO_WORLD_SEED', // demo world token (src/app/demo/world/demo-world.ts)
  'DEMO_LATENCY_MS', // mock adapter token (scope-directory.mock.ts)
  'COMPANY_OVERVIEW_DEMO_SCENARIO', // mock adapter token (company-overview.mock.ts)
  'PLATFORM_DIRECTORY_DEMO_SCENARIO', // mock adapter token (platform-directory.mock.ts)
  'PLATFORM_DASHBOARD_DEMO_SCENARIO', // mock adapter token (platform-dashboard.mock.ts)
  'ORGANIZATIONS_DEMO_SCENARIO', // mock adapter token (organization.mock.ts)
  'PLATFORM_COMMANDS_DEMO_SCENARIO', // mock adapter token (platform-command.mock.ts)
  'STEP_UP_DEMO_SCENARIO', // simulated step-up token (step-up.mock.ts)
  'demo-step-up-', // simulated step-up grants (auth.mock-state.ts)
  'platform-activity-created-', // the demo command's activity records (platform.commands.ts)
  'ORGANIZATION_COMMANDS_DEMO_SCENARIO', // mock adapter token (organization-command.mock.ts)
  'organization-activity-created-', // the demo command's activity records (organization.commands.ts)
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
