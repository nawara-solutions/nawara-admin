# CLAUDE.md

This file gives Claude (via Claude Code) context on the Nawara Admin project. Read this first before making changes.

## What this project is

**Nawara Admin — Angular operator frontend for the Nawara platform.** It is the internal console Nawara Solutions staff (the
Company owner and platform operators) use to administer the platform. It is **not** a Core microservice, holds **no** Core business
rule, and is **not** a product app (Nawara School, Nawara Drive and future products are separate). It calls Core's public HTTP APIs
with the operator's own Auth bearer; Core authorizes every request.

## Shared AI-Agent Workflow Standard

Branch naming, commit message format, PR conventions and the ADR/ADD/SDD/TDD design-doc process are defined once for all Nawara
Solutions projects in [`../ai-standard/README.md`](../ai-standard/README.md). This repo's `/branch`, `/commit`, `/pr`, `/design-doc`
commands, its `design-conformance`/`docs-writer`/`tech-lead` agents, its design-doc hook, `CONTRIBUTING.md`, `.husky/commit-msg`
and `docs/<type>/template.md` are **symlinks** into that shared source. **Editing one of them from here edits it for every Nawara
project:** don't, unless the owner explicitly asks for a shared-standard change. `commitlint.config.cjs`,
`.github/PULL_REQUEST_TEMPLATE.md` and `.mcp.json` are real copies; `docs/<type>/README.md` were seeded from the standard and are
owned here. The symlinks need the sibling layout (`ai-standard/`, `nawara-core/`, `nawara-admin/` under one parent folder).

## Git Workflow Permissions

- NEVER create a branch, commit, push, or open a PR unless explicitly asked. Ask first, then act.
- Use `/branch`, `/commit`, `/pr` for version-control work rather than ad-hoc git commands — see `CONTRIBUTING.md`.
- Conventional Commits; subject lines <= 100 characters (commitlint enforced once A1 installs husky). Never `--no-verify`.
- Never commit on `main`; squash-merge PRs.

## Start here: documents and the current stage

| Document | Authority for |
|---|---|
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | stages, the current stage, decisions required before each stage |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | the frontend constitution (the rules below in full, with rationale) |
| [`docs/BRAND.md`](docs/BRAND.md) | brand provenance (printed / sampled / proposed), logo and icon asset inventory |
| [`docs/CORE-INTEGRATION.md`](docs/CORE-INTEGRATION.md) | what Core offers (🟢 existing / 🟡 planned-mocked / 🔴 undefined), Core follow-ups |

```text
A0  Discovery / Architecture          ✅ COMPLETE
A1  Workspace / Tooling               ✅ COMPLETE (awaiting owner review)
A2  Design-system foundation          🟡 IMPLEMENTED + VERIFIED — owner review and scope decision pending (not closed)
A3  Application shell                 🟡 bounded slice A3-S1 (shell + Company Overview, demo data) implemented — owner review pending; rest not started
A4  Authentication                    🟡 A4-S1 reviewed as a mock prototype (sign-in + owner MFA; not production auth) — next: working-code design review; not closed
A5… see docs/ROADMAP.md               ⏸️
```

**Stage discipline:** work only inside the stage the owner has authorized. When an authorized stage is complete, **STOP** and
report. Never start the next stage on your own, even if it looks small or obvious. Update the stage table here and in
`docs/ROADMAP.md` when the owner closes a stage.

## Permanent frontend rules (summary; full text in `docs/ARCHITECTURE.md`)

- **Framework:** Angular (standalone, strict templates, lazy feature routes, Signals for state, RxJS for streams and HTTP).
- **Styling:** SCSS with `@use`/`@forward` (never `@import`), component styles colocated, **BEM** naming. **Forbidden:** Bootstrap,
  Tailwind, or any general-purpose utility CSS framework, unless the owner explicitly authorizes it.
- **Design:** semantic design tokens only; no raw colours in components; tokens come from the Nawara brand board
  (`src/styles/tokens/`). [`docs/BRAND.md`](docs/BRAND.md) records which values are printed on the board, sampled or
  proposed; never present a sampled or proposed value as a brand value. The logo is artwork from `public/brand/` (never font
  lettering); its vector symbol is a provisional reconstruction. A third-party library never defines the brand.
