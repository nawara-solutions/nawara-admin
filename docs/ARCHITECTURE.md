# Nawara Admin — frontend architecture

- **Status:** A0 proposal for owner review. Becomes binding when the owner accepts it; amended deliberately, never by drift.
- **Scope:** how Nawara Admin is engineered. What Core offers is in [`CORE-INTEGRATION.md`](CORE-INTEGRATION.md); sequencing is in
  [`ROADMAP.md`](ROADMAP.md).
- **Principle:** *simple architecture with strong boundaries.* Every rule here prevents a known refactor; anything that does not is
  postponed.

---

## 0. Principles

1. **Core is the authority.** Admin presents and orchestrates; it never decides who may do what. Frontend authorization is UX.
2. **Components never know where data comes from.** Mock and HTTP adapters implement the same gateway.
3. **No retrofits.** Themes, languages, RTL, responsiveness and accessibility exist from the first component.
4. **Machine values drive behaviour, human text is presentation.** This applies to Core `code`s, enums and ids.
5. **No speculative abstraction.** Extract when a second real use appears. Obvious design-system primitives are the exception.
6. **Share-ready, not share-first.** Shared foundations are written product-independent so a move into `nawara-frontend`
   (`@nawara-solutions/*`, §31) is a move, not a rewrite.

## 1. Angular baseline

Decided by the owner (D-A1-1, D-A1-4) and established in A1 (versions verified at A1, 2026-10-01):

