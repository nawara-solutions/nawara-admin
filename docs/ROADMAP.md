# Nawara Admin roadmap

- **Status:** A0 proposal for owner review.
- **Rule:** a stage starts only when the owner authorizes it. Each stage ends with focused validation of what it changed (risk-based),
  and the stage after it may assume its exit criteria.
- **Relationship to Core:** Admin never waits idle for Core and never invents Core contracts. 🟢 contracts are integrated; 🟡 are
  mocked behind gateways; 🔴 get UX placeholders and a Core follow-up ([CORE-INTEGRATION §9](CORE-INTEGRATION.md#9-core-follow-ups)).

## Stages

```text
A0  Discovery / Core alignment / architecture         ✅ COMPLETE
A1  Workspace & tooling                               🔵 CURRENT ┐
A2  Design-system foundation                          ⏳ ├─ M1 FOUNDATION
A3  Application shell & infrastructure                ⏳ ┘
    ── Frontend-kit review FK-1 ──
A4  Authentication & session                 🟢       ⏳
A5  Scope & organization context             🟢/🔴    ⏳
A6  Authorization-aware UI                   🟢 facts ⏳
A7  Identity & access administration         🟢       ⏳
A8  Organization & platform management       🟢/🔴/⚠  ⏳
A9  Audit                                    🟢/🔴    ⏳
A10 Release administration                   🟢/🔴    ⏳
A11 Licenses / Billing / Payments            🟡       ⏳
A12 Files / Notifications                    🟡       ⏳
A13 Services / Health / Monitoring           🟡/🔴    ⏳
    ── Frontend-kit review FK-2 (or earlier, on trigger) ──
A14 Integration hardening (mock → HTTP as Core V2 lands; production session model; CSP; origins)  ⏳
A15 Admin release certification                       ⏳
```

### Why this order differs from the initial sketch

- **Identity & access administration (A7) comes before organization management.** It is the largest fully 🟢 surface in Core V1:
  operators, platform assignments, memberships, join codes, admin invitations, member suspension and owner account security. All of
  it is in production. Organization management depends on a directory with no human contract (CF-02) and on a non-authoritative
  service (cutover gate G6).
- **Audit (A9) and Release (A10) come before the commercial domains.** They have real owner APIs today. Billing, Payment and
  Licenses are 🟡 and wait for Core V2 A10/A11.
- **The commercial domains are grouped (A11).** They share a wizard-and-records UX, and keeping Billing, Payment and Entitlement
  contracts separate is easier to verify side by side.

### Stage summaries

| Stage | Delivers | Exit criteria |
|---|---|---|
| **A1** Workspace & tooling | Angular 22 workspace (zoneless, standalone, strict), SCSS config, i18n mechanism configured for en/fr/ar, ESLint + Stylelint + Prettier, Vitest, import-boundary rules, budgets, CI pipeline (typecheck, lint, test, build all locales), commit conventions aligned with `ai-standard` | empty app builds in 3 locales with every gate green |
| **A2** Design-system foundation | tokens (primitive-provisional / semantic / scales), light + dark themes, no-flash theme script, typography (self-hosted Plex Sans + Arabic + Mono), breakpoints, base styles (focus, reduced motion, forced colours), icons (`nw-icon`), first primitives: button, icon button, link, form field, input, select, checkbox, dialog, menu, status badge, data state, skeleton, toast | contrast test passes in both themes; every primitive verified in LTR + RTL × light + dark; axe clean |
| **A3** Shell & infrastructure | responsive shell (sidebar / rail / drawer), top bar, theme and language switchers, localized title strategy, route skeleton with lazy features, runtime config, HTTP interceptors, `AppError`, global `ErrorHandler`, `ViewState`, gateway/mock pattern with one sample domain, preference registry, `nw-data-table` (CDK), Playwright + axe | shell is navigable by keyboard in all locales and themes; a mocked domain renders every `ViewState`; E2E smoke green |
| **A4** Authentication | owner login (password → TOTP/passkey), enrollment, recovery, operator code login, `AuthSession` (memory strategy), single-flight refresh, logout broadcast, session-ceiling handling, `StepUpService` + dialog, WebAuthn client | works against a local Core; session strategy decision D-A4 recorded |
| **A5** Organization context | `GET /auth/grants`-based scope overview, `OrganizationContext`, organization detail (🟢), switcher, directory (🔴 mock), stale/unauthorized handling | deep link, refresh and switching behave per ARCHITECTURE §7 |
| **A6** Authorization-aware UI | `CapabilityPolicy`, `capabilityGuard`, navigation and action availability, operator "step-up not available" messaging | policy unit-tested against Core's documented rules; every action handles `403` |
| **A7** Identity & access | operators (create, confirm, block/unblock, assignments), memberships (approve/reject/revoke), join codes, admin invitations, org-admin grant/revoke, member suspend/restore, `/account/security` (factors, secret key, password) | each mutation runs through the destructive-action + step-up pipeline; one-time secrets handled per §21 |
| **A8** Organizations & platforms | detail, metadata edit, create flows wired to `/organization/admin/*` and **disabled by config until the cutover**; directory still mocked | no production write before the organization-service cutover (G6/G7) |
| **A9** Audit | owner per-organization audit browser: UTC range ≤ 31 days in the operator's time zone, filters, cursor paging, record detail, correlation display | platform-level audit shown as unavailable (CF-04) |
| **A10** Releases | withdraw and minimum-version change with step-up; catalog mocked (CF-05) | — |
| **A11** Licenses / Billing / Payments | license wizard, subscription/entitlement view, invoices, payments, all 🟡 mocks with domain separation preserved | swapped to HTTP only when Core V2 A10/A11 publishes contracts |
| **A12** Files / Notifications | 🟡 mocks | per Core V2 A9/A8 |
| **A13** Services / Monitoring | 🟡/🔴 placeholders and mocks | per Core V2 A12 |
| **A14** Integration hardening | replace mocks as V2 contracts land; production session model (C or D); CSP and hosting headers; Core origin enablement (CF-07); performance and a11y audit | no mock bound in production config |
| **A15** Certification | full regression, accessibility, security, localization, performance; documentation | owner sign-off |

## M1 — Foundation (A1 + A2 + A3)

**Contains:** Angular 22 workspace · strict TypeScript and templates · SCSS (`@use`) · BEM · semantic design tokens · provisional
theme · light/dark/system · EN/FR/AR · RTL · typography · accessibility foundation · responsive shell · routing skeleton · runtime
configuration · API infrastructure (interceptors, errors) · gateway + mock architecture · global error handling · `ViewState` and
data-state UI · data table · preference registry · authentication **boundary** (the `AuthSession` interface and guard with a mock
session; real flows are A4) · organization-context **boundary** (route shape and service with a mock gateway) · permission-aware
navigation **boundary** (capability-tagged navigation items) · lint, format, unit, E2E and accessibility tooling.

**Does not contain:** real Core calls beyond configuration · feature screens · a BFF · a state library · an observability vendor ·
charts · the frontend-kit package.

## Decisions required before A1

| Id | Decision | Recommendation |
|---|---|---|
| D-A1-1 | Angular major and toolchain | Angular 22.x, TS per Angular, Node 24 LTS, npm (aligned with Nawara Drive desktop) |
| D-A1-2 | i18n mechanism | `@angular/localize` (compile-time, per-locale builds); alternative: Transloco |
| D-A1-3 | UI primitives dependency | Angular CDK; evaluate Angular Aria; **no** Angular Material |
| D-A1-4 | Dev tooling set | ESLint (angular-eslint), Stylelint (+ BEM pattern + logical-properties plugins), Prettier, Vitest; Playwright and Testing Library in A3 |
| D-A1-5 | Repository conventions | adopt `../ai-standard` (branches, commits, PRs) as Core and Drive do |

## Decisions required later (before the named stage)

| Id | Before | Decision |
|---|---|---|
| D-A2-1 | A2 | Official brand assets (logo, palette, typography). Until supplied, provisional tokens stay marked PROVISIONAL |
| D-A2-2 | A2 | Icon set (candidate: Lucide) |
| D-A2-3 | A2 | Digits in Arabic UI (recommended: Latin digits, `nu-latn`) |
| D-A4 | A4 (dev) / A14 (prod) | Refresh-token strategy: memory (dev) → token-handler BFF **or** Core V2 cookie mode (CF-01) |
| D-A3-1 | A3 | Response validation: hand-written decoders vs a schema library (Valibot/Zod) |
| D-A8 | A8 | Whether organization-admin members are ever Admin users (default: no) |
| D-A14 | A14 | Hosting (static host + headers), staging origins, Tauri packaging (not planned) |

## Safe to postpone

State library · observability vendor · OpenAPI codegen · visual regression · virtual scrolling · charts library · Tauri/desktop
packaging · offline support · product accent tokens · W3C design-token build pipeline · frontend-kit repository.

## Not to build yet

Any screen whose backend is 🔴 beyond a placeholder · permanent backend schemas for licenses, billing or monitoring · a BFF in M1 ·
an admin "god" API layer (forbidden by ADR-0041/0050) · a component library ahead of real screens · the frontend-kit package.

## Frontend-kit review points

```text
FK-1  after A3 (design foundation + shell primitives proven)
        │
        ├── insufficient evidence → remain local (expected outcome)
        └── stable primitives    → mark CANDIDATE, record API stability

TRIGGER  a second Nawara frontend needs the same foundation
         (Nawara Drive's Angular 22 desktop app beginning real UI work is the likely trigger)
        │
        ▼
FK-2  extraction review: package boundaries, versioning, release process, Drive + Admin adoption plan
        │
        └── extraction only with owner approval; creates nawara-frontend-kit (NOT CREATED)

FK-3  before A15: confirm no Admin-specific code leaked into CANDIDATE folders
```

### Kit register (maintained from A2)

| Item | Class | Notes |
|---|---|---|
| tokens, themes, typography, breakpoints | CANDIDATE (from A2) | product-independent by construction |
| `nw-*` primitives | CANDIDATE (from A2) | labels injected, never owned |
| HTTP interceptors, `AppError`, Core error mapping | CANDIDATE (from A3) | Core contract is shared by all products |
| i18n/direction, preference registry, theme service | CANDIDATE (from A3) | |
| shell, navigation, organization switcher, features | LOCAL | Admin-specific |
