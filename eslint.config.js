// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

// Selector prefixes (docs/ARCHITECTURE.md §13): `adm` for Admin-specific components,
// `nw` for product-independent design-system primitives (frontend-kit candidates).
const SELECTOR_PREFIXES = ['adm', 'nw'];

// Dependencies the frontend constitution forbids (docs/ARCHITECTURE.md §27, §33).
const FORBIDDEN_FRAMEWORKS = [
  {
    group: ['@angular/material', '@angular/material/*'],
    message: 'Angular Material is not the Nawara design system.',
  },
  {
    group: ['bootstrap', 'bootstrap/*'],
    message: 'Utility/general-purpose CSS frameworks are forbidden.',
  },
  {
    group: ['tailwindcss', 'tailwindcss/*'],
    message: 'Utility/general-purpose CSS frameworks are forbidden.',
  },
];

// Components never perform raw HTTP (docs/ARCHITECTURE.md §2, §3): HttpClient lives in HTTP adapters and core/http only.
const RAW_HTTP = {
  group: ['@angular/common/http'],
  message:
    'Use a domain gateway. HttpClient is allowed only in *.http.ts adapters and src/app/core/http/.',
};

// Demo internals (docs/ARCHITECTURE.md §3): mock adapters, the demo auth state, fixtures and the demo world. Only demo
// code and specs import them; production-facing code reaches demo adapters only through the lazy demo bindings.
const DEMO_INTERNALS = {
  group: ['**/*.mock', '**/*.mock-state', '**/*.fixtures', '**/demo/**'],
  message:
    'Demo internals are imported only by demo code (*.mock.ts, *.fixtures.ts, src/app/demo/) and specs. Use a gateway.',
};

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: SELECTOR_PREFIXES, style: 'camelCase' },
      ],
      // Attribute selectors keep native semantics for styled controls: <button nw-button>, <a nw-button>.
      '@angular-eslint/component-selector': [
        'error',
        { type: ['element', 'attribute'], prefix: SELECTOR_PREFIXES, style: 'kebab-case' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-restricted-imports': [
        'error',
        { patterns: [...FORBIDDEN_FRAMEWORKS, RAW_HTTP, DEMO_INTERNALS] },
      ],
    },
  },
  {
    files: ['src/app/**/*.http.ts', 'src/app/core/http/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...FORBIDDEN_FRAMEWORKS, DEMO_INTERNALS] }],
    },
  },
  {
    // Demo code and specs may use demo internals (a later block replaces the rule's patterns entirely).
    files: [
      'src/app/**/*.mock.ts',
      'src/app/**/*.mock-state.ts',
      'src/app/**/*.fixtures.ts',
      'src/app/demo/**/*.ts',
      'src/**/*.spec.ts',
      'src/app/**/testing/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: [...FORBIDDEN_FRAMEWORKS, RAW_HTTP] }],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      // <button nw-icon-button [label]> renders its required `label` input as aria-label (shared/ui/icon-button).
      '@angular-eslint/template/elements-content': ['error', { allowList: ['label'] }],
    },
  },
]);
