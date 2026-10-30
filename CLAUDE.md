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
A3  Application shell                 🟡 bounded slice A3-S1 (shell + Company Overview, demo data) implemented — owner review pending; A3-S3 account menu, mock sign-out, operator navigation complete (PR #17); P2 platform dashboard complete (PR #18); P2.5 canonical demo world complete (PR #19); P3a Organization directory and details complete (PR #20); P4-S1 action foundation + mock Create platform complete (PR #21); P3b-S1 mock Create organization complete (PR #22); P3b-S2 mock Edit organization details complete (PR #23); P3b-S3 mock admin invitations complete (PR #24); P5-S1 read-only Organization members complete (PR #25); P5-S2 mock membership decisions complete (PR #26); P5-S3a mock membership revocation complete (PR #27); P5-S3b mock organization-admin role complete (PR #28); P5-S4 account suspend/restore DEFERRED / BLOCKED BY CORE (read-only account card; CF-28–CF-31); P6-S1 read-only operators & access (provisional directory, CF-03) complete (PR #30); P6-S2 mock Platform access give/remove complete (PR #31); P6-S2b operator Platform-list refresh complete (PR #32); P6-S3 mock operator block/unblock complete (PR #33); P6-S4 mock operator creation complete (PR #34); P7-S1 mock Licenses & entitlements overview complete (PR #35); P7-S2 mock Platform and Organization subscriptions complete (PR #36); P7-S3 mock Billing & payment follow-ups complete (PR #37); P8-S1 simulated administrative activity browser complete (PR #38); P8-S2 Services & health inventory complete (PR #39); P8-S3 personal Notifications complete (PR #40); P8-S4 Releases information page (`/releases`, owner only; no catalog or command, CF-05) complete (PR #41); P9-S1 Settings hub and Language (`/settings`, `/settings/language`, account-menu Settings; browser-local, every signed-in actor) complete (PR #42); P9-S2 personal Account (`/settings/account`, read only, from the session; own account only) complete (PR #43); P9-S3 Company settings (`/settings/company`, owner only, read only, mock-first; CF-49 open) complete (PR #44); P9-S4-0 owner security contracts verified (Core `304064f`); P9-S4a owner Security overview (`/settings/security`, owner only, read only, mock-first; CF-54–CF-59 proposed) complete (PR #45); P9-S4b add an authenticator app (`/settings/security/add-authenticator`, owner only, mock-first; authenticator-code step-up only; not real Auth integration) complete (PR #46); P9-S4c create a new secret key (`/settings/security/secret-key`, owner only, mock-first; shown once, masked; local group check + "saved" before Done; unknown outcomes never resent; not real Auth integration) complete (PR #47); P9-S4d remove a factor (Security page dialog, owner only, mock-first; confirmed factors only; never the last confirmed factor or the last authenticator app while only passkeys remain; unclear answers settled by the factor list, never resent; includes the S4b same-tick input fix; not real Auth integration) complete (PR #48); P9-S4e change the password (`/settings/security/password`, owner only, mock-first; Core's limits only; this session continues, the others end at their next request; unknown outcomes never resent; the demo sign-in honours the change; not real Auth integration) — awaiting review; R0 Core V2 alignment roadmap approved as a planning baseline and F0 documentation alignment (Core `0044b20`; `docs/CORE-INTEGRATION.md` §11, `docs/review/r0-core-alignment/`; D-R0-4, D-R0-5 approved) — awaiting merge; D-A4 and financial product decisions open; financial slices F1–F16 not authorized; F1 Financial Authorization Foundation design reviewed (`docs/design/f1-financial-authorization.md`): F1-S0 errata/CF-74–76 and F1-S1 typed purpose registry authorized — awaiting review; F1-S2–S7 not authorized; P9-S5 planned; P7-S4 blocked by Core; rest not started
A4  Authentication                    🟡 A4-S1 + A4-S2 complete as mock prototypes (sign-in, owner MFA, operator working code; not production auth); A4-S3 contact confirmation complete as a mock prototype (owner-approved); A4-S4 owner TOTP enrollment complete as a mock prototype (owner-approved, PR #16) — real integration open; not closed
A5… see docs/ROADMAP.md               ⏸️
```

**Current priorities (owner, 2026-10-06; [`docs/ROADMAP.md`](docs/ROADMAP.md#current-priorities-owner-2026-10-06)):**
(1) shared frontend distribution and deliberate adoption, (2) Nawara Drive discovery may begin in parallel, (3) the remaining Admin
business features are deferred until needed. Each is still a separately authorized task.

**Stage discipline:** work only inside the stage the owner has authorized. When an authorized stage is complete, **STOP** and
report. Never start the next stage on your own, even if it looks small or obvious. Update the stage table here and in
`docs/ROADMAP.md` when the owner closes a stage.

## Permanent frontend rules (summary; full text in `docs/ARCHITECTURE.md`)

- **Framework:** Angular (standalone, strict templates, lazy feature routes, Signals for state, RxJS for streams and HTTP).
- **Styling:** SCSS with `@use`/`@forward` (never `@import`), component styles colocated, **BEM** naming. **Forbidden:** Bootstrap,
  Tailwind, or any general-purpose utility CSS framework, unless the owner explicitly authorizes it.
- **Design:** semantic design tokens only; no raw colours in components; tokens come from the owner's coral + ink theme
  (`src/styles/tokens/`, 2026-10-04). [`docs/BRAND.md`](docs/BRAND.md) §0 records which values the design states and which
  are derived; never present a derived value as a brand value. The logo is the `nw-brand-mark` wordmark: "nawara" as live
  text in Readex Pro with the bloom artwork from `public/brand/` (owner decision; it replaces the earlier "never font
  lettering" rule for this logo). Typefaces: Readex Pro and JetBrains Mono. A third-party library never defines the brand.
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
- **Sharing:** shared frontend code lives in `nawara-frontend` (`@nawara-solutions/*`; see "Shared frontend platform" below),
  never extracted from an Admin task. Classify reusable work as **LOCAL / CANDIDATE / SHARED** (`docs/ARCHITECTURE.md` §31,
  register in `docs/ROADMAP.md`).
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

## Shared frontend platform (nawara-frontend)

`../nawara-frontend` holds the shared Nawara frontend foundation: framework-independent packages (`foundation`) and, later,
Angular-shared packages (`angular`), published as `@nawara-solutions/*`. Its policy is
`../nawara-frontend/docs/SHARED-CONTRIBUTION-POLICY.md`; its architecture and ADRs are in `../nawara-frontend/docs/`.

- **Read-only during ordinary Admin work.** An Admin task never edits `nawara-frontend` (no files, branches, commits, PRs or
  publication). **This is not a permanent prohibition:** after separate owner authorization, this agent may contribute to
  `nawara-frontend` through a dedicated `nawara-frontend` task and branch, validated there, with a separately authorized PR that
  the owner merges; Admin then adopts the result in its own branch and PR.
- **Reuse first.** Before building a generic web frontend capability here, check `nawara-frontend` for a compatible one and reuse
  it. Admin business and domain UI (shell, navigation, layouts, workflows, permissions presentation, scope, auth flows) stays here.
- **A missing generic capability is its own contribution.** Stop and propose a separate `nawara-frontend` task; it merges there
  first, and Admin adopts it afterwards in its own branch, validation and PR. No change spans repositories.
- **Admin owns its theme and visual identity** (coral + ink, accent palettes, artwork, shadows, Admin-shell tokens). Never
  repurpose status/danger tokens as branding. Once Admin consumes `@nawara-solutions/design-tokens`, its tokens must not
  redefine a name the package exports (see its `manifest.json`), except through a supported customization point (today: the
  `accentControlled` tokens under `[data-accent='<name>']`).
- **Tokens come from the foundation package.** Admin consumes `@nawara-solutions/design-tokens` **0.1.0** (pinned exactly; GitHub Packages, private, with Read access granted to `nawara-admin`'s Actions). Its `tokens.css` loads before
  `src/styles/styles.scss` (`angular.json`), its breakpoints are forwarded by `src/styles/abstracts/_breakpoints.scss`, and
  `src/styles/tokens/` holds only Admin's extension. `npm run check:tokens` fails on any redefinition of a foundation name
  outside the accent palettes. Upgrading the package or changing the token namespace is a separate, authorized task
  (`docs/ARCHITECTURE.md` §31, `docs/ROADMAP.md`).
- **Installing needs a GitHub token with `read:packages`** (the committed `.npmrc` maps the scope and references
  `${NODE_AUTH_TOKEN}`; never commit a token): export `NODE_AUTH_TOKEN` or put it in your user-level `~/.npmrc`. CI uses the
  job's `GITHUB_TOKEN` (`packages: read`); the Docker build takes it as the BuildKit secret `npm_token` (see `Dockerfile`).

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
| `npm run check:i18n` / `npm run check:contrast` | en/fr/ar key parity and static key references / WCAG AA ratios of the token pairs the controls use (foundation values from the package manifest + Admin's extension and palettes) |
| `npm run check:tokens` | no Admin stylesheet redefines a `@nawara-solutions/design-tokens` name (except the 11 accent-controlled tokens in the palettes); the package is pinned exactly and loads first |
| `npm run validate` | **format:check → lint → lint:styles → check:i18n → check:tokens → check:contrast → test → build → check:production**: run before every commit and before reporting a stage complete |

`validate` is a repository-local npm script, not a shared-standard command. Never run `prettier --write` (or any formatter or
fixer) on the symlinked shared files: it would edit `../ai-standard`.
