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
| Checkpoint | A0 ✅ complete · **A1 — Workspace / tooling** 🔵 current (AI configuration done; Angular not yet generated) |
| Angular application | **not generated** (A1) |
| Dependencies | **none installed** |
| Production origin (owner decision, recorded in Core) | `https://admin.nawara-solutions.com` |

## Documentation

| Document | Answers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The frontend engineering constitution: layers, Angular baseline, state, routing, design system, theming, i18n/RTL, accessibility, security, testing, frontend-kit model |
| [`docs/CORE-INTEGRATION.md`](docs/CORE-INTEGRATION.md) | What Core actually offers today (V1), what is planned (V2), the 🟢/🟡/🔴 contract matrix, and Core follow-ups |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Admin milestones, M1 definition, decisions required before each stage, frontend-kit review points |

## Non-negotiables (summary)

Angular · strict TypeScript · SCSS with `@use` · BEM · semantic design tokens · light/dark/system themes · English/French/Arabic ·
RTL · responsive · accessible · no Bootstrap/Tailwind or any utility CSS framework · no raw HTTP in components · mocks only behind
gateways · Core is the authority for authorization.

Details and rationale: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
