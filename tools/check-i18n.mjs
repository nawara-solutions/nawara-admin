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
const referenced = new Set();
for (const file of files(SOURCE_DIR)) {
  const source = readFileSync(file, 'utf8');
  for (const [, , key] of source.matchAll(LITERAL)) {
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
  `✔ i18n: ${reference.size} keys complete in ${LOCALES.join(', ')}; ${used} static references resolve`,
);
if (unused.length > 0) {
  console.log(`  note: ${unused.length} key(s) have no static reference: ${unused.join(', ')}`);
}
