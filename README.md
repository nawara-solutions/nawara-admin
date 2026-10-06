# Nawara Admin

**Nawara Admin** is the internal operator console of **Nawara Solutions**: the web application through which the people who run the
Nawara platform administer it — identity and access, organizations, audit evidence, releases, and (as Core V2 lands) licenses,
billing, payments, files, notifications and service health.

It is **not** a product application. Nawara School, Nawara Drive and future products are separate applications with their own users.
Nawara Admin is used by Nawara Solutions staff only.

```text
                    NAWARA PLATFORM

           ┌──────────────────────────┐
           ▼                          ▼
      nawara-core                nawara-admin
      backend platform           operator frontend (this repository)
           │                          │
           └──── API CONTRACTS ───────┘
```

- Nawara Admin is **not a Core microservice** and holds **no Core business rule**. It calls Core's public HTTP APIs with the operator's
  own Auth bearer; Core authorizes every request server-side ([Core ADR-0041, ADR-0050](docs/CORE-INTEGRATION.md#1-evidence-baseline)).
- Core and Admin develop in parallel. Where Core has no contract yet, Admin builds against **provisional, mocked** contracts that never
  become Core APIs by themselves.

## Current state

| Item | State |
|---|---|
| Checkpoint | A0 ✅ · A1 ✅ (owner review) · **A2 — Design foundation 🟡 implemented and verified, owner review pending** · A3 ⏸️ not started |
| Angular application | Angular **22.2.1** (standalone, zoneless, strict). The root route is a design-foundation gallery (tokens, themes, EN/FR/AR, primitives, brand assets); no shell, authentication or business features yet |
| Production origin (owner decision, recorded in Core) | `https://admin.nawara-solutions.com` |

## Development

Requires **Node 24.18+** (Angular 22.2.1 supports `^22.22.3 || ^24.15.0 || >=26.0.0`) and **npm 11**. The shared Husky
`commit-msg` hook resolves through `../ai-standard`, so clone this repository next to it (see `CLAUDE.md`).

Installing needs read access to the private `@nawara-solutions/design-tokens` package on GitHub Packages: a classic
personal access token with `read:packages`, exported as `NODE_AUTH_TOKEN` or set in your user-level `~/.npmrc`
(`//npm.pkg.github.com/:_authToken=…`). The committed `.npmrc` only maps the scope; never commit a token.

```bash
npm ci                 # also activates the commit-msg hook (husky); needs NODE_AUTH_TOKEN (see above)
npm start              # dev server on http://localhost:4200
npm test               # unit tests once (Vitest); npm run test:watch to watch
npm run lint           # ESLint (TypeScript + templates + accessibility); npm run lint:styles for Stylelint
npm run format         # Prettier write;  npm run format:check to verify
npm run build          # production build into dist/
npm run validate       # format:check → lint → lint:styles → check:i18n → check:tokens → check:contrast → test → build → check:production
```

## Documentation

| Document | Answers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The frontend engineering constitution: layers, Angular baseline, state, routing, design system, theming, i18n/RTL, accessibility, security, testing, shared-frontend (`nawara-frontend`) model |
| [`docs/BRAND.md`](docs/BRAND.md) | What the brand board states, what was sampled, what is proposed; logo and icon asset inventory |
| [`docs/CORE-INTEGRATION.md`](docs/CORE-INTEGRATION.md) | What Core actually offers today (V1), what is planned (V2), the 🟢/🟡/🔴 contract matrix, and Core follow-ups |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Admin milestones, M1 definition, decisions required before each stage, current priorities, shared-frontend review points |

## Non-negotiables (summary)

Angular · strict TypeScript · SCSS with `@use` · BEM · semantic design tokens · light/dark/system themes · English/French/Arabic ·
RTL · responsive · accessible · no Bootstrap/Tailwind or any utility CSS framework · no raw HTTP in components · mocks only behind
gateways · Core is the authority for authorization.

Details and rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