- **Themes:** light, dark and system preference, from the first component.
- **Languages:** English, French, Arabic from the first component; no hard-coded user-facing copy. Machine values (ids, codes, enums)
  are never translated.
- **Direction:** LTR and RTL from the beginning; logical CSS properties.
- **Responsive:** desktop, laptop, tablet, narrow viewport; only the documented breakpoints; container queries in components.
- **Accessibility:** WCAG 2.2 AA target; semantic HTML; keyboard and screen-reader support.
- **TypeScript:** strict; avoid `any` (requires a written justification); no casts that only silence the compiler.
- **Architecture:** feature-oriented with strong boundaries. **Components never perform raw HTTP calls.**

  ```text
  Component / Page
        ↓
  Facade / Application
        ↓
  Domain Gateway
        ├── Mock Adapter   (🟡 planned / 🔴 undefined contracts; provisional, never a Core contract)
        └── HTTP Adapter   (🟢 existing Core contracts)
  ```

- **Core is the authority.** Frontend permission handling is UX. Behaviour branches on HTTP status and Core `code`, **never** on a
  Core human `message`.
- **Security:** no tokens or secrets in browser storage, URLs or logs; no service tokens in the browser, ever.
- **Future sharing:** `@nawara/frontend-kit` is planned, **not created**. Do not create or extract it prematurely. Classify reusable
  work as **LOCAL / CANDIDATE / SHARED** (`docs/ARCHITECTURE.md` §31, register in `docs/ROADMAP.md`).
- **Quality:** clean architecture from the beginning, **without** speculative over-engineering (no empty folder trees, no custom
  frameworks, no state library without a demonstrated problem).
- **Dependencies:** no major dependency (UI library, state, i18n, icons, schema validation, testing frameworks) without owner
  approval; see the decision tables in `docs/ROADMAP.md`.

## Nawara Core: read-only source of backend truth

`../nawara-core` is a neighbouring repository. Admin work may **read** it to understand API contracts, DTOs, Auth, authorization,
Organization, localization, the error contract and Core V1/V2 documentation (start with its `docs/CORE-ROADMAP.md`; exact contracts
are each service's OpenAPI at `GET /<service>/docs`).

During Admin work, **never**: edit, create or delete Core files; switch, create or delete Core branches; commit, push or merge in
Core; run Core migrations, deployments or cleanup; change Core configuration or production. If Admin needs a backend change, record a
**Core follow-up** in `docs/CORE-INTEGRATION.md` §9 instead. Core work happens only in a separate, explicitly authorized Core task.
Planned Core V2 behaviour is not evidence that an API exists.

## Shared AI standard: read-only from this repo

`../ai-standard` is used through the symlinks above and is **not** modified while working on Admin, including through the
symlinked files in `.claude/`, `.husky/`, `docs/<type>/template.md` and `CONTRIBUTING.md`. If a shared change seems necessary,
STOP and report the proposal separately.

## Commands and validation

Shared commands: `/branch`, `/commit`, `/pr`, `/design-doc`. Shared agents: `design-conformance`, `docs-writer`, `tech-lead`.

Project scripts (real, from `package.json`):

| Script | Does |
|---|---|
| `npm start` | `ng serve` (development) |
| `npm test` / `npm run test:watch` | Vitest through `ng test` (single run / watch); specs are type-checked |
| `npm run lint` | `ng lint` (angular-eslint: TS, templates, template accessibility, Admin import rules) |
| `npm run format` / `npm run format:check` | Prettier write / check (shared-standard files and Markdown are excluded in `.prettierignore`) |
| `npm run build` | production build (strict TypeScript + strict templates, budgets) |
| `npm run lint:styles` | Stylelint: no `@import`, no raw colours outside `src/styles/tokens/`, BEM-shaped class names |
| `npm run check:i18n` / `npm run check:contrast` | en/fr/ar key parity and static key references / WCAG AA ratios of the token pairs the controls use |
| `npm run validate` | **format:check → lint → lint:styles → check:i18n → check:contrast → test → build**: run before every commit and before reporting a stage complete |

`validate` is a repository-local npm script, not a shared-standard command. Never run `prettier --write` (or any formatter or
fixer) on the symlinked shared files: it would edit `../ai-standard`.