| Item | Established | Reason / evidence |
|---|---|---|
| Angular | **22.2.1** (`@angular/*`, CLI, build) | Nawara Drive's desktop app also uses Angular 22. One major across Nawara frontends is a precondition for a shared kit |
| TypeScript | **6.0.3** (`~6.0`, Angular 22's supported range) | |
| Builder | `@angular/build:application` (esbuild) | Angular default |
| Node / npm | Node **24.18.0**, npm **11.16.0** | Angular 22.2.1 declares `node: ^22.22.3 \|\| ^24.15.0 \|\| >=26.0.0`; the installed Node is inside it |
| Change detection | **zoneless** (`provideZonelessChangeDetection()` declared explicitly; `zone.js` not installed); **OnPush is Angular 22's default** strategy | modern default; predictable rendering |
| Components | **standalone** only; no NgModules | |
| Templates | built-in control flow (`@if`, `@for`, `@switch`, `@defer`) | |
| Reactivity | **Signals** for state and derived state; **RxJS** for HTTP, cancellation, debouncing, event streams | right tool per responsibility (§5) |
| DI | `inject()`; abstract classes as gateway tokens | no `InjectionToken` boilerplate for gateways |
| Unit runner | **Vitest 5** through `@angular/build:unit-test` (jsdom); specs are type-checked by the test build | Angular default |
| Lint / format | ESLint 10 + angular-eslint 22.5 (TS, template and template-accessibility presets); Prettier 3 | |
| Commits | commitlint 21 + Husky 9, through the shared `.husky/commit-msg` | Nawara `ai-standard` |

## 2. Source layout

Created **only as features begin** (no empty folders):

```text
src/
├── app/
│   ├── core/                     application-wide infrastructure (singletons, no UI)
│   │   ├── config/               typed runtime configuration
│   │   ├── http/                 interceptors: auth, language, request id, error normalization
│   │   ├── errors/               AppError model, Core error mapping, global ErrorHandler
│   │   ├── auth/                 session, token refresh, auth guard, step-up service
│   │   ├── access/               capability policy (UX authorization)
│   │   ├── context/              company/platform scope (URL), scope directory gateway, organization context
│   │   ├── state/                ViewState and the load → view-state helper
│   │   ├── i18n/                 locale, direction, formatting services
│   │   ├── theme/                theme preference and application
│   │   └── preferences/          the single registry of browser-stored preferences
│   ├── shared/                   reusable, product-independent UI (share-ready)
│   │   ├── ui/                   nw-button, nw-icon, nw-dialog, nw-form-field, nw-data-table, nw-data-state, …
│   │   └── format/               nwDate, nwDateTime, nwNumber, nwMachineValue pipes
│   ├── layout/                   shell, sidebar, top bar, breadcrumbs, scope switcher, status pages (Admin-specific)
│   ├── demo/                     demo composition root (mock adapters + demo owner); development builds only
│   └── features/
│       └── <domain>/
│           ├── data-access/      <domain>.gateway.ts · .http.ts · .mock.ts · .dto.ts · .mapper.ts · .fixtures.ts
│           ├── domain/           <domain>.model.ts (frontend domain types)
│           ├── application/      <domain>.facade.ts
│           ├── pages/            routed components (orchestrate)
│           ├── components/       focused presentational components
│           └── <domain>.routes.ts
└── styles/                       global SCSS foundation (§13)
```

**Dependency rules** (the `HttpClient` and forbidden-framework rules are lint-enforced since A1; the layer rules become lint rules when the folders appear in A3):

| From | May import | Must not import |
|---|---|---|
| `shared/` | `shared/`, Angular, CDK | `core/`, `layout/`, `features/` (keeps it extractable) |
| `core/` | `core/`, `shared/` | `features/`, `layout/` |
| `layout/` | `core/`, `shared/` | feature internals |
| `features/x` | `core/`, `shared/`, its own folders | another feature's internals (only its `*.routes.ts` / public facade) |
| components, pages | facades, models, `shared/` | gateways, adapters, `HttpClient` |
| `HttpClient` | only `*.http.ts` and `core/http` | everywhere else |

`core` is infrastructure. `shared` holds reusable UI primitives and formatting. Neither becomes a dumping ground. A file that fits
neither belongs to the feature that uses it.

## 3. Layers, gateways and adapters

```text
                         NAWARA ADMIN

┌──────────────────────────────────────────────────────────────┐
│  UI / ROUTES      pages orchestrate · components render        │
│  Responsive │ EN/FR/AR │ LTR/RTL │ Light/Dark/System │ a11y     │
└──────────────────────────────┬───────────────────────────────┘
                               │ signals, commands
┌──────────────────────────────▼───────────────────────────────┐
│  APPLICATION      facades: view state, orchestration, step-up  │
│  Auth │ Access │ Organizations │ Audit │ Releases │ Licenses …  │
└──────────────────────────────┬───────────────────────────────┘
                               │ domain models
┌──────────────────────────────▼───────────────────────────────┐
│  GATEWAYS         abstract class per domain (frontend contract)│
└───────────────┬──────────────────────────────┬───────────────┘
                │                              │
        Mock adapter                    HTTP adapter
     🟡 planned / 🔴 undefined          🟢 existing
     fixtures, latency, failures      DTO → mapper → model
                │                              │
                │                    core/http interceptors
                │                    (bearer · Accept-Language ·
                │                     x-request-id · errors)
                │                              │
                ▼                              ▼
         (no network)              Nawara Core V1 today
                                   Core V2 as it lands
```

- A **gateway** is an abstract class in `data-access/` that speaks **frontend domain models**, never DTOs. It is the frontend-facing
  contract and is owned by Admin.
- The **HTTP adapter** maps Core DTOs to models, uses Core's routes exactly, and is the only place a Core URL appears.
- The **mock adapter** implements the same gateway with typed fixtures. It simulates latency, empty results, `403`, `404`, `409`,
  `429`, `503` and validation failures, so every UI state can be exercised. Mocks live **only** in `*.mock.ts` / `*.fixtures.ts`.
- **Binding:** each feature's route `providers` bind its gateway to an adapter chosen from runtime config (`adapters.<domain>:
  'http' | 'mock'`). Mock adapters are loaded through dynamic `import()` so they stay out of the main bundle. **Production config
  refuses `mock`.** A 🟡 domain without an HTTP adapter is *unavailable* in production: its navigation is hidden, it is never
  served mock data.
- **Swapping a mock for HTTP** replaces one adapter and one config value. Pages, facades and models do not change. If the real Core
  contract differs from the provisional one, the **mapper absorbs the difference**. If the difference is semantic, the gateway and
  model change deliberately, because the mock was provisional by definition.
- **Contract test suite per gateway:** one shared spec runs against both adapters (the HTTP adapter with recorded Core-shaped
  responses), so a mock cannot quietly drift from the gateway's promises.

## 4. DTOs, domain models and mapping

- `*.dto.ts`: `readonly` transport types that mirror Core's OpenAPI names exactly, including Core naming. Written by hand from
  `GET /<service>/docs` at first. OpenAPI type generation is reconsidered once V2 contracts stabilize.
- `*.model.ts`: frontend domain types. They exist **only where a boundary adds value**: renamed or normalized fields, parsed instants,
  discriminated unions for states, derived flags. If a DTO is already a good model, the model is a type alias, so no redundant copy
  exists.
- `*.mapper.ts`: pure functions, unit-tested, including unknown enum values (forward-compatible: kept raw and flagged, never crash).
- **Response validation:** HTTP adapters validate the shape of what they consume (integration guide §25) and treat anything unexpected
  as `AppError{kind:'unexpected'}`, never as success. Small hand-written decoders are used first. A schema library (Valibot or Zod)
  needs owner approval and is evaluated at A3 if decoders multiply.
- Ids are branded types (`OrganizationId`, `PlatformId`, `UserId`), so ids from different domains cannot be mixed up.

## 5. State management

Decision hierarchy. Each step only when the previous one is insufficient:

1. **Component state:** `signal()` / `computed()` inside the component.
2. **Feature facade:** an `@Injectable()` scoped to the feature's routes. It holds signals for view state and exposes commands. HTTP
   stays as `Observable` inside the facade (`switchMap` cancellation, `debounceTime` search) and is bridged with `toSignal` /
   `rxResource`.
3. **Application state:** a few root services: session, grants/capabilities, organization context, preferences.
4. **A state library (NgRx Signal Store or similar): not adopted.** It is reconsidered only for a concrete problem: cross-feature
   entity caches with optimistic updates and undo, or devtools time-travel needed to debug complex flows. Neither exists today.

`ViewState<T>` is the standard discriminated union for data-driven views (§20).

## 6. Routing

Lazy-loaded feature routes. Titles are localized through a custom `TitleStrategy`. The URL is the source of truth for context.

```text
/login                         owner (password → factor) and operator (working code) entry
/login/verify                  owner second factor (TOTP / passkey)
/login/no-access               authenticated, but not an Admin user (after the access check)
/login/platform                operator with several assigned Platforms chooses one
/enroll                        owner first-factor enrollment (enrollment token)
/recovery                      owner recovery (start / complete)

/                              → /overview
/overview                      Company overview: company scope, owner only            🔴 aggregates (mock in demo builds)
/platforms/:platformId         platform scope entry (placeholder until platform pages) 🟢 access check · 🔴 names
/forbidden  /** (in the shell) "not available to your account" / "page not found"
/session-unavailable           no session in this build (every production build until A4)
/foundation                    A2 design-foundation gallery (verification surface)

/organizations                 directory                                      🔴 mock until CF-02
/organizations/:organizationId                                                 organization context
    /overview                  organization detail                            🟢
    /members                   memberships: pending / active / revoked         🟢
    /access                    join codes · admin invitations · org admins     🟢
    /licenses                  subscription / entitlement                      🟡
    /billing                                                                    🟡
    /payments                                                                   🟡
    /files                                                                      🟡
    /notifications                                                              🟡
    /audit                     owner audit read (≤ 31 days per query)          🟢
    /settings                  metadata edit                                   🟢 contract · ⚠ cutover

/platforms                     owner's Platforms (list page, later)          🔴 list · 🟢 create/edit (⚠ cutover)
/operators                     owner: operators, block, assignments           🟢 actions · 🔴 directory
/operators/:operatorId
/members/:userId               member security: suspend / restore             🟢 (reached from memberships)

/licenses                      license wizard and overview                    🟡
/billing  /payments                                                            🟡
/releases                      withdraw · minimum version                     🟢 actions · 🔴 catalog
/audit                         launcher: choose an organization (platform-level audit 🔴)
/services                      health                                         🔴 / 🟡
/monitoring                                                                   🟡
/settings                      preferences: language, theme, time zone (local)
/account/security              owner factors, secret key, password            🟢
```

- Guards: `authGuard` (a session exists), `capabilityGuard(cap)` (UX only), `availabilityGuard(domain)` (adapter available in this
  environment). **Guards are navigation controls, never security.**
- Query parameters hold list filters, ranges and cursors, so views are deep-linkable and survive refresh.
- The locale is **not** part of the URL: Transloco switches language at runtime in one build (§16).

## 7. Global context, organization context and switching

**Global context** is the actor's scope: the owner's Company, or the operator's assigned Platforms (`GET /auth/grants`). Global pages
never read an organization context.

### Company scope and platform scope (amendment, 2026-10-02)

The hierarchy is **Company → Platforms → Organizations → users and memberships**. Admin has two administrative scopes above the
organization context, both derived from the URL (`scopeFromUrl` in `core/context/scope-context.ts`):

| Scope | URL | Who | Meaning |
|---|---|---|---|
| **Company** ("All platforms") | `/overview` and other non-platform shell pages | **owner only** (`company.overview.view`) | company-wide administration across all the Company's Platforms |
| **Platform** | `/platforms/:platformId/…` | the owner (any Platform of their Company) or an operator **assigned** to that Platform | administration of one Platform |

- The **scope switcher** in the top bar shows the Company and "All platforms" or the selected Platform. Choosing an entry is
  **navigation**: "All platforms" → `/overview`, a Platform → `/platforms/:platformId`. "Open platform" on the Company overview
  does the same. No token changes; Core authorizes each request.
- **An operator's active Platform assignment never implies company-wide access.** `CapabilityPolicy` gives operators no
  company capability; the Company overview route guard sends them to `/forbidden`, and its facade never calls the gateway
  for them.
- Entering a Platform mirrors Core's `GET /auth/platform-access/:platformId`: unknown and not-yours are one
  "not found or not accessible" state (collapsed `404`).
- The Company's name and Platform list come from `ScopeDirectoryGateway` (🔴 no human Core route, CF-02; mock in demo builds),
  bound by the shell route; `ScopeContext` (shell-scoped) exposes the scope and the directory as signals.
- Platform administration pages are later stages; until then the platform scope shows a labelled placeholder.

**Organization context** is entered by URL (`/organizations/:organizationId/…`):

- `OrganizationContext` (root, `core/context`) derives `organizationId` from the router as a signal and loads the organization through
  `OrganizationGateway` (today `GET /auth/admin/organizations/:id`).
- **Gateways always take the organization id as an explicit parameter.** No adapter reads a hidden "current organization". This keeps
  calls testable and prevents a request from one context leaking into another.
- **Refresh / deep link:** the URL rebuilds the context. Nothing is required from storage.
- **Unauthorized or unknown:** Core answers a collapsed `404`. Admin shows one "organization not found or not accessible" state and
  does not distinguish the two cases.
- **Stale:** a `403`/`404` on an organization-scoped call while in context marks the context invalid. A banner explains it and links
  to the directory, and further org-scoped requests stop.
- **Disabled / archived:** Core has no lifecycle yet (CF-09). The view model reserves a `lifecycle` field that is `unknown` until Core
  defines it.
- **Switching:** the switcher (a combobox) offers recent organizations (kept in memory for the session) and directory search (🔴 mock).
  Switching navigates to the **same child route** in the new organization, cancels in-flight requests (`switchMap` on the id), and
  **resets organization-scoped facades**, which are keyed by organization id and reset when it changes. Session, grants and
  preferences are untouched. Route-level providers are not relied on for teardown.
- **No token switching.** Selecting an organization is context selection, not authentication. Core authorizes each request from the
  same human's bearer (Core roadmap, ADR-0050).

## 8. HTTP infrastructure

Functional interceptors in `core/http`, in this order:

1. **request id:** generates `x-request-id`.
2. **language:** `Accept-Language` from the active locale.
3. **auth:** attaches the bearer **only** to configured Core origins. On `401` it performs one single-flight refresh, then replays the
   request. If that fails, it moves the session to signed-out with a return URL.
4. **error normalization:** converts `HttpErrorResponse` into `AppError` (§9).

Retries (`429`, `503`, network errors only, bounded backoff with jitter, honouring `Retry-After`) are applied per call by the
adapter's operation semantics, not globally. Writes are retried only when an `Idempotency-Key` or natural key makes them safe.

## 9. Errors

```ts
type AppError =
  | { kind: 'network' }
  | { kind: 'unauthenticated'; code?: string }            // 401 (incl. session_ceiling_reached)
  | { kind: 'forbidden'; code?: string }                  // 403 (incl. step_up_required, admin_forbidden)
  | { kind: 'not_found'; code?: string }                  // 404 (often collapsed on purpose)
  | { kind: 'conflict'; code?: string }                   // 409, 422 idempotency_key_reused
  | { kind: 'validation'; messages: readonly string[] }   // 400 validation_error (display only)
  | { kind: 'rate_limited'; retryAfterSeconds?: number }  // 429
  | { kind: 'unavailable'; code?: string }                // 503 (hierarchy_unavailable, auth_unavailable …)
  | { kind: 'unexpected' };                               // 500, malformed response
// every variant also carries: status, requestId?, serverMessage? (display only)
```

- **Behaviour branches on `kind` and `code` only.** `serverMessage` is Core's localized `message`, used only as display fallback.
- Feature copy comes from Admin's catalog keyed by `code` (`errors.organization.company_not_found`), with a generic per-`kind`
  fallback. Paths that are still code-less in Core (until R6/R7 finish) fall back by status.
- Core validation errors are a `string[]` of **human text without a field contract**. Admin never parses them to locate fields. Client
  validation mirrors known constraints. Server validation failures appear in a form-level error summary.
- The global `ErrorHandler` catches unexpected client errors and records a safe diagnostic (§24).

## 10. Authorization-aware UI

- `CapabilityPolicy` is a **pure function** `(kind, grants, context) → Set<Capability>`. It mirrors Core's documented rules: owner of
  the Company; operator on assigned Platforms with no step-up operations; org-admin is not an Admin user. It is unit-tested
  rule by rule.
- Navigation items and actions declare `requires: Capability` and their contract state. Unavailable actions are **hidden** when the
  user can never have them, and **disabled with an explanation** when the reason is contextual (e.g. "operators cannot perform
  step-up operations yet").
- Core answers `403` regardless of what the UI showed. Every action handles `forbidden` gracefully. Drift between the policy and
  Core is a bug in the policy, and Core wins.
- When Core V2 A6 ships a permissions contract, `CapabilityPolicy` switches its input from derived facts to Core's answer. Its
  consumers do not change.

## 11. Authentication and session

**Flows (A4):** owner password → `mfa_required` (TOTP or passkey) | `enrollment_required` | `recovery_required`. Operator working
code, request then verify. Logout. Owner recovery. WebAuthn uses `navigator.credentials` with Core-issued options, isolated in one
`WebAuthnClient` in `core/auth`.

**Token handling:**

- **Access token:** in memory only (a signal inside `AuthSession`). Never in storage, URLs or logs. It is sent only to configured Core
  origins.
- **Refresh token:** a strategy is required, because Core returns it in JSON and refuses credentialed CORS (CF-01). Options:

  | Option | Security | UX | Cost |
  |---|---|---|---|
  | A. memory only | best: nothing persistent | a reload means signing in again | none |
  | B. `localStorage` / `sessionStorage` | **rejected**: exposed to any XSS | good | — |
  | C. **token-handler BFF** at the Admin origin, holding the refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie and proxying only `/auth/refresh` and `/auth/logout` | good (ADR-0050 D13: forwards the human's bearer, holds no authority) | good | a small deployable plus CSRF protection on its two routes (SameSite, `Origin` check, custom header) |
  | D. Core cookie mode | good | good | waits for Core V2 A4 |

  **Recommendation:** use **A** during development (A4). **The owner decides between C and D before production.** `AuthSession`
  hides the choice behind one interface (`restore()`, `refresh()`, `signOut()`), so changing it later does not touch features.
- **Refresh concurrency:** Core revokes the whole session if a rotated refresh token is presented again. Refresh is therefore
  **single-flight**. With a shared refresh credential (option C/D), it is also single-flight across tabs (Web Locks API). Logout is
  broadcast to other tabs (`BroadcastChannel`, with no token in the message).
- **Proactive refresh** shortly before expiry. Decoding `exp` from the JWT is for scheduling only, never for authority.
- **Operator sessions** end at the shift ceiling (`session_ceiling_reached`). The UI shows when the session ends and signs out cleanly.
- `GET /auth/me` and `GET /auth/grants` are loaded after sign-in and kept for the session. They are refreshed on focus after inactivity
  and after any `403`, because Core state is live.

## 12. Step-up and destructive actions

One pipeline for every high-impact action:

```text
confirm (severity-appropriate dialog)
   → step-up if the operation requires it (StepUpService.obtain(purpose) → x-step-up-token, single use)
   → execute (Idempotency-Key fixed for this logical operation, reused on retry)
   → result: success toast | mapped AppError | "step-up expired, verify again"
```

- **Severities:** *standard* (confirm), *destructive* (consequence stated, the action button names the verb, e.g. "Block operator",
  never "OK"), *irreversible* (the operator types the target's name or id).
- Step-up tokens are requested **immediately before** the call and never stored. Available methods (TOTP, passkey, secret key) come
  from Core, which decides which methods each purpose accepts. Member suspension, for example, requires a factor.
- Closed reason codes (e.g. suspension `compromised_account | security_incident | policy_violation`) are machine values with
  localized labels. Admin never sends free text where Core expects a code.
- Every action reminds the operator that it is recorded in the audit trail. Core writes the evidence, not Admin.

## 13. Design system: tokens, SCSS and BEM

### Token architecture

```text
Official Nawara brand (brand board, owner 2026-10-01: palette, gradients, type, icon style, logo)
        │
        ▼
Primitive tokens   --nw-ref-*        brand anchors + derived ramps; used only by theme files
        │
        ▼
Semantic tokens    --nw-color-* · --nw-surface-* · --nw-text-* · --nw-border-* · --nw-status-* · --nw-focus-*
        │
   ┌────┴────┐
   ▼         ▼
 Light      Dark       each defines every semantic token intentionally (not inversion)
 theme      theme
   │         │
   └────┬────┘
        ▼
Component tokens (optional, local)   --nw-button-bg: var(--nw-color-primary)
        ▼
Shared UI foundations (nw-*)  →  Nawara Admin components
```

- **Theme-independent scales** (CSS custom properties): spacing `--nw-space-0…10` (a 4px-based rem scale), radius, typography
  (`--nw-font-*`, `--nw-text-size-*`, `--nw-line-height-*`), z-index, motion, layout (`--nw-shell-sidebar-width`, `--nw-content-max`).
- **Z-index:** `--nw-z-base 0`, `--nw-z-sticky 100`, `--nw-z-dropdown 200`, `--nw-z-overlay 300`, `--nw-z-modal 400`,
  `--nw-z-toast 500`. CDK overlays are configured onto this scale. Raw numbers are forbidden.
- **Motion:** `--nw-duration-fast|base|slow`, `--nw-ease-standard|emphasized`. Under `prefers-reduced-motion: reduce` the durations
  collapse to near zero.
- **Product accents (future):** `[data-product="admin"]` may set `--nw-accent-*`. The brand core is never forked per product.
- **Rules:** components use **semantic or component tokens only**. A raw hex, `rgb()` or px colour in a component stylesheet is a lint
  error. Exceptions need a comment and review.
- **Contrast:** every text/surface pair in both themes is checked to WCAG 2.2 AA in a token test (A2).

### Brand

The brand board (owner, 2026-10-01; a raster image) prints one anchor value per hue: Primary pink `#E6428B`, Secondary orange
`#FF8A3D`, Accent amber `#FFC857`, Purple `#7B2CBF`, Dark `#1B1B24`, Muted `#6B7280`, Surface `#FAF7F4`, White. It shows two
gradients without stop values; the gradient tokens are approximations built from the printed palette. [`BRAND.md`](BRAND.md)
records which values are printed, sampled or proposed. `tokens/_primitives.scss` holds the anchors (marked `brand`) and the ramp steps derived
from them. **Contrast decides usage:** the brand pink with white body text is 3.81:1, below AA, so solid actions use ramp step
600 in light and 400 (with dark ink) in dark; the anchor is used for gradients, illustration, the logo and large display text.
Status green and red are functional, not brand. **The logo is artwork, never font lettering:** `nw-brand-mark` renders files
from `public/brand/`, a vector symbol that is a **provisional reconstruction** of the board's flower and the board's own
wordmark as a raster (light and dark versions, chosen by a theme token). An official vector source is still needed (D-A2-6);
replacing the files changes no consumer.

**Future design source** (a design tool or Claude design output) feeds a *specification*: token values, preferably in the W3C Design
Tokens format, plus assets. A build step (e.g. Style Dictionary) is added only when such a source exists. The application never
depends on a design tool.

### SCSS structure

```text
src/styles/
├── styles.scss                 entry point: @use only, no rules
├── tokens/
│   ├── _primitives.scss
│   ├── _scales.scss            spacing, radius, type, z-index, motion, layout
│   ├── _theme-light.scss
│   └── _theme-dark.scss
├── base/                       reset, document typography, focus-visible, reduced-motion, forced-colors, selection
└── abstracts/
    ├── _breakpoints.scss       breakpoint map + mixins (media queries cannot read CSS variables)
    ├── _a11y.scss              visually-hidden mixin
    └── _index.scss             @forward of the above
```

- Modern module system only: `@use` / `@forward`. **`@import` is forbidden** (it is deprecated in Dart Sass).
- Components `@use 'abstracts' as nw;` (via `stylePreprocessorOptions.includePaths`) and keep their styles **colocated**.
- Global CSS contains only the reset, document-level typography, theme variables and accessibility utilities. **No component styles
  in global CSS.**
- `ViewEncapsulation.Emulated` (the default). BEM keeps naming explicit anyway, so a future change of encapsulation is safe.

### BEM convention

```text
.organization-switcher                    block       = the component (class set on the host element)
.organization-switcher__trigger           element     (one level only — never block__a__b)
.organization-switcher__item--active      modifier    (variant or non-semantic state)
```

- The block class goes on the host (`host: { class: 'organization-switcher' }`). The template uses elements.
- **Prefer ARIA/state attributes over state modifiers** when a semantic state exists: `[aria-expanded='true']`,
  `[aria-current='page']`, `[aria-invalid='true']`, `:disabled`. Modifiers are for visual variants (`--compact`, `--danger`).
- Nesting is limited to `&__element`, `&--modifier`, and state or pseudo selectors. There are no descendant chains.
- **Prefixes:** shared, share-ready primitives use selector and block `nw-*` (`<nw-button class="nw-button">`). Admin-specific
  components use selector prefix `adm-` and an unprefixed block (`<adm-organization-switcher class="organization-switcher">`).
- Stylelint enforces BEM-shaped class names, the no-raw-colour rule outside `src/styles/tokens/` and the `@import` ban (§30).
- A theme can be scoped to a subtree with `data-theme="light|dark"` on any element (for example a fixed dark panel).

## 14. Light / dark / system theme

- The `ThemePreference` is `'system' | 'light' | 'dark'`, with default `system`.
- **Applied** as `data-theme="light|dark"` on `<html>`. With `system`, `matchMedia('(prefers-color-scheme: dark)')` is followed live.
  `color-scheme` is set accordingly, so native controls and scrollbars match.
- **Persisted** under the single preference registry (`core/preferences`, key `nw.theme`) in `localStorage`. Preferences are not
  sensitive. The registry is the **only** place that touches browser storage, and it lists every key.
- **No flash:** a few-line script in `index.html` reads `nw.theme` and sets `data-theme` before first paint. It is allowed by a CSP
  hash, not `unsafe-inline` (§21).
- Both themes are designed and reviewed for every component from A2. A component is not done until it is verified in both.
- **Accent palettes (2026-10-04):** a curated set (Coral, the Nawara default, plus Rose, Plum, Indigo, Teal, Amber) recolours
  only the brand-accent semantic tokens (primary action and its states, brand text and links, brand borders, subtle brand
  surfaces, focus ring and halo) through `data-accent` on `<html>` (`src/styles/tokens/_accents.scss`). Status colours,
  urgency, chart categories and product identity (School's coral, Drive's orange) never change.
  Every preset is checked by `check:contrast` in light and dark. No free colour picker.
- **Palette artwork (2026-10-04):** the logo's bloom, flourish and "SOLUTIONS" gradient (`--nw-logo-*`) and the botanical
  artwork (`--nw-illustration-botanical`, `-corner`) also follow the palette. Their values are generated from the coral
  master by `tools/brand/recolor_artwork.py` (`tokens/_brand-artwork.scss`, and `core/theme/palette-artwork.ts`, the
  single palette-to-artwork mapping); no route maps colours. `ThemeService.setAccent` preloads the new palette's artwork
  (bounded wait) before switching, so controls, logo and illustrations change together without blank artwork.
- **Favicon, workspace tint, flower (2026-10-04):** one `<link id="nw-favicon">` whose file follows the palette (set by
  `index.html` before paint, then by `ThemeService`; an external SVG cannot read page CSS variables). The authenticated
  shell's background is `--nw-workspace-background`, the neutral page washed toward `--nw-color-primary` with
  `color-mix()`; cards stay neutral. Workspace page headers have no banner (no background, border or artwork): title and
  actions sit on the workspace background. The shell's single decoration layer (`.shell__decor`: corner sprig and
  flower) is `position: fixed` to the visible workspace (below the top bar, beside the sidebar, inside the scrollbar),
  under the content column, so it stays put while the document scrolls, without scroll script.
- **One appearance state, three entry points:** `ThemeService` holds mode and accent; the Appearance popover (beside the
  language control on the sign-in pages and in the top bar) and Settings → Appearance edit the same state. It is
  browser-local (`nw.theme`, `nw.accent` in the preference registry), validated on read, applied before first paint by
  `index.html`, and independent of the session, role and scope: sign-in, sign-out, reload and scope changes keep it.
  It is not synchronized with a Core account.

## 15. Responsive layout

| Range (min-width) | Name | Shell behaviour |
|---|---|---|
| `< 600px` | narrow | top bar + navigation drawer; stacked layouts; full-width forms; no page-level horizontal overflow |
| `600px` | tablet | navigation drawer; two-column grids where useful |
| `900px` | laptop | collapsible rail sidebar; compact density |
| `1200px` | desktop | expanded sidebar; rich tables |
| `1600px` | wide | content max-width, side panels (detail drawers) |

- These are the **only** viewport breakpoints. They are defined once in `abstracts/_breakpoints.scss` (in `rem`/`em`) and mirrored as
  CDK `BreakpointObserver` queries for shell logic.
- **Components respond to their container** (`container-type: inline-size` + `@container`), not the viewport. A filter bar or detail
  card adapts wherever it is placed.
- Layout uses Grid and Flexbox with logical properties. `clamp()` is used for page padding and headings, not for dense data text.
- Tables are not converted to cards automatically (§19).

## 16. Languages: English, French, Arabic

**Mechanism — decided (D-A1-2): Transloco** (`@jsverse/transloco`), chosen by the owner over `@angular/localize` for runtime
language switching in one build, lazy-loaded per-feature (scoped) translations, and a foundation reusable by future Nawara
frontends. A1 verified compatibility: `@jsverse/transloco` 8.4.0 declares `@angular/core >=16` and `rxjs >=6` (maintained, last
published 2026-09-26). **Installation and configuration belong to A2**, with a runtime smoke test against Angular 22 at that point.

Consequences to honour in A2, because Transloco checks translations at runtime rather than at compile time:

- a **missing-key check in CI** (every key present in `en`, `fr` and `ar`), so incompleteness fails the build as it would have with
  compile-time localization;
- typed or constant key usage where practical; no keys built by string concatenation;
- switching language updates `<html lang dir>` and Core's `Accept-Language` together, without a reload.

**Rules:**

- **Every** user-facing string is localized from the first component: labels, `aria-label`, titles, toasts, validation and empty
  states. Hard-coded copy is a lint and review failure.
- Translation keys are stable and meaningful (`organizations.list.empty`) and never derived from English text.
- The locale preference is explicit (a language switcher) with `navigator.languages` as the first-visit default. It is persisted in
  the preference registry. `Accept-Language` sent to Core always equals the UI locale.
- **Shared (share-ready) primitives own no copy.** Labels arrive through inputs or a provided `NwUiLabels` token, so a shared
  package never ships its own catalog.
- **Machine values are never translated:** ids, `code`s, enum values, request/correlation ids, service and product identifiers, audit
  `action`s. They render through `nwMachineValue`: monospace, `translate="no"`, LTR-isolated, copyable. Human labels for enums come
  from an exhaustive map (`satisfies Record<Enum, string>`), and unknown values render raw with an "unrecognized" marker.

## 17. RTL

- `<html lang dir>` is set from the locale (`ar` → `rtl`). CDK `Directionality` drives overlays, menus and drawers.
- **Logical properties only** (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-start`,
  `text-align: start`). Physical `left`/`right` are a stylelint error unless the intent is physical. Such cases need a comment and
  are rare: media playback, maps.
- Directional icons (chevrons, arrows, "back") mirror under `:dir(rtl)` through an icon flag. Non-directional icons never mirror.
- **Bidi isolation:** user data, emails, ids, URLs and numbers inside Arabic text use `<bdi>` / `unicode-bidi: isolate`. Ids and codes
  are always LTR.
- **Digits:** Arabic uses Latin digits 0–9 (owner decision D-A2-3, approved). Every `Intl` formatter takes its locale tag
  from `formattingLocaleOf` (`core/i18n/locale.ts`), which returns `ar-u-nu-latn` for Arabic; month names stay Arabic.
- Every component is verified in `ar` before it is considered done. E2E smoke runs in `ar`.

## 18. Typography

- **Brand typefaces (coral + ink theme, owner decision 2026-10-04):** **Readex Pro** for Latin and Arabic (one family for
  every locale, SIL OFL) and **JetBrains Mono** for ids and codes. Served from `@fontsource/*` packages through
  `angular.json` (weights 400/500/600; mono 400/500). Readex Pro uses the range-declared entry files (`400.css` …), so each
  subset (`latin`, `arabic`, …) is fetched only when a character needs it; the per-subset files declare no `unicode-range`
  and would all download. IBM Plex (the earlier brand board) is no longer used.
- **Self-hosted** WOFF2 with `font-display: swap`, subset per script. No third-party font CDN (CSP and privacy).
- `--nw-font-sans` resolves per language (`:lang(ar)` switches to the Arabic family first). Arabic gets a slightly larger line height,
  **never letter-spacing**, and no `text-transform: uppercase` anywhere (it has no meaning in Arabic).
- A fixed `rem` type scale for UI and data. Tables use `font-variant-numeric: tabular-nums`.

## 19. Tables

- `nw-data-table` is built on **CDK table** and renders semantic `<table>`, `<th scope>` and `<caption>`.
- **Server-driven:** Core lists are cursor-based (`limit` ≤ 100, `nextCursor`, newest first, **no totals, no server sort**). The table
  offers "Next / Previous" over a cursor stack, or "Load more". It **never downloads unbounded data to filter in the browser**.
- Filters, ranges and cursors live in the URL. Search inputs are debounced and cancel previous requests.
- Sorting is offered only where the server supports it. Client-side sort of the current page is labelled as such or not offered.
- **Row actions:** an accessible menu button per row (`aria-label` includes the row's name). Primary actions are text buttons, never
  icon-only for critical actions.
- **States:** skeleton rows (loading), empty with guidance, error with retry, forbidden. These are the same components as §20.
- **Responsive:** horizontal scroll **inside** the table container (never the page), a sticky first column and header, and column
  priorities that hide secondary columns on narrow containers. A card layout is used only where a specific table is redesigned for
  narrow use.
- Virtual scroll (CDK) only when a real dataset needs it.
- Audit tables enforce Core's bounds before calling: ≤ 31-day range, UTC conversion of the chosen time zone.

## 20. Data states, loading and feedback

```ts
type ViewState<T> =
  | { status: 'idle' }
  | { status: 'loading'; previous?: T }   // keep previous data while refreshing
  | { status: 'success'; data: T }
  | { status: 'empty' }
  | { status: 'forbidden' }
  | { status: 'error'; error: AppError };
```

- `nw-data-state` renders each state consistently with localized copy. Every page considers every applicable state, not only the
  success path.
- Loading uses skeletons for content and an inline spinner for actions. Buttons show a busy state and prevent double submission.
- Toasts (CDK overlay + `LiveAnnouncer`) are for completed actions. Errors that block a task stay inline, near the task.

## 21. Frontend security baseline

- **XSS:** Angular sanitization stays on. `bypassSecurityTrust*` is forbidden without review. No `innerHTML` of server data. Trusted
  Types are enabled through the CSP.
- **CSP:** strict: `default-src 'self'`; `script-src 'self'` plus hashes or nonces (Angular `autoCsp`); `connect-src` limited to
  configured Core origins; `frame-ancestors 'none'`; no third-party scripts. Set at the hosting layer.
- **Tokens and secrets:** §11. Nothing sensitive in storage, URLs, logs or telemetry. Redaction covers passwords, codes, TOTP, secret
  keys, recovery material, tokens, `Authorization` and step-up headers.
- **One-time secrets** returned by Core (secret key, join-code plaintext, enrollment QR) are shown once in a dedicated
  "copy and confirm" view. They are cleared from memory on navigation and never logged.
- **CSRF:** not applicable to bearer calls to Core. If the BFF option is chosen, its cookie routes use SameSite=Strict, an `Origin`
  check and a custom header.
- **WebAuthn:** used only from the configured origin (`https://admin.nawara-solutions.com`, RP `nawara-solutions.com`). Local
  development uses a local Core configured for `localhost`.
- **Files:** downloads go through Core tickets when they exist (V2). User-supplied SVG or HTML is never rendered inline.
  `Content-Disposition` is respected.
- **Payments:** Admin never handles card or payment credentials. Payment flows stay with providers and Core.
- **No service tokens in the browser, ever** (integration guide §3, §26).

## 22. Forms

- **Typed reactive forms** (`NonNullableFormBuilder`, `FormGroup<{…}>`). Angular's Signal Forms are evaluated at A4 (the first real forms) and adopted only
  when stable.
- `nw-form-field` wires label, hint, error, required state and `aria-describedby` / `aria-invalid` once. Features never hand-write that
  wiring.
- **One validation-message resolver** maps validator keys and Core `code`s to localized messages. There is no per-feature error
  string logic.
- Server failures: field-level only through explicit, per-feature `code → field` maps (e.g. `409` conflicts). Otherwise a form-level
  error summary is shown (focusable, linked to fields where known).
- Submission: busy state, disabled re-submit, and an `Idempotency-Key` generated once per logical submission and reused on retry.
- A `CanDeactivate` guard prompts on unsaved changes for long forms only.

## 23. Date, time and numbers

- Core sends **UTC ISO-8601 instants**. They are parsed in mappers into an `Instant` type. Strings from Core are never reinterpreted
  as local time, and date-only values (if any appear) are never routed through `Date`.
- **Display time zone:** an operator preference (default: browser zone; `Africa/Tunis` offered prominently), stored in the
  preference registry. Absolute timestamps show the zone, and audit views show exact UTC on demand.
- All formatting goes through the `nwDate` / `nwDateTime` / `nwRelativeTime` / `nwNumber` pipes, backed by `Intl` with the active
  locale (and numbering system, §17). Features never call `DatePipe` or `toLocaleString` directly.
- Range inputs (audit) convert the operator's zone to UTC instants before calling Core, and display the conversion.
- The Temporal API is evaluated in A2 (when the formatting pipes are built) against target browsers. Until then a thin internal adapter over `Intl` + `Date` keeps a later
  swap local.

## 24. Configuration, environments and observability

- **Deployment (2026-10-03):** CI, the production image, Traefik routing and rollback are described in
  [`DEPLOYMENT.md`](DEPLOYMENT.md). Production has no runtime configuration file and no secret: the bundle is public.

- **Runtime config** `config.json`, loaded before bootstrap (`provideAppInitializer`) and validated into a typed `AppConfig`:
  `environment` (`local | development | staging | production`), Core base URL(s), per-domain adapter (`http | mock`), build info. One
  build is promoted across environments.
- **Interim (A3 Company Overview slice, 2026-10-02): build-time environments.** Until runtime config is needed (Core base
  URLs, A4), `src/environments/environment.ts` (production, the default `ng build`) and `environment.development.ts` (swapped
  by `fileReplacements` for `ng serve` and `--configuration development`) are typed `AppEnvironment` values. The production
  file sets `demo: null` and imports nothing from `src/app/demo/`, so **no demo session, mock adapter or fixture is bundled**;
  `assertEnvironment` refuses `production` with demo data at startup, and `npm run check:production` fails the validation if
  any demo marker appears in the production bundle. Domains without a Core contract bind an **unavailable** adapter outside
  demo builds (never mock data). When runtime config arrives, the per-domain adapter choice moves into it and production
  still refuses `mock`.
- **Everything shipped to the browser is public.** Config contains no secrets.
- **Diagnostics:** the global `ErrorHandler` and failed requests produce a redacted record (`requestId`, `code`, status, route,
  build version, time) shown in the error UI as a copyable reference. It is sent to no external vendor until Core V2 A12 defines the
  observability direction (vendor decision postponed).

## 25. Accessibility

Target **WCAG 2.2 AA** from the first component.

- Semantic HTML first: buttons are `<button>`, navigation is `<a routerLink>`. There are no clickable `<div>`s.
- Landmarks (`header`, `nav`, `main`), a skip link, one `h1` per page and an ordered heading hierarchy.
- **Route changes:** the localized title updates, focus moves to the page heading, and the change is announced politely.
- Visible `:focus-visible` ring from tokens, with sufficient contrast in both themes. Forced-colors mode is supported.
- Dialogs, menus and listboxes use CDK a11y (focus trap, focus restore, keyboard navigation, roving tabindex). Menus and comboboxes
  follow the ARIA APG patterns.
- Errors are announced. Required state, descriptions and invalid state are programmatic. Target size is at least 24×24 CSS px.
- `prefers-reduced-motion` is respected globally. Colour is never the only carrier of meaning: status badges have text and icon.
- Automated checks (axe) run in component and E2E tests. Keyboard-only and screen-reader passes are part of each stage's acceptance.

## 26. Icons

- **One icon set**, rendered as inline SVG through a single `nw-icon` component: **Lucide** (ISC licence), decided by the brand
  board (D-A2-2), drawn at stroke width 1.75. Icons are registered by name in `shared/ui/icon/icon.registry.ts`, so only used icons
  are bundled. Icon fonts and mixed libraries are not used.
- Icons are decorative by default (`aria-hidden`). An icon-only button gets an accessible name. Critical actions always carry a text
  label.
- Each icon is marked directional or not for RTL mirroring.

## 27. UI component library evaluation

| Option | Accessibility | RTL | Dark mode / theming | BEM/SCSS fit | Bundle | Brand freedom | Verdict |
|---|---|---|---|---|---|---|---|
| **Angular CDK** | strong (a11y module, overlay, focus) | `Directionality`, bidi-aware overlays | headless: our tokens | full (we write all markup/CSS) | small, tree-shakable | full | **Recommended** |
| Angular Aria (headless ARIA patterns) | strong | yes | headless | full | small | full | **Evaluate in A2**; adopt per pattern once stable |
| Angular Material | strong | good | M3 token theming | poor: its own DOM/classes, overrides fight BEM | larger | Material identity leaks into the brand | **Not recommended** |
| PrimeNG / others | variable | variable | own theming | poor | larger | limited | **Not recommended** |

**Decided (D-A1-3): Angular CDK is approved for selective use** (overlays, accessibility, focus management and other behaviour
primitives) beneath Nawara's own SCSS/BEM components and tokens. It is installed only when A2/A3 has a concrete requirement (not
installed in A1). **Angular Material is not approved.** Angular Aria remains an evaluation item. No library defines the Nawara
brand.

## 28. Performance and lifecycle

- Lazy routes per feature. `@defer` for heavy secondary panels. Bundle budgets in `angular.json` fail the build when exceeded.
- OnPush + zoneless, `track` in every `@for`, `computed` for derivations. No function calls in templates beyond signals.
- Request cancellation with `switchMap` on parameter changes. Debounced search. Caching only for session-scoped facts (me, grants)
  and immutable lookups.
- `NgOptimizedImage` for raster images. Subset fonts.
- **Lifecycle safety:** `takeUntilDestroyed` / `DestroyRef`, `toSignal`, `async` pipe. No `subscribe()` without a teardown, enforced
  by lint where possible.

## 29. Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | mappers, decoders, `CapabilityPolicy`, error normalization, formatting, facades (with fake gateways) |
| Gateway contract | Vitest | one shared suite per gateway, run against **mock and HTTP adapters** (HTTP against recorded Core-shaped responses) |
| Component | Vitest + TestBed (Testing Library: dev-dependency decision at A1) | rendering per `ViewState`, forms, accessibility (axe), both themes, `dir=rtl` |
| Routing | Vitest + `RouterTestingHarness` | guards, deep links, organization switching resets |
| Localization | CI check (A2) | every Transloco key present in `en`, `fr` and `ar` |
| E2E | **Playwright** (installed in A3) | sign-in flows, shell navigation, organization switching, keyboard paths, `ar` RTL smoke, axe scans. Runs against mock mode, and against a local Core from A4 |
| Visual (optional, later) | Playwright screenshots | theme × direction matrix for shared primitives |

Testing dependencies are installed at A1/A3, not in A0.

## 30. Code-quality gates

Every change must pass `npm run validate`: **Prettier check** → **ESLint** (angular-eslint incl. template accessibility,
`no-explicit-any`, `adm`/`nw` selector prefixes, `HttpClient` only in `*.http.ts` / `core/http`, Material/Bootstrap/Tailwind import
ban) → **Stylelint** (`stylelint-config-recommended-scss`; no `@import`; no raw colours outside `src/styles/tokens/`, with
`transparent`, `currentColor` and system colours allowed; BEM-shaped class names) → **`check:i18n`** → **`check:contrast`** →
**unit tests** (type-checked) → **production build within budgets** (strict TypeScript and strict templates). E2E and
accessibility suites (from A3) run on changes to the shell, auth, routing or shared primitives, and before each stage closes.
Validation is risk-based, not "everything on every typo".

`check:i18n` verifies en/fr/ar parity and every key referenced as a string literal in templates and TypeScript; a key built
at runtime cannot be checked, so a literal key prefix is rejected and full keys must be listed. `check:contrast` verifies
the token pairs the primitives combine; it is necessary, not proof of WCAG conformance, which needs rendered checks.

**Not yet adopted:** a Stylelint rule banning physical `left`/`right` properties (D-A2-8; no violation exists today) and
automated axe tests as a project dependency (D-A2-5, with Playwright in A3). Feature-layer import boundaries
(`shared` ↛ `core`/`features`, etc.) are not lint rules yet (A3).

**TypeScript strictness:** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
`noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`, and Angular `strictTemplates`, `strictInjectionParameters`,
`strictInputAccessModifiers`, `extendedDiagnostics` as errors. `any` requires a written justification. Casts that only silence the
compiler are rejected. Prefer `unknown` + narrowing, discriminated unions, `readonly` and `satisfies`.

## 31. Reuse and the shared frontend platform (`nawara-frontend`)

**Reuse rule:** a first real implementation, then a second confirmed use, then a stable abstraction is identified, then it is
extracted. Obvious design-system primitives (tokens, themes, typography, focus, button, icon, dialog, form field, data state) may be
built up front because their responsibility is already clear.

**Where shared code lives.** The earlier plan for a single `@nawara/frontend-kit` is superseded. Shared frontend code lives in the
`nawara-frontend` repository as layered packages named `@nawara-solutions/*` (its ADR-0001 to ADR-0003): `foundation`
(framework-independent, e.g. `@nawara-solutions/design-tokens`) and, later, `angular` (`@nawara-solutions/angular-*`). Its
process is its `docs/SHARED-CONTRIBUTION-POLICY.md`; the operating rules for Admin work are in [`CLAUDE.md`](../CLAUDE.md).

**Status (verified 2026-10-06, `nawara-frontend` `main` `87bf10a`):** one package exists, `@nawara-solutions/design-tokens`
0.1.0, **private and unpublished**; no product consumes it. Its 147 tokens (44 reference, 51 scale, 52 semantic) and its
breakpoints currently have the same names and values as Admin's, and Admin's accent palettes override exactly its 11
`accentControlled` tokens. Distribution: no release, registry or publish workflow exists yet; ADR-0002 recommends GitHub Packages (`npm.pkg.github.com`), and until
publication a product can only consume a local tarball (its `docs/CONSUMPTION.md`).

**Adopted (2026-10-06):** 0.1.0 was released to GitHub Packages (private), and Admin consumes `@nawara-solutions/design-tokens` **0.1.0** (pinned exactly; GitHub Packages, private, with Read access granted to `nawara-admin`'s Actions).
`angular.json` loads its `tokens.css` before `src/styles/styles.scss`; `abstracts/_breakpoints.scss` forwards its Sass
breakpoints (`pkg:` import, resolved by Angular's builder); `src/styles/tokens/` is Admin's extension only (Admin-only
references, scales, semantic and shell tokens, artwork, and the accent palettes, which override exactly the 11
`accentControlled` tokens). `npm run check:tokens` enforces this against the installed manifest; `check:contrast` reads the
foundation values from the manifest. Arabic typography is applied as properties (`html:lang(ar)` font family, label
tracking reset per component), never by redefining a foundation token: the package has no locale customization point. Admin keeps its own shadows (the shared shadows, DT2b, are deferred) and every
Admin-specific token; upgrades and any token namespace change are separate, owner-authorized tasks.

**Classification** (recorded in ROADMAP's register):

| Class | Meaning | Location |
|---|---|---|
| **LOCAL** | Admin-specific (shell, navigation, scope, auth flows, operator workflows, every feature, Admin theme and artwork) | `layout/`, `features/`, Admin parts of `core/` and `styles/` |
| **CANDIDATE** | product-independent and ready to share, but proven in Admin only | `shared/`, `styles/`, selected `core/` infrastructure (HTTP interceptors, i18n/direction, theme, preferences) |
| **SHARED** | in `nawara-frontend`, with a stable, product-independent API, docs, tests, a11y, RTL, both themes | `@nawara-solutions/*` packages (consumed by Admin only after a separate adoption task) |

```text
                 nawara-frontend   (shared foundation; never depends on a product)
   foundation: @nawara-solutions/design-tokens (0.1.0, private)   ·   angular: later
                        │  versioned packages, adopted per product
          ┌─────────────┼─────────────┐
          ▼             ▼             ▼
        Admin         Drive         School        independent consumers, each with its own theme and identity
```

Shared code **never** contains product business logic, product copy, or a "utils" bin. Products may depend on `nawara-frontend`;
it never depends on a product, and products never depend on each other. Core alone authorizes; frontend checks are UX. A missing
generic capability is a separate `nawara-frontend` contribution, never a side effect of an Admin task. The review points are in
[`ROADMAP.md`](ROADMAP.md#shared-frontend-review-points).

## 32. Naming

Names state intent: `OrganizationGateway`, `AuditQueryFacade`, `CapabilityPolicy`, `StepUpService`, `PreferenceStore`.
**Forbidden without a genuine reason:** `Utils`, `Helpers`, `CommonService`, `Manager`, `Misc`, `Base*`. Files are kebab-case with a
role suffix (`*.gateway.ts`, `*.http.ts`, `*.mock.ts`, `*.dto.ts`, `*.model.ts`, `*.mapper.ts`, `*.facade.ts`, `*.page.ts`).

## 33. Explicitly avoided

**Known debt we refuse:** Bootstrap, Tailwind or any utility CSS framework · hard-coded colours · hard-coded English · LTR-only CSS ·
raw HTTP in components · scattered mocks · untyped responses · tokens in browser storage · ad-hoc storage keys · giant components or
global stylesheets · ad-hoc breakpoints · per-feature form or error handling · per-feature theme hacks · parsing Core messages ·
mixed icon libraries · raw z-index numbers · "temporary" code without an exit.

**Over-engineering we refuse:** empty folder trees · a custom framework or state framework · interfaces without a boundary · generic
repositories per DTO · speculative factories · premature kit extraction · a state library without a demonstrated problem.
