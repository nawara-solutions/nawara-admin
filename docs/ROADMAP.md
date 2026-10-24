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
A3  Application shell & infrastructure                🟡 bounded slices: A3-S1 Company Overview; A3-S3 account menu + sign-out + operator navigation (PR #17); P2 platform dashboard (PR #18); P2.5 demo world (PR #19); P3a Organization directory and details (PR #20); P4-S1 action foundation + mock Create platform (PR #21); P3b-S1 mock Create organization (PR #22); P3b-S2 mock Edit organization details (PR #23); P3b-S3 mock admin invitations (PR #24); P5-S1 read-only Organization members (PR #25); P5-S2 mock membership decisions (PR #26); P5-S3a mock membership revocation (PR #27); P5-S3b mock organization-admin role (PR #28); P5-S4 account suspend/restore DEFERRED / BLOCKED BY CORE (read-only card only); P6-S1 read-only operators & access (provisional directory); P6-S2 mock Platform access give/remove (PR #31); P6-S2b operator Platform-list refresh (PR #32); P6-S3 mock operator block/unblock (PR #33); P6-S4 mock operator creation (PR #34); P7-S1 mock Licenses & entitlements overview (PR #35); P7-S2 Platform and Organization subscriptions (PR #36); P7-S3 Billing & payment follow-ups (PR #37); P8-S1 simulated administrative activity browser (PR #38); P8-S2 Services & health inventory (PR #39); P8-S3 personal Notifications (PR #40); P8-S4 Releases information page (PR #41); P9-S1 Settings hub & Language (PR #42); P9-S2 personal Account (PR #43); P9-S3 Company settings (read only, owner); rest ⏳ ┘
    ── Shared-frontend review FK-1 ──
A4  Authentication & session                 🟢       🟡 A4-S1 reviewed as a mock prototype (not production auth); A4-S2 working-code mock prototype complete (owner-approved); A4-S3 contact-confirmation mock prototype complete (owner-approved); A4-S4 owner TOTP enrollment mock prototype complete (owner-approved, PR #16); real integration and rest ⏳
A5  Scope & organization context             🟢/🔴    ⏳
A6  Authorization-aware UI                   🟢 facts ⏳
A7  Identity & access administration         🟢       ⏳
A8  Organization & platform management       🟢/🔴/⚠  ⏳
A9  Audit                                    🟢/🔴    ⏳
A10 Release administration                   🟢/🔴    ⏳
A11 Licenses / Billing / Payments            🟡       ⏳
A12 Files / Notifications                    🟡       ⏳
A13 Services / Health / Monitoring           🟡/🔴    ⏳
    ── Shared-frontend review FK-2 (or earlier, on trigger) ──
A14 Integration hardening (mock → HTTP as Core V2 lands; production session model; CSP; origins)  ⏳
A15 Admin release certification                       ⏳
```

### Current priorities (owner, 2026-10-06)

1. **Shared frontend distribution and deliberate adoption.** Make `nawara-frontend` packages installable reproducibly
   (publication, starting with `@nawara-solutions/design-tokens`), then adopt them in Admin on purpose, each step a separately
   authorized task (see [Shared-frontend review points](#shared-frontend-review-points)).
2. **Nawara Drive discovery can begin in parallel.** It is a separate product and repository; Drive is also the likely second
   consumer that triggers FK-2.
3. **Remaining Admin business features (A5–A13) are deferred until needed.** The stage order below still applies when they
   resume; nothing here starts a stage.

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
| **A9** Audit | owner per-organization audit browser: UTC range ≤ 31 days in the operator's time zone, filters, cursor paging, record detail, correlation display; started as P8-S1 ([design](design/p8-operations-architecture.md)): a **simulated** activity browser at `/audit`, never Core evidence; the HTTP adapter is not started (CF-45, CF-47) | platform-level audit shown as unavailable (CF-04) |
| **A10** Releases | withdraw and minimum-version change with step-up; catalog mocked (CF-05); started as P8-S4 ([design](design/p8-operations-architecture.md) §16): an owner **information page** at `/releases`; no catalog, no command until the Core contracts are verified | — |
| **A11** Licenses / Billing / Payments | subscription/entitlement views, then billing and payment facts, all 🟡 mocks with domain separation preserved; started as P7 ([design](design/p7-commercial-architecture.md): P7-S1 Company overview and P7-S2 Platform / Organization subscriptions and P7-S3 payment follow-ups built; S4 mutations and catalog blocked by Core). The earlier "license wizard" is superseded: Core has no License entity and no owner commercial command (CF-41, CF-42) | swapped to HTTP only when Core V2 A10/A11 publishes contracts and they are verified |
| **A12** Files / Notifications | 🟡 mocks; Notifications started as P8-S3 ([design](design/p8-operations-architecture.md) §15): a personal demo unread count at `/notifications`, no inbox (CF-14, CF-48); Files inert | per Core V2 A9/A8 |
| **A13** Services / Monitoring | 🟡/🔴 placeholders and mocks; started as P8-S2 ([design](design/p8-operations-architecture.md) §14): the documented service inventory at `/services`, live health unavailable (CF-06); monitoring and alerting deferred | per Core V2 A12 |
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
charts · adoption of `nawara-frontend` packages (separately authorized; see FK review points).

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

**Follow-up FU-A3-OVERVIEW-FR-320 (open; targeted A3 responsive fix, separately authorized):** at 320 px in French, the
Company Overview's Services & health card action row ("7 sur 8 opérationnels · Voir les services",
`.overview-card__actions`) is wider than the viewport: the page scrolls horizontally by about 35 px. English and Arabic do
not overflow. Found during the A4-S4 browser review (2026-10-23); not part of A4-S4.


## Clean page headers and fixed workspace artwork (owner-authorized 2026-10-04)

On `feat/admin-clean-headers`, on top of `feat/admin-appearance-fixes` (PR #9). Company overview and Platforms headers
lose their banner card (background, border, radius, `::before` artwork) and sit on the workspace background, aligned
with the content; the unused `--nw-hero-*` tokens are removed. The shell's corner sprig and flower move into one fixed
decoration layer sized to the visible workspace.

## Appearance fixes (owner-authorized 2026-10-04)

On `feat/admin-appearance-fixes`, on top of `feat/admin-palette-artwork` (PR #8). The favicon follows the palette;
the workspace background and header cards take a subtle palette tint; the workspace flower stays at the bottom end of
the visible workspace while content scrolls; Create platform uses the avatar's colours (`--nw-avatar-*`), still
unavailable.

## Palette-following artwork and logo accents (owner-authorized 2026-10-04)

On `feat/admin-palette-artwork`, from `main` after PR #7. The botanical artwork (sign-in panel, sign-in corner, sidebar,
header sprig, shared workspace flower) and the logo's coloured parts follow the accent palette in light and dark; the
"nawara" lettering stays neutral. Variants are a per-pixel OKLCH hue rotation of the coral masters (all transparent,
single-hue rasters), not regenerated drawings. Favicon, app icons and the School product mark stay coral. Supersedes the
"artwork not tinted" limitation below.

## Shared workspace flower and personal appearance (owner-authorized 2026-10-04)

On `feat/admin-appearance-preferences`, from `main` after PR #6.

- **Workspace flower:** the Platforms page's bottom-end botanical moved into the authenticated shell (`layout/shell`), so
  every workspace page shows it (Company overview, Platforms, platform scope, Settings); the page-specific copy is gone.
  Not on the sign-in pages. Smaller and softer on tablets and phones; mirrored in RTL; decorative only.
- **Appearance:** Light / Dark / System and six curated accent palettes, reset to the Nawara default; one panel reused by a
  popover (sign-in pages and top bar) and by Settings → Appearance (`/settings/appearance`, owners and operators, no
  capability). Browser-local, validated, applied before first paint; not synchronized with Core (no endpoint exists or is
  assumed). Details in ARCHITECTURE §14.
- **Limitation:** the botanical artwork is a raster painted in coral (PNG); it is not tinted by the accent palette, because
  a filter would distort it. Per-palette artwork would need separately prepared files.

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

## P9-S3: Company settings, read only (implemented 2026-10-25)

**Status: implemented, awaiting review.** Design: [`design/p9-settings-architecture.md`](design/p9-settings-architecture.md) §13.

- `/settings/company`, the Company owner only (capability `company.settings.view`: route guard, hub entry, facade,
  mock `403` for any operator whatever their assignments): the Company's name and Platform count (demo world through
  the scope directory's selector; unavailable in a production build), links to the existing Company administration
  (overview, Platforms & Organizations, operators, licenses, billing, audit), and a plain statement that editing the
  Company's identity, branding or business configuration is not available (CF-49 open).
- No edit, save or upload control; no Company field Core does not define; no HTTP adapter.
- Next (each separately authorized): P9-S4 security (S4-0 Core verification first); P9-S5 Platform settings (S5-0
  first).

## P9-S2: personal Account, read only (implemented 2026-10-24)

**Status: implemented (PR #43, merged).** Design: [`design/p9-settings-architecture.md`](design/p9-settings-architecture.md) §12.

- `/settings/account`, every signed-in owner or operator, their own account only (no identity parameter, no
  capability): account type, the email and phone Core holds, an operator's derived contact confirmation, the owner's
  Company (scope directory) and an operator's currently granted Platforms (the canonical `ScopeContext` list filtered
  by the session's current assignments; unavailable state and P6-S2b "Try again" when it cannot be read).
- From the session only: no Core account read is integrated, no facade or gateway was added, and no credential,
  code, secret, token, grant or challenge is shown. The hub gains an "Account" section.
- Next (each separately authorized): P9-S3 read-only Company settings; P9-S4 security (S4-0 Core verification first);
  P9-S5 Platform settings (S5-0 first).

## P9-S1: Settings hub and Language (P9-0 reviewed, implemented 2026-10-24)

**Status: implemented (PR #42, merged).** Personal, browser-local preferences only. Design:
[`design/p9-settings-architecture.md`](design/p9-settings-architecture.md) (§11 for this slice).

- `/settings` is the Settings hub (no longer a redirect): Appearance and Language, each with its current value, for
  every signed-in actor (owner or operator, with or without Platform assignments); no capability, no gateway.
- `/settings/language`: English, French, Arabic through the one `LocaleService` (the same state and `nw.locale` key as
  the top-bar and sign-in menu); Arabic switches the application to right to left, English and French back to left to
  right. `/settings/appearance` unchanged.
- The account menu gains "Settings". No account, security, Company or Platform setting exists yet.
- Next (each separately authorized): **P9-S2** read-only Account; **P9-S3** read-only Company settings; **P9-S4**
  account security, gated by a read-only Core verification (S4-0); **P9-S5** Platform settings, gated by the Platform
  update contract's verification (S5-0). Proposed CF-49 to CF-53 (CORE-INTEGRATION §9).

## P8-S4: Releases information page (implemented 2026-10-24)

**Status: implemented (PR #41, merged); a development-only, mock-first prototype. No release catalog and no release
or deployment command exists in Admin** (CF-05 open). Design: [`design/p8-operations-architecture.md`](design/p8-operations-architecture.md) §16.

- `/releases`, the Company owner only (capability `company.releases.view`, route guard, facade, mock `403` for any
  operator): what Core's Release service owns; the catalog is not available; publishing is CI-only; withdraw and
  minimum-version change need the owner's security verification and are not available in Admin.
- No release, version, compatibility value, deployment or URL; no control, enabled or disabled. Production binds the
  unavailable adapter.
- Release and deployment mutations stay blocked until their Core contracts, authority and security requirements are
  separately verified.

## P8-S3: personal Notifications (implemented 2026-10-24)

**Status: complete (PR #40); a development-only, mock-first prototype. No personal inbox or unread-count
read exists** (CF-14 open; CF-44, CF-48 proposed). Design: [`design/p8-operations-architecture.md`](design/p8-operations-architecture.md) §15.

- `/notifications` for every signed-in owner and operator, each seeing only their own count (demo: owner 4, operators
  0); the count is the shell's one `NotificationIndicator`, so the badge, the bell and the page agree; its gateway takes
  no identity.
- The bell is a link to the page for everyone; the owner's Operations entry is a link; an operator has a personal entry
  beside Settings and still no Operations group.
- A count only: no message, sender, time, code or action; zero is never presented as "no notifications". Production
  binds the unavailable adapter.

## P8-S2: Services & health inventory (implemented 2026-10-24)

**Status: complete (PR #39); a development-only, mock-first prototype. No live service-health read exists**
(CF-06 open). Design: [`design/p8-operations-architecture.md`](design/p8-operations-architecture.md) §14.

- `/services`, the Company owner only (capability `company.services.view`, route guard, facade, mock `403` for any
  operator): the eight documented Nawara Core services and their responsibilities, "Live health unavailable", and what
  Core integration would add. Not a monitoring dashboard: no status, uptime, latency, incident, version or refresh.
- One shared inventory gateway for `/services` and the Company Overview card; the illustrative "operational / delayed"
  fixture and the "n of 8 operational" count are removed.
- Production binds the unavailable adapter; the browser never calls infrastructure probes. Monitoring and alerting stay
  deferred.

## P8-S1: simulated administrative activity browser (P8-0 reviewed, D1–D9 approved, implemented 2026-10-24)

**Status: complete (PR #38); a development-only, mock-first prototype. Core Audit integration is NOT
done.** Design: [`design/p8-operations-architecture.md`](design/p8-operations-architecture.md) §13.

- `/audit` (Audit log), the Company owner only (capability `company.audit.view`, route guard, facade, mock `403` for any
  operator): the demo world's administrative events, permanently labelled "Simulated administrative activity — not
  Core audit evidence"; Platform → Organization → action filters in the URL (ids only); Company-level events in their own
  section; an Organization's detail opens it preselected and the page leads back.
- One source: `companyActivity` (the Company Overview feed's); agreement with the Overview, Platform dashboards and
  Organization details is tested. No event generated, no audit-only field, no export.
- Production binds the unavailable adapter. Next (each separately authorized): P8-S2 Services & health, P8-S3
  Notifications; P8-S4 Releases blocked (CF-05); Files and Monitoring inert. Proposed CF-45, CF-47 tracked; CF-04 open.

## P7-S3: mock Billing & payment follow-ups (implemented 2026-10-24)

**Status: complete (PR #37); a development-only, mock-first prototype. No Core contract exists** (CF-40
proposed). Design: [`design/p7-commercial-architecture.md`](design/p7-commercial-architecture.md) §6c.

- `/billing`, the Company owner only (capability `company.commercial.view`, route guard, facade, mock `403` for any
  operator): the demo world's two payment issues, each with its Organization, Platform and issue (failed / awaiting
  action), and the Organization's subscription and entitlement as separate facts; a local issue filter; what is not
  available (invoices, amounts, balances, settlement, refunds, disputes, retries, revenue) said once, without controls.
- Counts agree with the Company Overview, the Platform dashboards and the Organization details (tested). A payment issue
  never changes a subscription.
- **Not implemented:** financial reporting, invoice management, settlement, refunds or any payment operation.
  Production binds the unavailable adapter. **P7-S4 stays blocked** until Core contracts are verified.

## P7-S2: mock Platform and Organization subscriptions (implemented 2026-10-24)

**Status: complete (PR #36); a development-only, mock-first prototype. No Core contract exists** (CF-36,
CF-37 proposed). Design: [`design/p7-commercial-architecture.md`](design/p7-commercial-architecture.md) §6b.

- `/licenses/platforms/:platformId`, the Company owner only (the `/licenses` guard, facade, mock `403` even for an
  operator assigned to the Platform; collapsed `404` for a Platform that is not the Company's): every Organization of
  the Platform with its subscription state, when it ends or ended, the 14-day ending-soon indicator and whether it is
  entitled now; a local search and a URL state filter; reached from the overview's by-Platform table.
- The Organization detail's Subscription card shows the entitlement as its own row, the grace timeline and a per-state
  explanation, and links to the Platform's subscriptions; no new route.
- One source: the same `subscriptionDistribution` / `entitlementOf` selectors plus `subscriptionEndsWithin`; agreement
  with the overview, the Organizations directory and every detail section is tested. A new Organization is listed
  without a subscription.
- Production binds the unavailable adapter. Next: P7-S3 (Billing & payments follow-ups); **P7-S4 stays blocked**.

## P7-S1: mock Licenses & entitlements overview (P7-0 reviewed, D1–D9 approved, implemented 2026-10-24)

**Status: complete (PR #35); a development-only, mock-first prototype. No Core contract exists** (proposed
CF-36 to CF-42). Design: [`design/p7-commercial-architecture.md`](design/p7-commercial-architecture.md).

- `/licenses`, the Company owner only (capability `company.commercial.view`, route guard, facade, mock): Organizations,
  active subscriptions, subscriptions in grace (never counted as active), no subscription, ending within 14 days; the
  entitlement (active + grace) said apart; per-Platform distribution with each Platform's declared Personal Premium
  count; what needs attention, linked to each Organization; one short "Not available yet" section (plans, allocation,
  changes, revenue) without controls.
- Canonical selectors `subscriptionDistribution` and `entitlementOf`; the Company Overview card now uses the same
  distribution, is renamed "Active subscriptions" (D1) and links to `/licenses`. Agreement with the Platform dashboards
  and the Organization directory is tested.
- Production binds the unavailable adapter ("Not available in this build"); no request, no demo record.
- Next: P7-S2 (one Platform's subscriptions, Organization subscription section), P7-S3 (Billing & payments follow-ups).
  **P7-S4 (catalog, renewals, plan changes, revenue) is blocked** until Core contracts exist and are verified.

## P6-S4: mock operator creation and confirmation (design approved and implemented 2026-10-24)

**Status: implemented, awaiting review; a development-only mock prototype. Real Core integration is NOT complete**
(no HTTP adapter; production does not offer creation). Design:
[`design/p6-s4-operator-creation.md`](design/p6-s4-operator-creation.md).

- "Create operator…" on the directory for the Company owner only (capability, action, mock and command): exactly one
  contact, email or phone, validated and normalized like sign-in; the owner's step-up `operator.create`, spent only on
  commit; one unconfirmed operator with zero Platform assignments and one Company-level `operator.created` activity.
- Uniqueness across every account kind (world operators and members, every sign-in fixture); `409
  account_already_exists` worded neutrally, never naming the kind.
- Created operators confirm and sign in through the existing journey: the sign-in mock now resolves them from the demo
  world; block cancels their codes and session; unblock restores nothing.
- Lost answers: never resent; the demo directory is read again (found / not found / unchecked); a new attempt is
  explicit and verifies again. Success opens the operator with the next steps.
- Follow-ups: CF-03, CF-16, CF-32 (idempotent create or authorized lookup), CF-33, CF-35; shared factor chooser.

## P6-S3: mock operator block and unblock (design approved and implemented 2026-10-24)

**Status: implemented, awaiting review; a development-only mock prototype.** Design:
[`design/p6-s3-operator-block.md`](design/p6-s3-operator-block.md).

- "Block account…" / "Unblock account…" on an operator's details for the Company owner only (capability, action, mock
  and command); no step-up, as Core (residual risk recorded). Block: alertdialog, focus on Cancel; the CF-16 warning for
  unconfirmed operators; no resend.
- Consistency fixes: the Platform check now requires an active account AND an active assignment; block cancels the
  operator's unused working and confirmation codes and ends their simulated session; unblock restores neither and never
  confirms; a refused read's `401` reaches the P6-S2b refresh, whose `401` ends the session.
- Assignments kept and shown as ineffective while blocked; record counts unchanged. Company-level `operator.blocked` /
  `operator.unblocked` activity in the Company Overview.
- Lost answers reload the DEMO state and allow only an explicit repeat (with the duplicate-audit warning).
- Follow-ups: CF-03, CF-16, proposed CF-35.

## P6-S2b: signed-in operator Platform-list refresh (design approved and implemented 2026-10-24)

**Status: implemented, awaiting review; a development-only mock prototype.** Design:
[`design/p6-s2b-operator-scope-refresh.md`](design/p6-s2b-operator-scope-refresh.md).

- One `OperatorGrantsRefresh` service re-reads a signed-in operator's `/auth/grants` after a refused Platform read, on
  tab return, on a Platform switch and on "Try again"; single flight, stale and other-session answers dropped, identical
  grants change nothing, no polling, owners never.
- A genuine `401` ends the local session and opens sign-in ("Your session has ended"); network, `429` and `503` keep the
  session and the last known list and offer a retry. A refusal stays a refusal: nothing is resent or re-navigated.
- Refreshing the displayed list does not replace server-side authorization: Core (and the demo mocks) still decide
  every request.

## P6-S2: mock Platform access give and remove (design approved and implemented 2026-10-24)

**Status: implemented, awaiting review; a development-only mock prototype, no Core HTTP integration.** Design:
[`design/p6-s2-platform-access.md`](design/p6-s2-platform-access.md).

- On an operator's details, the Company owner gives access to an unassigned Company Platform or removes an active one:
  one dialog (removal: alertdialog, focus on Cancel), the owner's step-up of the direction's purpose
  (`platform_assignment.grant` / `.revoke`), spent only on commit; the record appears as current or moves to the
  history (append-only).
- Owner-only in the capability, the action, the mock and the demo-world commands; operators get `403`, foreign or
  unknown records `404`. Warnings (only Platform, no other listed operator) never block.
- `409`, `404`, `503 hierarchy_unavailable` and lost answers reload the history and say what it shows; never resent;
  "Try again" is a new verification.
- **Follow-ups:** **P6-S2b** (signed-in operator Platform-list refresh, done: see above); a **shared step-up factor selector** (passkey,
  secret key) for every eligible purpose; CF-03 (production directory); exact `429` unverified; `hierarchy_unavailable`
  verified for grant only.

## P6-S1: read-only Operators & access (Core verified in P6-S0 at `750eb21`; implemented 2026-10-24)

**Status: implemented, awaiting review; a development-only mock prototype. Production Operator directory integration is
NOT complete** (Core has no directory, CF-03). Design: [`design/p6-operators-and-access.md`](design/p6-operators-and-access.md).

- The owner's "Operators & access" (`/operators`): every operator with active Platforms, demo account state and totals;
  local search by email or phone; Platform, account-state and sort filters in the URL; table and cards.
- Operator details (`/operators/:operatorId`): current Platform access and removed access apart, with dates; the account
  as demo data; what Platform access means; the later changes listed as information only (no control).
- Owner only, direct URLs included; an unknown or foreign operator is "not found"; no operator change of any kind.
- Demo world: operator accounts and an append-only assignment history (8 records, 5 active: every existing count and
  grant unchanged); a blocked demo operator whose sign-in is refused.
- Implemented in Core, built later in Admin as demo mocks: grant / remove Platform access (P6-S2), block / unblock
  (P6-S3), create operator (P6-S4). Core follow-ups: CF-03, CF-16, CF-32 to CF-34.

## P5-S4: member account suspension and restoration — DEFERRED / BLOCKED BY CORE (2026-10-24)

**Status: DEFERRED / BLOCKED BY CORE. Not implemented, not complete.** Design, verified contract and feasibility:
[`design/p5-s4-account-suspension.md`](design/p5-s4-account-suspension.md).

- Core's `POST /auth/admin/members/:id/suspend|restore` (owner only, `403` otherwise; step-up `account.suspend` /
  `account.restore`, TOTP or passkey; closed reason; `200 { id, suspended, changed }`; account-wide: every session and
  Organization) cannot be presented faithfully: no owner read shows an account's state, its other memberships or its
  eligibility. The owner deferred the actions and rejected a limited "state unknown" variant (Option L).
- Shipped: a read-only "Nawara account" card on a membership's details explaining the difference from revoking and why
  account actions are not offered (an operator is told they are the Company owner's). No control, no mock account
  state, no endpoint.
- Unblocks when Core answers **CF-28** (owner account read), with CF-29 (eligibility before step-up), CF-30 (suspended
  list) and CF-31 (throttle and repeat semantics).

## P5-S3b: mock organization-admin role (implemented 2026-10-24)

**Status: complete (PR #28), a development-only mock prototype.** Design:
[`design/p5-s3-revocation-and-admin-role.md`](design/p5-s3-revocation-and-admin-role.md).

- "Make organization admin…" and "Remove admin role…" for the Company owner only, from each Active row's "Actions" menu
  (with "Revoke membership…") and the "Manage membership" card; operators never see a role control (Core gives them
  the collapsed `404`) and keep the direct "Revoke…".
- The owner's factor step-up of the direction's purpose (`organization.admin.grant` / `.revoke`: TOTP or passkey, never
  the secret key), checked before and spent only when the change commits; a `404` (not active, already in that role,
  gone, no authority) leaves it unspent. A refused code stays in verification.
- `setOrganizationAdmin` command: owner authority inside the command; only `isOrganizationAdmin` flips; status,
  audience, counts and every other table unchanged; `organization.admin.granted` / `.revoked` activity (no contact).
- Grant warns about an unverified contact; removing the last listed admin warns; neither is blocked (no such Core
  rule). One membership action at a time; never resent; reload and reconcile the role after a `404` or a lost answer.
- Residual Core risks: CF-26/CF-27 (no step-up on revoke, which also removes the role), grant without contact check.

## P5-S3a: mock membership revocation (design approved 2026-10-24; implemented 2026-10-24)

**Status: complete (PR #27), a development-only mock prototype.** Design and contract:
[`design/p5-s3-revocation-and-admin-role.md`](design/p5-s3-revocation-and-admin-role.md) (seven owner decisions approved).

- "Revoke…" on Active rows and a "Manage membership" card on an active membership's details, for the Company owner and
  operators assigned to the Platform, an organization admin's membership included (Core allows it; the confirmation
  says the administrative authority goes too, and for an operator that only the owner grants it again).
- `revokeMembership` command in Core's order: collapsed `404` (unknown, another Organization's, no authority, one's own),
  `409 membership_not_active` (pending, rejected, revoked, a repeat); one record changes (`revoked`, admin flag
  cleared); `membership.revoked` activity. No step-up, no idempotency key.
- One membership action at a time across decisions and revocation (`MembershipActionLock`). Never resent: after a lost
  answer, a `409` or a `404` the lists reload and the dialog says what they show; a membership gone from Active "may have
  been revoked", never proven (revoked is not listable). From the details page, success returns to the list.
- Security follow-up **CF-27**: assigned operators can revoke organization admins without step-up (Core behaviour).
- Not built: the admin role (P5-S3b), restoration, suspension, join codes.

## P5-S2: mock membership request decisions (design approved and implemented 2026-10-23)

**Status: complete (PR #26), a development-only mock prototype.** Design and contract:
[`design/p5-s2-membership-decisions.md`](design/p5-s2-membership-decisions.md) (canvas corrected by the owner's Nawara
School onboarding clarification).

- Approve and Reject on pending requests (Requests tab rows and the membership's details), for the Company owner and
  operators assigned to the Platform; a confirmation each (Reject: alertdialog, focus on Cancel); no step-up.
- `decideMembership` command in Core's order: collapsed `404` (unknown, another Organization's, no authority, one's own
  membership), `409 membership_already_decided`, `409 contact_not_verified` when Core requires it; exactly one record
  changes; `membership.approved` / `membership.rejected` activity.
- One decision at a time; never resent after a lost answer: the lists reload and the dialog shows where the request is
  now; "Try again" only after `429`/`503`. Success refreshes every view through `ScopeContext.revision`.
- Demo data: School requests are `teacher` (student codes need no approval), `parent` removed, Drive unchanged; every
  count unchanged. "Approved" dates relabelled "Active since" (`approvedAt` semantics for automatic admission unverified).
- Not built: revoke, the admin role, suspend / restore, join codes, a Company directory.

## P5-S1: read-only Organization members and membership details (contract verified and implemented 2026-10-23)

**Status: complete (PR #25), a development-only mock prototype.** Design and contract:
[`design/p5-users-and-memberships.md`](design/p5-users-and-memberships.md) (P5-0 canvas corrected by the P5-S0 read-only
Core verification, `b91b7bf`). Owner decisions D1 Company-wide Users & identity unavailable until CF-03; D2 tabs Active,
Requests, Rejected (no Revoked); D3 email, else phone, else a neutral reference, never a name; D4 owners and assigned
operators read; D5 a nested detail route resolved from the lists; D6 synthetic records with derived counts.

- Routes `/platforms/:platformId/organizations/:organizationId/members[/:membershipId]`; "View members" on the
  Organization's details; breadcrumbs name the Organization, never a member.
- `MembershipGateway.list(organizationId, status)` (Core's list, always with `status`); the three listable statuses load
  together; tabs with counts, local search (never in the URL), admins filter and sort in the URL, table / cards.
- DemoWorld holds synthetic people and memberships; every membership and request figure (dashboards, directory, details)
  is now derived from records, unchanged (School 920 / 12, Drive 460 / 4).
- Shell fixes found in browser acceptance: focus moves to `main` only when the page changes, not on a query-only
  change (a tab, filter or sort kept losing keyboard focus, the P3a directory filters included); the top bar keeps the
  Platform switcher whole on deep trails, the search field gives way first, then the earliest crumbs truncate (the
  current page never does). Owner review point: at 1280 px an eight-level trail shows Company / Platforms / … as initials.
- Not built: approve / reject, revoke, the admin role, suspend / restore, join codes, a Company directory. Core follow-ups
  CF-23 (contact minimization), CF-24 (revoked list, detail read), CF-25 (pagination), CF-26 (no step-up on decisions).

## P3b-S3: mock Organization admin invitations (contract verified and implemented 2026-10-23)

**Status: complete (PR #24), a development-only mock prototype.** Design and contract:
[`design/p3b-s3-admin-invitations.md`](design/p3b-s3-admin-invitations.md) (durable copy of the six-artboard canvas,
corrected by the P3b-S3-0 read-only Core verification). Owner decisions D-A free-text type validated to Core's pattern,
D-B Core-format demo codes, D-C Revoke on active only (the model still revokes expired ones), D-D "You" only when certain,
D-E 1 h / 24 h / 3 days / 7 days.

- **Card** on the Organization details, owner only (operators get no card, no records, no request): status in words,
  type, binding indicator (never the contact), creation date and creator, the status date, Revoke on active rows.
- **Create**: type, duration, optional binding → simulated step-up `admin_invitation.create` → the code once (read-only LTR
  field, copy with manual fallback, close guarded until copied). Never retried; a lost answer labels possible matches.
- **Revoke**: destructive confirmation → step-up `admin_invitation.revoke` → `204`; `404` is the tenant-safe refusal.
- **Counts** everywhere are active-only (7 in the seed, unchanged); `admin_invitation.sent` replaced by `.created`, and
  `.revoked` added (simulated activity).
- **Not built:** organization-admin sign-in, redemption, delivery, membership or admin-rights changes, an HTTP adapter,
  the passkey path in the dialogs.

## P3b-S2: mock Edit organization details (design approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #23).** Design: the "P3b-S2 Edit Organization"
canvas (claude.ai, private; six artboards). Contract: [`CORE-INTEGRATION.md`](CORE-INTEGRATION.md) §5. Owner decisions:
D1 owners and assigned operators edit; D2 a simulated `organization.updated` activity, only on a real change; D3 `updatedAt`
on the demo record and the response, no new UI row; D4 all five fields shown; D5 change marks, previous values and Undo;
D6 an in-dialog discard confirmation; D7 "Edit details" only in the About card.

- **Flow** (`EditOrganizationAction`, bound with "Create organization" by `organizationActionProviders`): "Edit details" →
  the dialog, prefilled; each changed field says "Changed" / "Will be removed" and its previous value (in the hint, not only
  by colour), with Undo on a removed optional field; Save is disabled until something really changes (trimmed comparison);
  only the changed fields are sent, `null` for a cleared one. No step-up. Success: `ScopeContext.organizationsChanged()`;
  the detail refreshes in place (header, About, breadcrumb), focus returns to "Edit details", a toast confirms.
- **Unsaved changes:** with changes, Escape, the backdrop, the close button and Cancel show "Discard your changes?"
  (`nw-dialog` `guarded`); any in-app navigation away from the Organization closes the dialog; reloading or closing the
  tab asks the browser's confirmation (`beforeunload`). **Limitation:** browser Back/Forward closes the dialog (CDK
  `closeOnNavigation`) and discards unsaved changes; no route guard was added. A save under way is never cancelled: it
  detaches and reports by toast.
- **Lost answer:** never resent automatically (no key, no version). The dialog says the result is unknown and offers
  "Check current details": it reloads the Organization; fields the person did not change take the current values, their own
  changes stay marked against them (`rebaseDraft`); they save again only if still needed.
- **Mock:** session, body (`400`: empty, unknown or immutable fields, cleared or blank name, empty strings, limits), the
  Organization (`404 not_found`), authority (`403 admin_forbidden`), then the write gate; a patch equal to the current values
  is a no-op (same world, no `updatedAt` change, no activity). Scenarios `notAuthoritative`, `outcomeUnknown` (applied,
  first answer per Organization lost), `unavailable`.
- **Detail page refresh:** `keyedLoad` refreshes in place on `revision` for the same key (no loading flash); an explicit
  "Try again" still shows loading.
- **Not built:** an HTTP adapter, concurrency control, organization-admin editing, lifecycle, invitations, memberships.

## P3b-S1: mock Create organization (owner-authorized 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #22).** Design: the "P3b" canvas (claude.ai, private;
six artboards). Contract: source-verified in P3b-0 ([`CORE-INTEGRATION.md`](CORE-INTEGRATION.md) §5). Owner decisions: the
name plus Core's four optional fields (`taxCode`, `address`, `phone`, `type`) under "More details"; P3b-S2 metadata editing and
P3b-S3 admin invitations follow as separate slices; suspend, restore, archive, provisioning, readiness and activation stay out.

- **Flow** (`CreateOrganizationAction`, bound on the Organization routes by `organizationActionProviders`, formerly `createOrganizationProviders`): "Create
  organization" in the directory header and its empty state → the dialog (parent Platform shown, never typed; name 1–200;
  "More details" disclosure with the optional fields, blank → `null`, Core's limits checked trimmed) → the simulated owner
  step-up for `organization.create` → the idempotent command. Success: `ScopeContext.organizationsChanged()` reloads the
  directory, the Platform dashboard, the Platform directory and the Company Overview; with the dialog still open the person is
  taken to the new Organization's details, and a toast names it either way.
- **Who:** the owner. An assigned operator sees the action disabled: "Creating an organization needs a verified action.
  Operators can't verify actions yet." (Core authorizes operators, but none can obtain the step-up: CF-08.) Production builds
  show it disabled as not available in this build.
- **Mock** (`MockOrganizationCommandGateway`, Core's order: key → body → Platform → authority → step-up → write gate → replay):
  succeeds by default; scenarios `notAuthoritative` (409), `outcomeUnknown` (applied, first answer lost; a retry with the same
  key and a fresh step-up replays it), `unavailable` (503). `401` without a session.
- **Demo record:** one Organization in the selected Platform with its metadata, 0 memberships and requests, assisted payments
  inherited; no subscription, payment, invitation, membership, status or provisioning state; a `organization.created` activity
  record, marked "simulated" in demo builds. About in the details lists the optional fields that were given.
- **Not built:** an HTTP adapter (production Organization writes stay unavailable), editing, invitations, lifecycle, membership
  actions, the passkey and secret-key step-up paths (TOTP code only), a "New" badge in the directory.

## P4-S1: administrative action foundation and mock Create platform (design approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #21).** Design: the "P4 Administrative Action States"
canvas (claude.ai, private; 10 artboards). Owner decisions: O-P4-1 Create platform is the pilot; O-P4-2 the mock succeeds by
default, Core's documented `409 not_authoritative` is a scenario; O-P4-3 the three risk tiers are vocabulary, only what is
needed is built; O-P4-4 the dialog's busy lock and stacked mobile actions.

- **Foundation** (ARCHITECTURE §12, "Implementation"): `ActionRun`, `ActionFailure`, `StepUpGateway` (mock and unavailable),
  `nw-dialog` busy and stacking, `DemoWorld.commit` with domain-owned commands.
- **Create platform** (owner only): the same flow from the Platform directory and the Company Overview
  (`CreatePlatformAction`, the Platforms feature's public facade, bound per route by `createPlatformProviders`). Name 1–200
  (trimmed; whether Core trims is not known), then the simulated owner step-up for `platform.create`, then the idempotent
  command. Success: `ScopeContext.hierarchyChanged()` reloads the scope directory, the Platform directory and the Overview, so
  the new Platform shows in the switcher, the directory, the Overview counts and its own (empty) dashboard; a toast names it.
- **Demo record:** a new Platform has no slug, product, Organization, assignment, commercial or lifecycle record; its id comes
  from the world's sequence; a `platform.created` activity record is appended. It lives until a reload, survives a sign-out.
- **Not built:** destructive or irreversible actions, operator, refund or recovery step-up, the passkey step-up path (TOTP
  code only), an HTTP adapter, real provisioning. Core's response DTO is not verified.

## P3a: Organization directory and read-only details (design approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #20).** Design: the "P3a Organization Directory &
Details" canvas (claude.ai, private; 9 artboards). Read only: no lifecycle, membership, invitation, policy or payment action.

- **Routes** (platform scope, no third scope, no root Organization context; ARCHITECTURE §6, §7 amendment):
  `/platforms/:platformId/organizations` and `/platforms/:platformId/organizations/:organizationId`. The Platform dashboard's
  "All organizations" and its newest Organizations link to them; breadcrumbs continue "› Organizations › {name}".
- **Architecture:** page → `OrganizationDirectoryFacade` / `OrganizationDetailFacade` → `OrganizationGateway` (hierarchy) and
  `OrganizationCommercialGateway` (owner: Billing, Payment, the Platform policy) → mock (demo world) or unavailable adapters.
  The Platform-access gate is shared with the dashboard (`core/context/platform-access.ts`, behaviour unchanged).
- **Who sees what** (UX; Core is the authority): everyone who may enter the Platform sees names, creation dates, memberships and
  pending requests; the owner also sees each subscription (with "ends in N days" within 14 days, O3, and the grace end), the
  effective assisted-payments policy and its source, payment issues, admin invitations and activity. An operator's commercial
  facts are never requested.
- **Directory:** search by name (case- and accent-insensitive), "With requests", the owner's subscription filter (O2: a
  PROVISIONAL, client-side mock capability over the loaded mock facts), sort by newest, oldest, name, memberships, requests; all
  in the URL's query parameters. A table on a wide card, link cards below 40rem; loading, empty, no results, partial (owner columns
  "—"), outage with retry, not accessible.
- **Detail:** identity and parent Platform, figures, membership, About (id in mono LTR), and for the owner activity, subscription,
  payments and assisted payments, each failing on its own. Future actions ("Review requests", "Change policy") are focusable,
  disabled and say "Not available yet". No lifecycle status is shown (Core defines none, CF-09).
- **Sidebar:** unchanged; the company-wide "Organizations" item stays unavailable (O1).
- **Open:** the Organization detail DTO of Core's `GET /auth/admin/organizations/:id` is not verified (no HTTP adapter); the list is
  CF-02; commercial reads are Core V2 A10/A11; the subscription filter cannot move to Core as is (it crosses Billing).

## P2.5: Canonical Demo World (architecture approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock foundation (PR #19).** No UI redesign, no production capability, no
Core contract. Production builds contain none of it.

- **What:** `src/app/demo/world/` holds the canonical records (`records.ts`), a deterministic seed from the injected clock
  (`seed.ts`), the root signal-based `DemoWorld` (`demo-world.ts`, read only in P2.5) and pure selectors (`selectors.ts`).
  The scope-directory, auth, notification, Company Overview, Platform directory and Platform dashboard mocks read it at
  request time and map to their own feature models; Page → Facade → Gateway → Mock/Unavailable adapter is unchanged, as
  are the public gateway contracts and the demo scenarios. No state library.
- **Auth (D1, D2, D4):** `DemoAuthState` keeps the session and the sign-in workflow; the session stores the account's
  `businessIdentityId`, and grants and Platform access are derived from the world's assignment records on each read. A
  sign-out clears the session only. The owner, enrollment and recovery accounts all act as the ONE Company owner, each with
  its own credentials and user id, so every scenario stays independent. Operators who can reach the workspace (single,
  multi, phone, unassigned, new) are the canonical staff; scenario-only accounts (rate-limited, offline, unconfirmable),
  which never complete a sign-in, hold no identity and no assignment. Logins and access are unchanged.
- **Derived values (before → after):** Organizations 24 (16 + 8) and memberships 920 + 460: unchanged, now derived.
  Assignments 5 (3 + 2), 4 unique operators, 2 Platforms: unchanged, now from assignment records (the auth fixtures' 10
  assignments are gone). Unique identities 1,284 → unavailable (D3: no person records before P5; memberships are not
  identities). Admin invitations 7: unchanged, from records. Active subscriptions 38 → 20 (13 + 7), with 1 in grace; expiring
  within 14 days 3 → 4, from each subscription's `endsAt` and the clock (D5). Payment issues 2: from records. Growth
  16 → 24 (+8) → 21 → 24 (+3) over the last 30 days, from creation dates at UTC day boundaries (D8). Company activity: the
  newest 4 of the Platforms' 7 events, newest first; "License renewed" removed, "Membership approved" added (D6). "Access
  assignments to review" (2) removed with its status line, without a replacement (D7). Owner unread 4: from the world.
- **Boundary (D9):** ESLint forbids `*.mock`, `*.mock-state`, `*.fixtures` and `demo/` imports outside demo modules,
  specs and `testing/` helpers; `check:production` searches the bundle for world markers.
- **Not in scope:** Organization or membership changes, user directories, new Billing/Payment gateways, settlement,
  refunds, an action pipeline, HTTP integration. Personal Premium and unread counts remain declared counts until person
  and inbox records exist.

## P2: Platform dashboard (design approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #18).** Design: the "P2 Platform Dashboard" canvas
(claude.ai, private; 6 artboards). Replaces the platform-scope placeholder at `/platforms/:platformId`. Read only.

- **Who sees what** (UX; Core is the authority): the owner of the Company sees identity, figures (organizations,
  memberships, membership requests, operator assignments), the five newest Organizations with their subscription state,
  "Needs attention" (requests, admin invitations, Organizations in their 24-hour grace, payment issues), subscriptions with
  Personal Premium and payment issues, the read-only assisted-payments policy and recent activity. An operator assigned to
  the Platform sees identity, three figures, the Organizations without subscription state, and membership requests only:
  no commercial, audit or policy section (no confirmed read authority; owner-only capabilities `platform.commercial.view`,
  `platform.activity.view`, `platform.access.view`, mirrors of documented Core rules).
- **Architecture:** page → `PlatformDashboardFacade` → `PlatformDashboardGateway` (hierarchy) and `PlatformCommercialGateway`
  (Billing/Payment), mock and unavailable adapters bound by the route. The Platform comes from the URL; both loads take it
  explicitly, switch with `switchMap`, and an answer for another Platform is never shown. The facade asks nothing for a
  Platform the actor cannot enter and never asks an operator's commercial facts.
- **States:** checking; Platforms could not be listed (an outage, "Try again" reloads the scope directory; never shown as an
  access refusal); not found or not accessible (unknown, unassigned, or Core's late `404`/`403`); loading; error with "Try
  again"; a section unavailable ("—", never zero); a Platform without Organizations; not available in a production build.
- **Mock data:** 24 fictional Organization records with stable ids (since P2.5 in the demo world, `src/app/demo/world/`),
  from which the `/platforms` directory and the dashboard derive every count (16 + 8 Organizations, 920 + 460 memberships),
  so they agree by construction. Organization subscriptions (one per Organization, adding up to
  the Organizations), Personal Premium and payment issues are separate facts, never summed.
- **Shared, unchanged:** `overview-card`, `summary-card`, `metric-value`, `card-link` and `Metric`/`Section` moved from the
  Company Overview to `shared/dashboard/` (Admin-local); appearance and behaviour unchanged (`common.notAvailable` replaces
  the feature key with the same text). `ScopeContext.reload()` added for the directory retry.

**Follow-up FU-P25-OVERVIEW-FIXTURES (closed by P2.5, 2026-10-23; cross-feature consistency verified by
`src/app/demo/world/consistency.spec.ts`):** the Company Overview's hand-written figures are not derived
from records and disagree with them: its commercial summary counts 38 Organizations with a valid entitlement while the
Company has 24 Organizations (one subscription per Organization), and the auth operator fixtures hold 10 Platform
assignments for 9 operators where the overview and directory say 5 assignments for 4 operators. P2 does not reuse these
figures; P2.5 derives them from the Demo World.

## A3-S3: account menu, mock sign-out and operator-aware navigation (design approved 2026-10-23; implemented 2026-10-23)

**Status: complete as a development-only mock prototype (PR #17).** Design: the "A3-S3 Account Menu &
Navigation" canvas (claude.ai, private; 8 artboards). Not production authentication: production builds keep sign-in
unavailable and contain no mock, fixture or demo state.

- **Account menu** (`layout/account-menu/`), opened by two triggers: the sidebar profile card (desktop sidebar and the
  phone/tablet drawer) and the top-bar avatar (from the tablet breakpoint). Both are named "Account: {name}, {role}". The
  menu holds a decorative identity header (display name, else email, else phone; the identifier is a LTR machine value),
  Appearance (`/settings/appearance`) and Sign out. CDK Menu keyboard model (arrows, Escape back to the trigger).
- **One sign-out** (`core/auth/sign-out.ts`), provided by the shell and the sign-in routes; the no-access page's sign-out
  delegates to it. Core logout best effort, then the local session ends, then `/login?reason=signed-out` ("You have signed
  out."). One run at a time: a second request while running is ignored. Busy: the triggers are `aria-busy`/`aria-disabled`,
  the card says "Signing out…", a polite status in the top bar announces it.
- **One simulated Auth service** (`core/auth/auth.mock-state.ts`, `DemoAuthState`, root-provided, demo only): every
  route-scoped `MockAuthGateway` (sign-in pages, shell) works on it, so a sign-out from the shell ends the session the
  sign-in pages opened. Core records it keeps (enrolled owners, confirmed contacts, live codes) survive a sign-out until a
  reload, as Core's do. Not the demo world (P2.5), which holds the business records.
- **Session-scoped views reset on identity change:** the unread count (`NotificationIndicator`) is keyed on the signed-in
  actor and dropped on sign-out; the demo notification summary answers per signed-in identity (owner 4, operator none, so no
  badge or bell for an operator). `ScopeContext` was already actor-keyed.
- **Operator-aware navigation:** capability `company.scope` (owner only) on every company-scope sidebar entry, so an
  operator no longer sees them; an operator gets "Your platforms", their assigned Platforms as links (loading placeholder,
  "Platforms unavailable" on error without retry, hidden when empty). Routes and guards unchanged; hiding is UX only.
- **Overlays:** verified in the browser that CDK 22 opens menus in a `popover="manual"` element in the browser's top layer,
  so the menu renders above the drawer whatever its z-index: the conditionally approved global overlay z-index change was
  **not needed and not made**. Escape closes only the topmost layer: the shell's drawer ignores an Escape the menu already
  handled (`defaultPrevented`); focus returns to the trigger, then to the menu button when the drawer closes.

Open, carried forward: refresh, logout broadcast across tabs and the session strategy (D-A4), `/account/security`,
recovery. FU-A3-OVERVIEW-FR-320 stays separate.

## A4-S4: owner first-factor enrollment, TOTP (design accepted 2026-10-06; mock implemented 2026-10-07)

**Status: A4-S4 implemented mock prototype — awaiting review.** Development-only (mock adapter, no HTTP adapter); not
production authentication: production builds keep authentication unavailable and exclude the demo fixtures. A4 stays open, and
CF-21 and CF-22 (`docs/CORE-INTEGRATION.md` §9) stay unresolved; until Core answers them, Admin follows the source.

Core contract, read in source at `nawara-core` `origin/main` `1ad43d2` for the design; `owner/enrollment.service.ts` and
`owner/challenge.service.ts` re-read 2026-10-07 at `4ffcb0d` (unchanged):

- Sign-in answers `enrollment_required` with an `enrollmentToken`. `POST /auth/admin/enroll/totp {enrollmentToken}` →
  `{factorId, secret, otpauthUri}`; `POST /auth/admin/enroll/totp/confirm {enrollmentToken, factorId, code}` → the first session,
  with no further MFA (CF-22). Both resolve the token first, then hit the `factor_enroll_owner` throttle (`429 rate_limited`, no
  retry time); see the order below.
- Errors: `400 verification_failed` (wrong code, or a factor that is not the one begun); `401 verification_failed` (token unknown,
  expired, used or out of attempts; stale bootstrap token); `403 factor_already_enrolled`.
- Attempts (`MAX_CHALLENGE_ATTEMPTS` = 5): each refused confirmation is counted outside the transaction. The **fifth** refusal
  still answers its own `400` and consumes the token; every later begin or confirm with it is `401`. A throttle `429` is answered
  before anything is counted.
- Order of answers (verified read-only 2026-10-23 at `nawara-core` `origin/main` `de8323d`; `owner.controller.ts`,
  `enrollment.service.ts`, `challenge.service.ts` and `throttle/` unchanged since `4ffcb0d`): the controller resolves the token
  (`fromToken`) before the service hits the throttle, which is keyed by the owner the token names. So a dead token is `401`
  and an owner with a confirmed factor is `403`, both **before** any `429`; only a live token can be rate limited. The mock
  answers in this order (an earlier review note that the mock should answer `429` first was wrong).

Implementation (2026-10-07):

- `/login/enroll` (guest only), reached only from sign-in's `enrollment_required`. All approved frames (01–15): preparing, setup
  (QR, setup key with copy, code field), confirming, wrong code, rate limited, unavailable (Try again keeps the same setup), setup
  needs to restart (401), already set up (403), no setup on this page (reload, typed URL), success straight into the existing
  access check with an announced "Authenticator set up". One addition after review: a `429` while beginning is its own "Too many
  setup attempts" card (no countdown, no automatic retry, manual Try again), never "unavailable".
- The token, `secret` and `otpauthUri` live in the auth-flow facade's memory only and are dropped on leaving the page.
- QR: `uqr` **0.1.3** (pinned exactly, MIT, no dependencies; owner-approved), drawn as an SVG path in the lazy route chunk only.
  Dark-on-white in every theme through Admin's `--nw-qr-background` / `--nw-qr-module` (aliases of foundation values). 10rem below
  the tablet breakpoint, 11.5rem from it. An independent decoder (jsQR) read the exact fictional `otpauth` URI from the rendered
  page at 1440 px and 320 px, light and dark.
- `AuthGateway.beginTotpEnrollment` / `confirmTotpEnrollment`; non-demo builds use the unavailable gateway. The mock follows the
  contract above, including the five-attempt boundary. Its rate limits and outages are **simulated by scenario only**. It issues
  one FICTIONAL setup key and computes no TOTP: codes from an authenticator app will not work; the demo code is `123456`. The
  development-only demo note says so.

Open, carried forward: the HTTP adapter (with A4's request/response verification, CF-15), CF-21, CF-22, production
`CHALLENGE_TTL_SEC` and the TOTP issuer label (`cfg.totp.issuer`), passkey enrollment, secret-key issuance after enrollment
(step-up), and the recovery-origin restart variant.

**Follow-up FU-DEMO-I18N (open; separately authorized task, not part of A4-S4):** the translation catalogs are compiled into the
production bundle, so every demo-only `auth.demo.*` string is present in production chunks although the demo note never renders
there: the demo account roles, the simulated-passkey texts and the demo-note labels from A4-S1 to A4-S3, **and the six added by
A4-S4** (`auth.demo.enrollmentAlready`, `enrollmentConfirmLimited`, `enrollmentConfirmUnavailable`, `enrollmentBeginUnavailable`,
`enrollmentBeginLimited`, `enrollmentQr`), in en, fr and ar. They are labels of fictional scenarios, with no account, password or
code. A4-S4's explanation of the fictional setup key (which names the demo code) comes with the lazily loaded demo bindings
instead and is absent from production. Moving all demo strings out of the catalogs (for example into the demo bindings) is the
follow-up; A4-S4 does not restructure localization.

## A4-S3: operator contact confirmation (discovery 2026-10-05; design approved and mock implemented 2026-10-06)

**Status: complete as a development-only mock prototype (mock adapter, no HTTP adapter), approved by the owner 2026-10-06.
Not production authentication: production builds keep authentication unavailable and exclude the demo fixtures.** An operator created by the owner
must confirm their contact (email or phone) with a confirmation code before Core issues them any working code.

Core contract, verified in source at `nawara-core` `origin/main` `763e1a8` (Auth, `apps/auth-service/src/operator/`). Re-checked
2026-10-06 at `272ab8d`: `apps/auth-service/src/operator/` and `src/config/` are unchanged between the two revisions, and the
confirm route, `confirm()` and the throttle buckets were re-read there; the line citations below hold at both:

- `POST /auth/admin/operators/confirm` (public; `operator.controller.ts:47`), body `{ email | phone, code }` with the same
  identifier rules as the working code. `204`: the contact is confirmed; an operator already confirmed also gets `204`, without the
  code being checked (`operator-code.service.ts:176`). Every refusal (wrong, expired, killed after 5 attempts, unknown, blocked) is
  one generic `401 operator_code_invalid` (`:184`). Rate limits: `operator_confirm_ip` (30 per 15 min) and the per-identifier
  bucket it shares with working-code verification (10 per 15 min; `app-config.ts:377`, `:381`), not reset by a confirmation.
  Working-code verification hits the same `operator_verify_identifier` bucket and resets it only on success
  (`operator-code.service.ts:147`, `:163`), so confirmation attempts and working-code attempts count against one limit.
- The confirmation code is issued **only** when the owner creates the operator (`operator-admin.service.ts:31`), lifetime
  `OPERATOR_CONFIRMATION_TTL_SEC` (default 8 h; `app-config.ts:359`). There is **no** route to resend or reissue it (CF-16).
  Blocking cancels it (`operator-admin.service.ts:51`); unblocking issues none.
- A successful confirmation only records the contact as confirmed (`operator-code.service.ts:169`–`184`): **no working code is
  sent**; the operator then requests one (A4-S2). Core's ADR-0015, SDD and ADD describe an automatic first code and an
  `admin.operator_contact_confirmed` event that the source does not implement (CF-17). Delivery is by Notification
  (`identity.operator_confirmation_code`); production delivery and the message language are unverified.

Design proposal (2026-10-06): the "A4-S3 Operator Contact Confirmation" design canvas,
https://claude.ai/artifact/SLEDfjwHBoqNsmz4Rjk9a1 (private until shared): 10 screen frames and the shared component, built on
the accepted A4-S2 sign-in component. Local copy and screenshots: `screenshot/a4-s3-canvas-2026-10-06/` (not in git). The entry
point is a "First time signing in? Confirm your contact" link on the working-code request page. French copy is on the canvas, and
two French frames (desktop and 320 px) check the wrapping of the longest copy.

Design rules for the proposal (owner direction, 2026-10-06):

- Separate from working-code sign-in and from owner MFA; it never authenticates and opens no session.
- Fields: email address or phone number, and the 6-digit confirmation code (a string; leading zeroes kept).
- States: idle, pending (one request at a time), generic failure, rate limited (field stays editable, no countdown), unavailable
  (Try again), success. Success says the contact is confirmed and leads to **requesting a working code**; it never claims a code
  was sent.
- No resend, no countdown, no claim of automatic delivery. Help copy: "If your confirmation code no longer works, contact your
  company owner for assistance." It names no resend screen and implies no owner reissue capability (none exists: CF-16).
- Accepted sign-in layout, palettes, light/dark, EN/FR/AR, RTL and responsive behaviour, as in A4-S2.

Design approval (owner, 2026-10-06): the corrected local review copy `screenshot/a4-s3-review-20261006-114027/` (12 frames, not in
git), with one adjustment: on the sign-in brand panel the "nawara" word is `2rem` (the "SOLUTIONS" line keeps the panel size).

Implementation (2026-10-06, development-only mock, owner-approved 2026-10-06):

- `/login/confirm` (guest only), reached from "First time signing in? Confirm your contact" on `/login/code`. Fields: identifier
  (same browser check as the working code) and the 6-digit code as a string; both `dir="ltr"`, no autofocus. States: pending (one
  request at a time, fields read-only), generic failure, rate limited (fields editable, no countdown), unavailable (Try again),
  success. Success shows "Request a working code", a link to `/login/code` with the identifier kept and a safe requested page kept;
  it opens no session, runs no access check and requests nothing.
- `AuthGateway.confirmOperatorContact`; non-demo builds use the unavailable gateway. The mock adapter follows Core's answers (204
  for a right code or an already confirmed contact; one generic 401 otherwise; a code dies after 5 wrong guesses; no working code
  until confirmed). Its rate limits are **simulated by scenario only**: it does not reproduce Core's shared
  `operator_verify_identifier` bucket. Fictional new operators and the demo confirmation code exist in development builds only.
- Logo: `nw-brand-mark` gained an optional `--nw-brand-mark-word-size` (unset: unchanged); the sign-in brand panel sets it to
  `2rem`. Sidebar, phone header and other logos keep their sizes.
- Brand fixes approved with the slice (owner, 2026-10-06):
  - **Favicon** follows the accent palette **and** the resolved appearance (light, dark, and System live): the ink-circle bloom in
    dark, the approved light flower on a paper circle in light (`public/icons/favicon-<palette>-light.svg`, generated by
    `tools/brand/recolor_artwork.py`). One icon link, chosen before first paint (`src/index.html`) and replaced by `ThemeService`
    on every change; each palette and appearance has its own URL, so no stale cached icon.
  - **Sidebar logo:** the horizontal "nawara | SOLUTIONS" lockup (no "ADMIN" label), `nw-brand-mark`'s new `inline` option:
    the approved wordmark and bloom, a thin separator, and "SOLUTIONS" in the palette gradient, semibold, its capitals about
    the height of the lowercase (measured ≈ 92 %), optically centred. Desktop sidebar and phone drawer, RTL keeps the logo's
    order; fits the 320 px drawer beside the close button. Sign-in logos unchanged.
  - **Sign-in headline:** each locale sets its own line breaks in `auth.brand.tagline` (English "Smart / solutions / powered by
    AI."), shown with `white-space: pre-line` and aligned with the eyebrow and supporting line; the phone footer shows it on one
    line.
- Browser evidence: `screenshot/a4-s3-implementation-20261006-120227/`, `screenshot/favicon-sidebar-20261006-150411/`,
  `screenshot/sidebar-inline-logo-20261006-154406/`, `screenshot/auth-headline-20261006-154938/` (not in git).

Open: CF-16 (reissue: none exists), CF-17 (Core documentation versus source), CF-18 (owner visibility of confirmation status),
CF-19 (production delivery, unverified), CF-20 (code-message locale), the session strategy (D-A4) for the real integration.

## A4-S2: operator working-code sign-in, demo adapter (owner-authorized 2026-10-04; approved 2026-10-05)

**Status (owner review, 2026-10-05): complete as a development-only mock-prototype slice.** Not production authentication:
real integration (HTTP adapter) and the dependencies below remain open. Design: the A4-S2 canvas
(local copy and screenshots under `screenshot/a4-s2-canvas-2026-10-04/`, not in git). Core contract: inventoried read-only
from `auth-service` (`operator.controller.ts`, `operator-code.service.ts`); no Core change, no HTTP adapter.

- `/login/code` (request) and `/login/code/verify` (verify); the sign-in page's "Sign in with a working code" is now a
  link (the requested page is kept). Recovery stays unavailable with its tooltip. Separate from the owner's TOTP/passkey.
- Identifier: email or phone, checked in the browser by Core's own normalization (`core/auth/operator-identifier.ts`).
  Neutral acknowledgement after the 204; one generic `operator_code_invalid` state; no expiry timer, no resend cooldown;
  the code is a string (leading zeroes kept); no autofocus; rate-limited fields stay editable; one pending request at a
  time.
- After a code is accepted, the existing access check (`/auth/me` + `/auth/grants`), landing, platform choice and
  return-URL rules decide; the method decides nothing. `Identity`/`Actor` email is nullable with an optional phone
  (phone-only operators); the shell names them by phone.
- Operator scope in the shell: `ScopeContext.platforms` (assigned Platforms for an operator); an actor-aware home
  (`core/access/home-path.ts`: one Platform → it, several → the platform choice, none → access denied, never the owner
  overview); no Company option, overview link or "Company" crumb for an operator ("Your platforms").
- Identity model: `Identity` mirrors Core's `/auth/me` (`email` and `phone` always present, each nullable); `Actor` keeps
  `email: string | null` and has `phone` only when Core has one. Authentication can succeed while Admin still refuses
  workspace entry (no usable access → the no-access page, no workspace session).
- Fictional scenarios (demo builds only, listed on the sign-in pages): one platform, two platforms, phone only (`+999`),
  no assignment, request rate-limited, verify rate-limited, service unavailable. Working code `042917`.

Open (unchanged by this slice): Notification delivery in production (unverified, CF-19), platform display names for real
operators (CF-02), first-time operator contact confirmation (A4-S3), code-message locale (CF-20), browser reachability of
`/auth/admin/login/operator/*`, the session/refresh strategy (D-A4). Production sign-in stays unavailable.

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
| Operator single-Platform landing; operator return-URL rules | **yes, in A4-S2** (working-code mock) | landing + facade specs; A4-S2 browser journey |
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
packaging · offline support · product accent tokens · W3C design-token build pipeline (owned by `nawara-frontend` since its ADR-0003) ·
adoption of `@nawara-solutions/design-tokens` (pending a separately authorized task).

## Not to build yet

Any screen whose backend is 🔴 beyond a placeholder · permanent backend schemas for licenses, billing or monitoring · a BFF in M1 ·
an admin "god" API layer (forbidden by ADR-0041/0050) · a component library ahead of real screens · shared code inside Admin
tasks (a generic capability is a separate `nawara-frontend` contribution).

## Shared-frontend review points

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
        └── extraction only with owner approval, as separate `nawara-frontend` tasks (its SHARED-CONTRIBUTION-POLICY);
            Admin adopts each package afterwards in its own branch, validation and PR

FK-3  before A15: confirm no Admin-specific code leaked into CANDIDATE folders
```

`nawara-frontend` exists (2026-10-05). Verified 2026-10-06 at its `main` `87bf10a` (re-checked read-only after PR #13: remote
`main` unchanged): one package, `@nawara-solutions/design-tokens` 0.1.0, `private: true` and unpublished, consumed by no product;
no release, registry or publish workflow exists yet; ADR-0002 recommends GitHub Packages (`npm.pkg.github.com`), and until
publication a product can only consume a local tarball (its `docs/CONSUMPTION.md`). Its tokens and breakpoints match Admin's
names and values; Admin's palettes conform to its `accentControlled` customization point. **Adopted 2026-10-06** (0.1.0,
released to GitHub Packages, private): exact pin; installs with `NODE_AUTH_TOKEN` (developers), the job `GITHUB_TOKEN`
with `packages: read` (CI) and a BuildKit secret (Docker); `npm run check:tokens` (manifest-based collision check);
`src/styles/tokens/` is now Admin's extension only. Representative visual comparison against `main`: identical computed
tokens and pixels (8 scenarios; `screenshot/tokens-adoption-*`, not in git). Possible shared follow-up: a locale
customization point in the foundation (Admin's Arabic font and label tracking are applied as properties meanwhile). Shared shadows (DT2b) are deferred there;
Admin keeps its own. Updates to `nawara-frontend`'s own documents (its consumption status and its Admin extraction inventory, taken
before A4-S2) are `nawara-frontend` tasks, not Admin's.

### Shared-frontend register (maintained from A2)

| Item | Class | Notes |
|---|---|---|
| tokens, themes, typography, breakpoints | SHARED: `@nawara-solutions/design-tokens` 0.1.0 adopted 2026-10-06 (exact pin, `check:tokens`) | same names and values (verified 2026-10-06); Admin-only tokens, palettes, artwork and shadows stay LOCAL |
| `nw-*` primitives | CANDIDATE (from A2) | labels injected, never owned; 5 approved + 9 pending the scope decision (D-A2-7) |
| HTTP interceptors, `AppError`, Core error mapping | CANDIDATE (from A3) | Core contract is shared by all products |
| i18n/direction, preference registry, theme service | CANDIDATE (from A2) | delivered early: A2 needed them for themes and RTL |
| shell, navigation, organization switcher, features | LOCAL | Admin-specific |
