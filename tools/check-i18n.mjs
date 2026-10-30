// Missing-key check (docs/ARCHITECTURE.md §16): Transloco resolves keys at runtime, so this fails the build instead.
// 1. every catalog has exactly the keys of `en`, with non-empty string values;
// 2. every key referenced as a string literal in templates and TypeScript exists in `en` (see LIMITATION below).
// Run: `npm run check:i18n`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['en', 'fr', 'ar'];
const CATALOG_DIR = 'src/i18n';
const SOURCE_DIR = 'src/app';

const flatten = (node, prefix = '', out = new Map()) => {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
};

const catalogs = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    flatten(JSON.parse(readFileSync(join(CATALOG_DIR, `${locale}.json`), 'utf8'))),
  ]),
);

const problems = [];
const reference = catalogs.en;
for (const locale of LOCALES) {
  const catalog = catalogs[locale];
  for (const key of reference.keys())
    if (!catalog.has(key)) problems.push(`${locale}: missing "${key}"`);
  for (const [key, value] of catalog) {
    if (!reference.has(key)) problems.push(`${locale}: unknown "${key}" (not in en)`);
    if (typeof value !== 'string' || value.trim() === '')
      problems.push(`${locale}: empty or non-string "${key}"`);
  }
}

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts') ? [path] : [];
  });

// Core machine values that are never catalog keys but whose spelling falls in a catalog namespace: Core's step-up purposes
// (nawara-core 0044b20, auth-service src/owner/step-up.service.ts:23-100) in Admin's `billing.` namespace. Each is exempt
// ONLY in the one file that registers it, and only as these exact strings; every other literal there is checked as usual.
const PURPOSE_REGISTRY = join('src', 'app', 'core', 'authorization', 'purpose-registry.ts');
const MACHINE_VALUES = new Map([
  [
    PURPOSE_REGISTRY,
    new Set([
      'billing.assistance.correct',
      'billing.assistance.dispute.resolve',
      'billing.fraud_hold.place',
      'billing.fraud_hold.release',
      'billing.recovery_surplus.record_external',
      'billing.late_settlement.apply',
      'billing.recovery.write_off',
    ]),
  ],
]);

// An allowed value must still be a registered purpose of its file (a `PURPOSE_RULES` key: no stale entry), and must never
// also be a catalog key (it would hide that key's references).
const REGISTERED_PURPOSE = /^\s+'([a-z_.]+)': \{/gm;
for (const [file, values] of MACHINE_VALUES) {
  const registered = new Set(
    [...readFileSync(file, 'utf8').matchAll(REGISTERED_PURPOSE)].map(([, purpose]) => purpose),
  );
  for (const value of values) {
    if (!registered.has(value))
      problems.push(`${file}: allowed machine value "${value}" is not a registered purpose there`);
    if (reference.has(value))
      problems.push(`${file}: "${value}" is both an allowed machine value and a catalog key`);
  }
}

// Static key references. A reference is any string literal in a template or TypeScript source whose first segment is a
// catalog namespace (`common.`, `foundation.` ...). That covers the `transloco` pipe, `translate('…')` /
// `selectTranslate('…')` calls, `labelKey: '…'` data, and literals passed through variables or ternaries.
//
// LIMITATION (not covered): keys BUILT at runtime, such as `'status.' + tone` or template literals with `${}`. Such a
// key cannot be checked here; the convention is to list the full keys as literals (for example in a `Record`), which
// this check then sees. A prefix that ends in a dot is reported so it is never silent.
const namespaces = [...new Set([...reference.keys()].map((key) => key.split('.')[0]))];
const LITERAL = new RegExp(`(['"\`])((?:${namespaces.join('|')})\\.[A-Za-z0-9_.-]*)\\1`, 'g');
let used = 0;
let machineValues = 0;
const referenced = new Set();
for (const file of files(SOURCE_DIR)) {
  const source = readFileSync(file, 'utf8');
  const allowed = MACHINE_VALUES.get(file);
  for (const [, , key] of source.matchAll(LITERAL)) {
    if (allowed?.has(key)) {
      machineValues++;
      continue;
    }
    if (key.endsWith('.')) {
      problems.push(
        `${file}: "${key}" is a key prefix built at runtime; list the full keys instead`,
      );
      continue;
    }
    used++;
    referenced.add(key);
    if (!reference.has(key)) problems.push(`${file}: key "${key}" is not in en`);
  }
}
const unused = [...reference.keys()].filter((key) => !referenced.has(key));

if (problems.length > 0) {
  console.error(problems.map((p) => `✖ ${p}`).join('\n'));
  console.error(`\n${problems.length} i18n problem(s).`);
  process.exit(1);
}
console.log(
  `✔ i18n: ${reference.size} keys complete in ${LOCALES.join(', ')}; ${used} static references resolve` +
    ` (${machineValues} Core machine values allowed in their registry)`,
);
if (unused.length > 0) {
  console.log(`  note: ${unused.length} key(s) have no static reference: ${unused.join(', ')}`);
}
