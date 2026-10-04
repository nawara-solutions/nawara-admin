# Nawara Admin roadmap

- **Status:** A0 proposal for owner review.
- **Rule:** a stage starts only when the owner authorizes it. Each stage ends with focused validation of what it changed (risk-based),
  and the stage after it may assume its exit criteria.
- **Relationship to Core:** Admin never waits idle for Core and never invents Core contracts. 🟢 contracts are integrated; 🟡 are
  mocked behind gateways; 🔴 get UX placeholders and a Core follow-up ([CORE-INTEGRATION §9](CORE-INTEGRATION.md#9-core-follow-ups)).

## Stages

```text
A0  Discovery / Core alignment / architecture         ✅ COMPLETE
A1  Workspace & tooling                               ✅ COMPLETE (owner review) ┐
A2  Design-system foundation                          🟡 IMPLEMENTED + VERIFIED, owner review and scope decision pending ├─ M1 FOUNDATION
A3  Application shell & infrastructure                🟡 bounded slice implemented (A3-S1 Company Overview), rest ⏳ ┘
    ── Frontend-kit review FK-1 ──
A4  Authentication & session                 🟢       🟡 A4-S1 reviewed as a mock prototype (not production auth); rest ⏳
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
| **A1** Workspace & tooling | Angular 22 workspace (zoneless, standalone, strict TS and templates, routing), SCSS, ESLint (incl. `HttpClient` and forbidden-framework import rules), Prettier, Vitest, commitlint + Husky via the shared hook, budgets, `npm run validate`. **Delivered.** Moved out: i18n configuration (A2, Transloco), Stylelint (A2, needs approval), layer import rules (A3), CI pipeline (A3, needs approval) | `npm run validate` green |
| **A2** Design-system foundation | Transloco (en/fr/ar, missing-key CI check), `dir` handling, Angular CDK where first needed, tokens (brand primitives / semantic / scales), light + dark themes, no-flash theme script, typography (self-hosted Plex Sans + Arabic + Mono), breakpoints, base styles (focus, reduced motion, forced colours), icons (`nw-icon`), first primitives: button, icon button, link, form field, input, select, checkbox, dialog, menu, status badge, data state, skeleton, toast | contrast test passes in both themes; every primitive verified in LTR + RTL × light + dark; axe clean |
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

**Contains:** Angular 22 workspace · strict TypeScript and templates · SCSS (`@use`) · BEM · semantic design tokens · brand
theme · light/dark/system · EN/FR/AR · RTL · typography · accessibility foundation · responsive shell · routing skeleton · runtime
configuration · API infrastructure (interceptors, errors) · gateway + mock architecture · global error handling · `ViewState` and
data-state UI · data table · preference registry · authentication **boundary** (the `AuthSession` interface and guard with a mock
session; real flows are A4) · organization-context **boundary** (route shape and service with a mock gateway) · permission-aware
navigation **boundary** (capability-tagged navigation items) · lint, format, unit, E2E and accessibility tooling.

**Does not contain:** real Core calls beyond configuration · feature screens · a BFF · a state library · an observability vendor ·
charts · the frontend-kit package.

## A1 decisions (resolved by the owner, 2026-10-01)

| Id | Decision | Outcome |
|---|---|---|
| D-A1-1 | Angular major and toolchain | **Angular 22** (22.2.1), standalone, zoneless, **npm**. Node was verified, not assumed: Angular 22.2.1 supports `^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`; installed Node 24.18.0 is supported |
| D-A1-2 | i18n mechanism | **Transloco** (runtime switching, lazy scopes, reusable foundation). Compatibility verified in A1; **installed and configured in A2** |
| D-A1-3 | UI primitives dependency | **Angular CDK approved for selective use**, installed when A2/A3 needs it; **Angular Material not approved** |
| D-A1-4 | Dev tooling set | **Angular CLI, TypeScript, npm, Vitest, ESLint, Prettier, commitlint, Husky.** Stylelint is not in the approved baseline: proposed for A2 approval. Playwright and Testing Library remain A3 decisions |
| D-A1-5 | Repository conventions | **adopted**: `../ai-standard` through its symlink/copy convention (Pre-A1) |

### A1 result

`npm run validate` (format check → lint → type-checked unit tests → production build) passes. No feature code, no design system,
no localization, no CDK/Transloco/Lucide installed. Details in [`ARCHITECTURE.md` §1, §30](ARCHITECTURE.md#1-angular-baseline).

## A2 decisions

| Id | Decision | Outcome |
|---|---|---|
| D-A2-1 | Official brand | **Supplied as a raster brand board** (palette with printed hex codes, gradients, IBM Plex family names, Lucide-based icon style, logo). Provenance of every value: [`BRAND.md`](BRAND.md) |
| D-A2-2 | Icon set | **Lucide** (`lucide` core package, ISC), as the brand board states |
| D-A2-3 | Digits in Arabic UI | **Approved: Latin digits 0–9.** Formatting uses `ar-u-nu-latn` (`formattingLocaleOf`), unit-tested and shown in the gallery |
| D-A2-4 | Stylelint | **Approved and adopted**: `stylelint-config-recommended-scss` plus project rules (no `@import`, no raw colours outside `src/styles/tokens/`, BEM-shaped class names); part of `npm run validate` |

### A2 state (2026-10-01): implemented and verified; not closed

A2 is **not marked delivered**: its primitive scope needs the owner's decision (table below) and the logo is provisional.

**What exists**

- **Tokens:** brand primitives (`--nw-ref-*`, the 8 printed values marked `brand`) with derived ramps; semantic light and dark
  themes; scales. Themes can be scoped to a subtree with `data-theme`.
- **Brand assets:** board rasters (logos, wordmarks, symbols for light and dark), a provisional vector symbol, Nawara
  favicon and app icons, manifest ([`BRAND.md`](BRAND.md)). `nw-brand-mark` renders the artwork, never font lettering.
- **Foundation:** self-hosted Plex fonts (range-declared, loaded on demand), base styles (reset, focus, reduced motion, forced
  colours), breakpoints, CDK overlay on the z-index scale, no-flash theme/locale script, `PreferenceStore`, `ThemeService`
  (system/light/dark), `LocaleService` (Transloco, `<html lang dir>`, CDK direction).
- **Checks in `npm run validate`:** Prettier → ESLint → Stylelint → `check:i18n` (en/fr/ar parity; every key referenced as a
  string literal in templates and TypeScript exists; runtime-built keys are rejected, not silently skipped) → `check:contrast`
  (61 token pairs × 2 themes, including control states and boundaries) → unit tests → production build.
- **Verification surface:** the root route renders a design-foundation gallery (replaced by the shell in A3).

**Verified on the production build (2026-10-01)**

| Check | Result |
|---|---|
| `npm run validate` | pass: 18 test files, 35 tests; initial bundle 295.63 kB, no budget warning |
| Light / dark × EN / FR / AR × 1440 px / 390 px (12 renders) | correct `lang`, `dir`, theme before Angular starts; no horizontal overflow; no broken images; no console errors |
| System theme | followed when nothing is stored; nothing written to storage |
| Persistence | theme and language survive a reload; only `nw.theme` and `nw.locale` are stored |
| Keyboard | 26 tab stops, each with a visible focus ring; disabled button skipped |
| Dialog / menu (CDK) | labelled modal `alertdialog`, focus trapped, Escape closes, focus returns to the trigger; menu arrow keys and RTL placement |
| RTL | directional icons mirror; the logo does not; Arabic dates and numbers use Latin digits |
| Reduced motion / forced colours | transitions collapse to 1 ms; control borders kept; wordmark follows the forced palette |
| axe-core 4.13 (run ad hoc, not a project dependency) | 0 violations in all 12 renders and with the dialog open |

**Not verified:** a real screen reader; browsers other than Chrome; text over the gradient (axe cannot assess it);
zoom and reflow at 400 %. Token contrast ratios are necessary, not proof of WCAG conformance.

### Primitive scope: for the owner's decision

Approved for A2: `nw-icon`, `nw-button`, `nw-form-field`, input (the `nwControl` directive on native
`<input>` / `<select>` / `<textarea>`, which keeps native semantics and works with any forms API), `nw-status-badge`.
The nine below were built beyond that list. They are kept, unchanged in API, pending the decision.

| Extra primitive | Purpose | Depends on | Needed for A2? |
|---|---|---|---|
| `nw-brand-mark` | the logo (symbol, optional wordmark) from the brand artwork | brand assets | **Yes**: A2 must show the brand |
| `nw-icon-button` | icon-only button with a required accessible name | `nw-icon` | No. Used by dialog and toast for "close"; first real need is the A3 top bar |
| `nw-link` | inline text link styling on `<a>` | — | No. Trivial (styles only); first need A3 |
| `nw-checkbox` | checkbox on a native input, forms-compatible | `nw-icon`, `@angular/forms` | No. First need: first real form (A4/A7) |
| `nw-dialog` + `NwDialogService` | modal dialog frame | **CDK Dialog**, `nw-icon-button` | No. First need: confirmations (A4 step-up, A7) |
| `nw-menu` (+ trigger, item) | action menu | **CDK Menu** | No. First need: A3 top bar / row actions |
| `nw-data-state` | loading / empty / error block | `nw-icon`, `nw-skeleton` | No. First need: first data view (A3 sample domain) |
| `nw-skeleton` | loading placeholder | — | No. Used by `nw-data-state` |
| `nw-toast-outlet` + `NwToastService` | transient feedback, live regions | `nw-icon`, `nw-icon-button` | No. First need: first mutation (A4/A7) |

**Angular CDK** is used by: `LocaleService` (bidi `Directionality`), `nw-dialog` (Dialog), `nw-menu` (Menu), and the overlay
styles. If dialog and menu are deferred, CDK's only remaining use is `Directionality`, which could also be deferred with them.
Angular Material is not installed.

## A3-S1: bounded A3 shell + Company Overview slice (owner-authorized 2026-10-02)

**Scope (authorized):** only the infrastructure the approved Company Overview needs, with explicit mock adapters and a mock owner
session, on branch `feat/admin-a3-company-overview` (local; not committed). A2's open decisions (D-A2-6 logo vectors, D-A2-7
primitive scope, D-A2-8) **stay open**: PR #1 merged the A2 checkpoint, which does not close A2.

**Delivered (implemented and verified, owner review pending):**

- Shell (`layout/`): illustrated ivory sidebar with the board-pixel lockup and "ADMIN", navigation (only Overview is a page;
  the other approved destinations are shown as "not available yet", not links), owner profile, top bar with breadcrumbs,
  Company/Platform scope switcher, language and theme menus, skip link, responsive drawer below `laptop`, localized titles.
- Company/platform scope model and routes (ARCHITECTURE §6, §7 amendment): `/overview` (owner only), `/platforms/:platformId`
  (labelled placeholder), `/forbidden`, not-found, `/session-unavailable`; the A2 gallery moved to `/foundation`.
- `AppError`, `ViewState`, `CapabilityPolicy` + guards (UX only), `AuthSession` boundary with a demo owner (development
  builds only), build-time environments with a production barrier (ARCHITECTURE §24 interim, `npm run check:production`).
- Company Overview feature: model (metrics that can be unavailable, distinct identities separate from memberships,
  provisional invitation definition), gateway, mock adapter + fictional fixtures, facade, page and components (summary cards,
  platforms, needs attention, accessible SVG growth chart, activity), "Demo data" labelling, Create platform shown to the owner
  and disabled with an explanation.
- `nwNumber` / `nwDate` formatting pipes; `nw-brand-mark` `lockup` option; shell and chart tokens.

**Not delivered (deferred, still A3 or later):** Core HTTP infrastructure (interceptors, runtime config), `nw-data-table`,
Playwright/axe as project tooling (D-A2-5, D-A3-2), collapsible rail at `laptop`, notifications bell and account menu, every
other page, the real platform-creation flow (A4 step-up + organization-service cutover), operator scope overview.

**Refinement (owner-authorized 2026-10-02, latest reference):** layout matched in light mode at 1536 × 1024, then the dark
variant; workspace fills the available width; five-row grid (summary · platforms + attention · access & security + activity ·
growth + commercial · full-width services & health); KPI sparklines and trends removed; "Unique identities / Distinct accounts";
"memberships" throughout; Releases first under Operations (not a link); one "Demo data" disclosure; "Sample history" on the
chart and "Demo status" on health; softer curved sidebar petals with a theme mask, measured text contrast passing. New
demo-only summaries sit behind separate gateways: `CommercialSummaryGateway` (🟡 Billing/Payment) and `ServiceHealthGateway`
(🟡 CF-06), each with `unavailable` adapters outside demo builds. Operator assignments and unique operators are separate
figures; Auth is included in the health strip; no security score.

**Owner design (2026-10-02):** the shell and the page were rebuilt to the owner's claude.ai design ("Nawara Owner
Dashboard", responsive showcase at 820 / 390 px). Owner decisions for it: keep IBM Plex (add weight 700), keep Lucide, use the
design's lockup artwork, and show controls without a backend **disabled and saying so** (search, period selector, Create
platform, card links, account card); filters work on loaded demo data only (growth: All / per platform). Changes: blush
sidebar with the design lockup (no "ADMIN"), unread badge and bell from a new `NotificationSummaryGateway` (🟡 CF-14, mock in
demo builds), 64 px sticky top bar with search, two-letter language code and a light / system / dark segmented control;
header card with illustration; KPI cards with the organizations trend derived from the growth history; platform tiles;
growth panel with platform filter and change since the first day; activity with relative times and a "License renewed"
entry; access and commercial tiles; services as status cards with an "n of 8 operational" count. Lilac / night neutrals
sampled from the design ([`BRAND.md`](BRAND.md)). Left out on purpose: the design's "Live" platform status (no such Core
field), the active-licenses usage bar (no total), ⌘K hint (no shortcut), attention-row chevrons (no destination); the
plural sentence form "7 invitations awaiting acceptance" stays "7 · Invitations awaiting acceptance" (no plural support).

**A3-S2 Platforms directory (owner-authorized 2026-10-02, claude.ai design "Platforms Screen"):** `/platforms`
(owner only, capability `company.platforms.view`), reached from the overview's "Manage" link and the breadcrumbs. Header
card with Demo data and Create platform (focusable `aria-disabled` with its explanation as a tooltip); search over the loaded
list by name or product type with a polite live count (CLDR plural forms in en/fr/ar); platform cards with organizations,
memberships and operator **assignments**, "—" + "Not available" for a missing figure; loading skeletons, no results (Clear
search), empty (no retry) and error (Try again; "does not mean your company has no platforms") as separate states; faint
workspace flora. New `PlatformDirectoryGateway` (🔴 CF-02/CF-03/CF-11), mock in demo builds with `partial` / `empty` /
`error` scenarios. Platform scope: breadcrumbs Company › Platforms › name, "Back to Platforms". Sidebar spacing tightened so
the full navigation fits a 900 px tall window at the 110% scale. Not done: a sidebar entry for Platforms (the design has
none), operator scope.

Evidence: [`review/a3-company-overview/`](review/a3-company-overview/README.md).


## Coral + ink theme (owner-authorized 2026-10-04)

The owner's "Nawara Sign-in Coral Ink Theme" design, implemented on `feat/admin-coral-ink-sign-in` (local; not committed).
Owner decisions: the palette applies to the **whole application**; Readex Pro and JetBrains Mono replace IBM Plex (new
dependencies approved); the logo is the wordmark with the bloom, as designed (rule change recorded in
[`BRAND.md`](BRAND.md) §0).

- Tokens: coral and ink primitives, light and dark themes rewritten on the same semantic names; `check:contrast` passes
  unchanged (two design values were replaced by the nearest passing ink, see BRAND §0).
- Sign-in pages restyled to the design ("Botanical" panel, restrained decoration): brand panel, corner illustration, card,
  fields, buttons, language and theme controls, MFA, checking, no-access and platform-choice screens. Behaviour, copy and
  the A4-S1 limits are unchanged; no new flow.
- Logo Kit (2026-10-04): ink-circle favicon and app icons, flower symbol, dark-theme flourish; `/foundation` brand gallery shows the kit.
- Signed-in shell: botanical artwork in the sidebar, the content corner, the header cards and at the foot of the Platforms page; the earlier flower drawings are gone. Its layout is unchanged (the Workspace design's structural changes are not implemented).
- **Open:** production is not redeployed with this theme.

## CI/CD and first production deployment (owner-authorized 2026-10-03)

CI (`admin-ci.yml`) and production deployment (`admin-deploy.yml`) to `https://admin.nawara-solutions.com`, following Nawara
Core's VPS, GHCR and Traefik conventions; details, secrets and rollback in [`DEPLOYMENT.md`](DEPLOYMENT.md). Production serves
the frontend only and shows "sign-in not available": no mock authentication, demo account or simulated passkey ships. The
stylesheet budget warnings were resolved by component decomposition (Platforms page header; sign-in brand panel and demo
note) and by reusing `nw-button` for the Platforms message actions, without changing the design. Open: a Content-Security-
Policy (A14), and everything listed open for A4-S1 below.

## A4-S1: sign-in and owner MFA, demo adapter (owner-authorized 2026-10-02; alignment corrections 2026-10-02)

**Status (owner review, 2026-10-02): reviewed mock-prototype slice.** The alignment corrections were accepted. A4-S1 is a
prototype against a mock adapter: it is **not** production authentication and **not** an independently verified Core
integration. Changes stay local (not committed). A4 is not closed. **Open, carried forward:**

- the real session and refresh strategy (D-A4, CF-01; D-A4-1 for the demo session);
- the exact Core contracts and error-code mappings (CF-15);
- the platform-access contract used to authorize return navigation (CF-15);
- real WebAuthn validation (the passkey is simulated);
- a sign-out entry in the main application;
- the full operator journey (working-code sign-in, then landing or platform choice).

**Next:** review of the operator working-code request and verification design. No implementation until it is authorized.

**Scope (authorized):** the accepted sign-in page and the owner MFA slice (A4-2) of the claude.ai design "Sign-in Journey
Board", plus the in-flow access check, the no-access page and the operator platform choice, on branch
`feat/admin-a4-authentication` (local; not committed). **No Core request is made and no real authentication runs:** the only
`AuthGateway` is a demo mock, and the passkey prompt is simulated. Working code, enrollment, recovery and step-up screens are
not built (concepts the owner has not reviewed).

**Delivered (implemented and verified against the mock, owner review pending):**

- `/login` (outside the shell): brand panel at inline start on desktop, compact header below it, framed language and theme
  controls; email and password with client checks only; banners for failed, unavailable (Try again), rate limited, session
  expired, operator shift ended, signed out and "return to the requested page". A failed attempt clears the password and keeps
  the email. "Sign in with a working code" and "Recover owner access" stay on the page as the design shows them: established
  Core methods whose screens are deferred, focusable but unavailable, with a "not available in this prototype" description.
- `enrollment_required` and `recovery_required` are distinct next states, each with its own "not available in this
  prototype" banner. The flow stops there: no session is established and nothing navigates into Admin.
- `/login/verify`: the first method Core offers, the other one only when offered; one free-length TOTP field; invalid, rate
  limited, unavailable, expired (restart), passkey cancelled and "verification accepted" states.
- **Passkey is simulated.** Demo builds bind `SimulatedWebAuthnClient`: a browser OK / Cancel confirmation dialog, which is
  not a passkey prompt; it never calls WebAuthn, and the mock accepts its fake assertion unchecked. `BrowserWebAuthnClient`
  (`navigator.credentials.get`) is written but has never run against an authenticator or Core.
- In-flow "Checking your access": `/auth/me` + `/auth/grants` → pure `resolveLanding` (owner → `/overview`; operator → the
  single assigned Platform or the platform choice; anyone else → no access). The session is established only then.
- **Return navigation is authorized, not only safe:** `safeReturnUrl` keeps internal, path-only routes; `authorizedReturn`
  then follows only known routes the actor may open (`/overview`, `/platforms`: owner only; `/platforms/:id`: an operator only
  if assigned), and a Platform scope is confirmed with Core's platform-access check (`AuthGateway.platformAccess`, mirroring
  `GET /auth/platform-access/:platformId`; mocked) before navigating. Anything else falls back to the default landing.
- `/login/no-access` and `/login/platform` (names from the scope directory, CF-02); `sessionGuard` → `/login?returnUrl=…`,
  `guestGuard`, `AuthSession.establish/signOut`.
- Primitives: `nw-inline-alert` (four tones, alert tokens checked by `check:contrast`), `nw-spinner`, `nw-button` `size="lg"`
  and `busy`, `.nw-control--lg`; seven Lucide icons; en/fr/ar catalog `auth.*`.

**Reachable and tested** (unit specs, plus a scripted browser run against the dev server):

| Journey | Reachable in a demo build | Tested |
|---|---|---|
| Owner: password → TOTP (invalid, accepted) → access check → landing, incl. return to a requested page | yes | facade + page specs; browser |
| Owner: password → simulated passkey (cancelled, completed) | yes (simulation only) | facade + page specs; browser |
| Demo account with no administrative access → no-access → sign out → "signed out" banner | yes | facade spec; browser |
| `enrollment_required` / `recovery_required` stops | yes (demo accounts) | facade + page specs |
| Validation, failed, unavailable/Try again, reason banners | yes | page specs; browser (validation, failed) |
| Expired challenge, rate limited | no demo trigger | facade + page specs |
| Operator single-Platform landing; operator return-URL rules | **no** (operators sign in with a working code, not built) | landing + facade specs only |
| Operator platform choice | **no** | page spec with an operator session set directly, and a guard spec; never reached through sign-in |

The complete operator journey is **not** validated.

**Demo session (unresolved, D-A4-1):** demo builds no longer start signed in as the demo owner; they open on `/login`, which
lists the fictional accounts and says what is simulated (development builds only). The demo session lives in memory, so a
reload ends it. That is demo-only behaviour, not Admin's session strategy and not a Core contract: reload behaviour for real
sessions is decision D-A4 (CF-01), where memory-only is an unapproved proposal. Production builds still show "sign-in not
available".

**Not delivered:** the auth HTTP adapter and interceptors (CF-15, D-A4), real WebAuthn, refresh and logout broadcast,
working-code sign-in, enrollment and recovery screens, step-up, a sign-out entry in the shell.

## Decisions required later (before the named stage)

| Id | Before | Decision |
|---|---|---|
| D-A2-5 | A3 | axe-core as a project dependency for automated accessibility tests (with Playwright). In A2 it was run ad hoc from outside the project: 0 violations |
| D-A2-6 | A2 review | **Official vector logo files** (symbol, wordmark, lockups, light and dark). Until supplied: board rasters plus a provisional vector reconstruction ([`BRAND.md`](BRAND.md)) |
| D-A2-7 | A2 review | **Primitive scope**: keep or defer the nine extra primitives (table in "A2 state") |
| D-A2-8 | A2 review | Stylelint logical-properties rule (physical `left`/`right` ban): not added in the conservative configuration; currently no violations exist |
| D-A3-2 | A3 | CI pipeline (GitHub Actions running `npm run validate`), Playwright, Testing Library |
| D-A4 | A4 (dev) / A14 (prod) | Refresh-token strategy: memory (dev) → token-handler BFF **or** Core V2 cookie mode (CF-01) |
| D-A4-1 | A4-S1 review (**unresolved**) | Demo session: demo builds sign in through the mock (fictional accounts listed on `/login`) instead of starting as the demo owner, and a reload ends the demo session. Demo-only; it decides nothing about real sessions (D-A4). Confirm, or keep a direct demo entry |
| D-A4-2 | A4-S1 review | Copy of the "not available in this prototype" states: the working-code and recovery entries, and the `enrollment_required` / `recovery_required` banners (not in the design) |
| D-A3-1 | A3 | Response validation: hand-written decoders vs a schema library (Valibot/Zod) |
| D-A3-3 | A3-S1 review | Company Overview in production: today a production build has no session, so it shows "sign-in not available" and never demo data. Confirm, or define what an owner sees before Core aggregates exist (CF-11 to CF-13) |
| D-A3-4 | A3-S1 review | Provisional "pending invitations" definition (organization-admin invitations awaiting acceptance across the Company); Core decides the real one (CF-11) |
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
| tokens, themes, typography, breakpoints | CANDIDATE (from A2) | product-independent by construction; delivered A2 |
| `nw-*` primitives | CANDIDATE (from A2) | labels injected, never owned; 5 approved + 9 pending the scope decision (D-A2-7) |
| HTTP interceptors, `AppError`, Core error mapping | CANDIDATE (from A3) | Core contract is shared by all products |
| i18n/direction, preference registry, theme service | CANDIDATE (from A2) | delivered early: A2 needed them for themes and RTL |
| shell, navigation, organization switcher, features | LOCAL | Admin-specific |
