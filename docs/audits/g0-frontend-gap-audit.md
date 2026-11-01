# G0 — Nawara Admin V2 complete frontend gap audit

| | |
|---|---|
| Status | **Read-only audit** for Owner review. No application code, test, dependency or configuration was changed. |
| Admin baseline | `main` at **`8228136`** (merge of PR #72, A12). PR #72's required checks (validate, production image smoke test) passed; the post-merge `main` run (Admin CI #137) was in progress when this audit was written. |
| Core baseline | Admin's register is pinned to nawara-core **`0044b20`**. Core `main` is now **`c49bd59`** (31 commits later). Those commits change tests, stage-record documentation (S0-C7, S1–S6 closure) and one Auth fix (`cd932f0`, concurrent hierarchy placement). **No controller, route or CORS bootstrap changed** (`git diff 0044b20 c49bd59 -- 'apps/*/src/**/*.controller.ts' libs/service-kit/src/bootstrap.ts` is empty), so every route-level conclusion at `0044b20` holds at `c49bd59`. |
| Local verification | `npm test` on `8228136`: **180 files, 2118 tests, all passing**. No browser run was made for this audit; visual evidence cited below comes from earlier recorded runs (`docs/review/*/rendered-checks.txt`). |
| Date | 2026-11-01 |

Method: routes, pages, facades, gateways, mocks, bindings, capability policy, specs and documents were read from the repository
at the baseline. Each statement cites a path. **Mock-first means simulated:** nothing in Admin talks to Nawara Core today (no
`HttpClient` usage anywhere in `src/app`), and nothing below is live or production-ready.

---

## 1. Executive status summary

- **Mock-first completeness is high for the Company owner's non-financial administration.** Shell, sign-in prototypes, Company
  overview, Platforms, Platform dashboard, Organizations and memberships, Operators, Licenses (read), Settings and owner security,
  and the whole Assistance module (A1–A12, accepted mock-first) are implemented behind typed gateways with demo adapters and
  production "unavailable" adapters, with owner/operator tests.
- **Financial administration beyond Assistance is not built.** Refunds, Payment disputes/chargebacks, fraud holds, reconciliation,
  write-off, fees/delegations and invoices/payments have **no screen**. The F1 authorization foundation is **headless only**
  (F1-S1–S5 merged; F1-S6 UI and F1-S7 fixtures missing).
- **Real Core integration is blocked first by architecture, not code:** D-A4 (browser session) blocks every HTTP adapter;
  CF-07 (origins) is a production action; ORG-00 keeps hierarchy reads provisional for all of Core V2; every financial module is
  development/simulation-only in Core and S-INT has not run.
- **Unsafe or inconsistent items found** (none is a live risk today, because production has no session and no Core calls):
  1. **Governance drift:** `CLAUDE.md` and `docs/ROADMAP.md` say F1-S2–S7 are "not authorized", yet F1-S2a/S2b/S3/S4/S5 are merged
     (PRs #55–#61); Assistance A1–A12 is absent from both stage tables; "A9 Audit / A10 Release / A11 Billing / A12 Files" (ROADMAP
     stages) collide with the Assistance milestone names A9–A12.
  2. **No Content-Security-Policy** in production (`docs/DEPLOYMENT.md` "No Content-Security-Policy yet"); must exist before any
     real session or Core origin.
  3. **Step-up entry is duplicated** in 11 in-app dialogs/pages (`autocomplete="one-time-code"` in operators ×2, organizations ×4,
     platforms ×1, settings ×4), while F1-S6 plans a shared step-up/authorization UI: risk of a twelfth copy.
  4. **Four inert sidebar entries** (Organizations, Users & identity, Files, Monitoring; `layout/sidebar/navigation.ts:46`, `:47`,
     `:88`, `:97`) render as "not available yet" for the owner.
  5. **`/foundation`** (the design-system gallery) is routed outside the shell with no guard in every build (`app.routes.ts`).

## 2. Complete feature inventory

Legend — **Classification:** CMF complete mock-first · PART partially complete · PH placeholder · MISS missing · CB contract-blocked
(for real integration or for the missing part) · OOS out of scope. **Prod:** every non-demo build binds an `Unavailable…` adapter;
in production no session can exist (`app.routes.ts` → session-unavailable page), so production shows "Sign-in is not available yet".

| Area | Route(s) · role | UI / domain / gateway | Demo coverage | AuthZ / scope | i18n · RTL | Tests (specs / `it`) | Classification · Core dependency |
|---|---|---|---|---|---|---|---|
| Sign-in, owner MFA, enrollment, operator working code, contact confirmation | `/login/*` (guest), `/login/platform` | 8 pages, `core/auth/auth.gateway.ts`, `auth.mock.ts`, `auth-flow.facade.ts` | accounts, codes, TOTP, scenarios (`core/auth/auth.fixtures.ts`) | `guestGuard`, `platformChoiceGuard` | EN/FR/AR keys; no AR render spec | 11 / 131 | **CMF (prototype)** · CB: D-A4, CF-01, CF-07, CF-15–CF-22; no WebAuthn client (`navigator.credentials` unused) |
| Shell, navigation, breadcrumbs, appearance, language, notifications badge | all signed-in | `layout/*`, `core/theme`, `core/i18n`, `core/preferences` (browser-local `nw.theme/locale/accent` only) | — | sidebar entries by capability | EN/FR/AR; RTL `dir` | layout 6 / 35, theme 1 / 11 | **CMF**; 4 inert entries (**PH**) |
| Company overview | `/overview` · owner | `company-overview.gateway.ts`, `commercial-summary.gateway.ts` + mocks | demo world | `company.overview.view` | keys; no AR spec | 4 / 30 | **CMF** · CB: CF-11, CF-12, CF-13 (aggregates), ORG-00 |
| Platforms directory, create platform | `/platforms` · owner | `platform-directory.gateway.ts`, `platform-command.gateway.ts` | demo world; create with step-up | `company.platforms.view`, `platform.create` | keys; custom states (skeleton, not `nw-data-state`) | 4 / 21 | **CMF** · list ORG-00/CF-02 (provisional for all of V2); writes exist in Core but are not authoritative before cutover |
| Platform dashboard, Platform subscriptions | `/platforms/:id` · owner or assigned operator | `platform-dashboard.gateway.ts`, `platform-commercial.gateway.ts` | demo world | facade check `platformAccessOf` (collapsed 404) | keys | 3 / 32 | **CMF** · CF-11–CF-13; commercial 🟡 BIL-01 dev-only |
| Organizations directory, detail, create, edit, admin invitations | `/platforms/:id/organizations[/:orgId]` · owner, assigned operator | 5 gateways in `features/organizations/data-access` | demo world | `platformAccessOf`, step-up on commands | keys | 21 / 201 | **CMF** · ORG-00 (list), CF-09 |
| Members, membership decisions, revocation, admin role | `…/:orgId/members[/:membershipId]` | `membership.gateway.ts` | demo world | as above; CF-26/CF-27 recorded (Core has no step-up for some) | keys | (in the 21 above) | **CMF**; P5-S4 suspend/restore **CB** (CF-28–CF-31) |
| Operators directory, detail, Platform access, block/unblock, create | `/operators[/:id]` · owner | 3 gateways in `features/operators/data-access` | demo world | `company.operators.view` + per-command capabilities | keys | 11 / 103 | **CMF** · directory CF-03 (provisional); CF-32–CF-35 |
| Licenses & entitlements, Platform/Organization subscriptions | `/licenses`, `/licenses/platforms/:id` · owner | `licenses.gateway.ts`, `organization-commercial.gateway.ts` | demo world | `company.commercial.view` | keys | 4 / 37 | **CMF (read)** · CF-36–CF-39, CF-42; commands **CB** CF-41 (P7-S4) |
| Billing & payment follow-ups | `/billing` · owner | `billing.gateway.ts` | demo | `company.commercial.view` | keys | 3 / 26 | **PART** · invoices/payments CF-40, CF-66 |
| Assistance & Settlements (A1–A12) | `/billing/assistance[/disputes|settlements|recovery|:requestId]` · owner | `assistance.gateway.ts` (13 reads), `assistance.mock.ts`, 5 facades | 15 own + 2 foreign cases; normal/empty/unavailable | `company.assistance.view` per route; gateway context | EN/FR/AR incl. AR render specs | 26 / 277 | **CMF, accepted** (`docs/review/assistance-a12/README.md`) · CF-68–CF-71, CF-77, D-A4, dev-only |
| Refunds, Payment disputes/chargebacks, fraud holds, reconciliation, write-off, provider-fact association | none | none (receipt purposes exist in `core/authorization/purpose-registry.ts:186`) | — | `financial-authority.ts` rules (headless) | — | — | **MISS** (F2–F12 not authorized) · CF-65, CF-66, CF-67, CF-74, CF-75, CF-77; dev-only modules (`CORE-INTEGRATION.md` §11.3) |
| Fees, caps, delegations, proposals | none | none | — | rules in `financial-operation.ts` | — | — | **MISS** · CF-72 (no reads) |
| Financial authorization foundation (F1) | none (headless) | `core/authorization/*` (5 163 lines: registry, authority, receipt model/gateway/secret/failures, mock, run) | `authorization-receipt.mock.ts` (not bound to any domain) | owner/operator matrix | — | 10 / 101 | **PART** (S1–S5 done; S6 UI, S7 fixtures **MISS**) |
| Audit (simulated activity) | `/audit` · owner | `activity.gateway.ts` | simulated, labelled | `company.audit.view` | keys | 3 / 23 | **PART** · AUD-03/04 dev-only; CF-04, CF-45, CF-47; legal holds **MISS** |
| Releases information | `/releases` · owner | `release-information.gateway.ts` | demo | `company.releases.view` | keys | 3 / 12 | **PART** (information page; no catalog) · CF-05 |
| Services & health | `/services` · owner | `core/core-services/service-inventory.gateway.ts` | demo | `company.services.view` | keys | 2 / 7 | **CMF (inventory)** · CF-06 |
| Monitoring | sidebar only | none | — | — | — | — | **PH** · CF-06 |
| Notifications (personal) | `/notifications` · every signed-in person | `core/notifications/notification-summary.gateway.ts` | unread count | none needed | keys | 2 / 9 | **PART** (count only) · CF-14, CF-44, CF-48 |
| Files | sidebar only | none | — | — | — | — | **PH** · CF-71 (no human File route) |
| Users & identity (company-wide) | sidebar only | none | — | — | — | — | **PH** · CF-03 |
| Organizations (company-wide entry) | sidebar only | none (per-Platform directory exists) | — | — | — | — | **PH** · ORG-00/CF-02 |
| Settings hub, appearance, language, account | `/settings[/appearance|language|account]` · everyone | session / browser preferences | — | none needed | EN/FR/AR incl. AR specs | 19 / 260 (all Settings) | **CMF** |
| Company settings | `/settings/company` · owner | `company-settings.gateway.ts` | demo | `company.settings.view` | keys | (above) | **CMF (read only)** · CF-49 |
| Owner security: overview, add authenticator, secret key, remove factor, change password | `/settings/security[/…]` · owner | `account-security.gateway.ts`, `step-up.gateway.ts` | demo | per-command capabilities | keys | (above) | **CMF** · CF-54–CF-64; passkey registration **MISS**; sessions list **MISS** (CF-51) |
| Platform settings (P9-S5) | none | none | — | — | — | — | **MISS** (planned, S5-0 first) |
| Design-system gallery | `/foundation` · anyone | `features/foundation` | — | **no guard** | — | 1 / 2 | **CMF** (verification surface) — exposure is an Owner decision |
| CI and deployment | `.github/workflows/admin-ci.yml`, `admin-deploy.yml` | production image, nginx | — | — | — | CI green | **CMF** for a static frontend; CSP **MISS** |

## 3. Route and gateway coverage matrix

All 28 gateways, their adapters and the route that uses them. "Demo" = bound by `src/app/demo/demo-bindings.ts` (24 `DemoDomain`s,
`core/config/app-environment.ts:5-29`). "Prod" = `Unavailable…` class. "HTTP" = an adapter that calls Core: **none exists**.

| Gateway | Route | Demo | Prod | HTTP | Core read state (register) |
|---|---|---|---|---|---|
| `AuthGateway` | `/login/*` | auth | ✅ | ❌ | 🟢 routes exist; D-A4 |
| `StepUpGateway` | every step-up command | stepUp | ✅ | ❌ | 🟢 (T1) |
| `ReceiptStepUpGateway`, `AuthorizationReceiptGateway` | none yet | **not bound** (mock exists: `core/authorization/authorization-receipt.mock.ts:188`) | ✅ class exists, not bound | ❌ | 🟡 dev-only (AUTH-0x receipts) |
| `ScopeDirectoryGateway` | shell, scope | scopeDirectory | ✅ | ❌ | 🔴 ORG-00 |
| `ServiceInventoryGateway` | `/services` | services | ✅ | ❌ | 🔴 CF-06 |
| `NotificationSummaryGateway` | shell, `/notifications` | notificationSummary | ✅ | ❌ | 🔴 CF-14 |
| `ActivityGateway` | `/audit` | activity | ✅ | ❌ | 🟡 AUD-03/04 dev-only |
| `AssistanceGateway` | `/billing/assistance/*` | assistance | ✅ | ❌ | BIL-26/28/32 dev-only; rest none (CF-70) |
| `BillingGateway` | `/billing` | billing | ✅ | ❌ | 🔴 CF-40/66 |
| `CompanyOverviewGateway`, `CommercialSummaryGateway` | `/overview` | companyOverview, commercialSummary | ✅ | ❌ | 🔴 CF-11–13 |
| `LicensesGateway` | `/licenses` | licenses | ✅ | ❌ | 🔴 CF-36–39 |
| `OperatorAccountGateway`, `OperatorAssignmentGateway`, `OperatorDirectoryGateway` | `/operators` | operators | ✅ | ❌ | commands 🟢, directory 🔴 CF-03 |
| `AdminInvitationGateway`, `MembershipGateway`, `OrganizationCommandGateway`, `OrganizationCommercialGateway`, `OrganizationGateway` | `/platforms/:id/organizations/*` | adminInvitations, memberships, organizationCommands, organizationCommercial, organizations | ✅ | ❌ | 🟢 except lists (ORG-00) |
| `PlatformCommercialGateway`, `PlatformDashboardGateway` | `/platforms/:id` | platformCommercial, platformDashboard | ✅ | ❌ | BIL-01 dev-only; 🔴 aggregates |
| `PlatformCommandGateway`, `PlatformDirectoryGateway` | `/platforms` | platformCommands, platformDirectory | ✅ | ❌ | writes 🟢 (non-authoritative), list 🔴 |
| `ReleaseInformationGateway` | `/releases` | releases | ✅ | ❌ | 🟡 REL dev-only; CF-05 |
| `AccountSecurityGateway`, `CompanySettingsGateway` | `/settings/*` | accountSecurity, companySettings | ✅ | ❌ | 🟢 owner security; 🔴 CF-49 |

`docs/CORE-INTEGRATION.md` §11.9 still counts "25 gateways, 21 mock adapter files, 143 spec files" at `cf4b1a9`; the baseline has
28 gateways and 180 spec files (stale, documentation only).

## 4. Role and permission matrix

Source: `core/access/capability-policy.ts:120-150` (owner set), `capabilitiesOf` (operator: **no** capability), `canEnterPlatform`.

| Capability / surface | Company owner | Platform operator | Enforcement in Admin (UX) |
|---|---|---|---|
| Company scope, overview, Platforms directory, Operators, Licenses, Billing, Assistance, Audit, Services, Releases, Company settings | ✅ | ❌ | route `capabilityGuard` → `/forbidden`; facade refusal |
| Owner security (factors, secret key, password) | ✅ | ❌ | route + facade |
| Platform create, Organization create, operator create/block/access | ✅ | ❌ | per-command capability + step-up |
| Platform dashboard and its Organizations / members | ✅ (any Platform of the Company) | ✅ (assigned Platforms only) | facades: `platformAccessOf` / `canEnterPlatform`, collapsed 404 |
| Personal notifications, settings hub, appearance, language, account | ✅ | ✅ | none needed |
| Financial operations (F1 registry) | per `financial-authority.ts` (owner operations, receipt/step-up) | fee proposals only (per F1 design §4) | headless rules only; **no UI** |

Core authorizes every request; Admin's checks are UX. Owner/operator refusal is covered by specs in every feature (operator-related
specs per feature: activity 3, assistance 13, auth 8, billing 3, company-overview 3, licenses 4, notifications 1, operators 11,
organizations 18, platform-dashboard 3, platforms 3, releases 3, services 2, settings 17). No permission leak was found in the
capability policy or route table.

## 5. Financial authorization readiness (F1)

| Requirement | Present (evidence) | Missing |
|---|---|---|
| Purpose-specific step-up | `purpose-registry.ts` (receipt purposes `:186-195`, service-verified assistance purposes `:203-206`), `step-up-proof.ts` branded proofs | UI factor chooser bound to a purpose |
| Single-use receipts | `receipt.model.ts`, `receipt.gateway.ts`, mock enforces issuance, expiry, replay and consumption (`authorization-receipt.mock.ts`) | binding in a demo domain; contract fixtures (F1-S7) |
| In-memory secret disposal | `receipt-secret.ts` (`toString`/`toJSON` redaction), `receipt-holder-scope.ts`, `receipt-secret-access.ts`; no browser storage except preferences (`core/preferences/preference-store.ts`) | UI-level guarantees (no secret in DOM, logs or URLs) once a dialog exists |
| Authorization success ≠ financial completion | `financial-authorization-run.ts`: separate `ReceiptAuthorizationState` and `FinancialOutcomeState`; `AuthorizationEnd` includes `outcomeUncertain`, `spent`, `voided` | presentation of the two machines |
| Uncertain outcomes | `uncertain-financial-targets.ts`, `receipt-failure.ts` `resubmissionPolicy`; CF-74 routes never resent | UI wording and reconciliation affordance |
| Owner vs operator | `financial-authority.ts` (`financialDecision`, "operators inherit nothing from owners" `:55`), `financial-operation.ts` (`FINANCIAL_OPERATIONS`, availability `developmentOnly|simulationOnly|unavailable`) | wiring to the capability policy (deliberately later) |
| **F1-S6** shared step-up and authorization UI | reusable primitives: `nw-dialog`, `nw-form-field`, `nw-inline-alert`, `nw-button`, `shared/ui/totp-setup`; `core/actions/action-run.ts` phases; 11 local step-up entries to learn from | a shared step-up block (factor + code), a receipt authorization dialog over `FinancialAuthorizationRun`, simulated labels, EN/FR/AR, RTL, a11y, specs |
| **F1-S7** contract fixtures | — (`core/authorization/testing/` does not exist) | JSON fixtures of Core DTOs and codes citing source lines; mapping specs over them; HTTP-adapter checklist |

The F1 design (`docs/design/f1-financial-authorization.md` §13, F1-S4) planned the demo receipt adapter under `src/app/demo/authorization/*`
with its own `DemoDomain`; the merged code keeps it in `core/authorization/` and binds no domain. Production-bundle safety is covered by
the marker in `tools/check-production-bundle.mjs:20`. A demo domain is needed before any consumer.

## 6. Core integration dependency register

Columns: **1** missing Core capability · **2** development-only Core capability · **3** available approved Core capability ·
**4** missing Admin HTTP adapter · **5** architecture or Owner decision · **6** environment or deployment blocker.

| Id | What | 1 | 2 | 3 | 4 | 5 | 6 | Blocks in Admin |
|---|---|---|---|---|---|---|---|---|
| **D-A4** | browser session: memory (dev) → token-handler BFF (ADR-0050 D13) or Core cookie mode (A16) | (cookie mode) | | refresh in body (`CORE-INTEGRATION.md` §11.7) | ✔ every adapter | **✔** | | **every** HTTP adapter |
| CF-01 | refresh-token storage | ✔ | | | | ✔ (D-A4) | | auth adapter |
| CF-07 | Admin origin in `CORS_ORIGINS`, exposed headers | | | mechanism exists | | | **✔** production action | any call from the browser |
| CF-15 | owner sign-in details to verify | | | 🟢 | ✔ | | | auth adapter |
| **ORG-00** / CF-02 | human hierarchy reads | ✔ (no V2 route) | | | | | | Platforms/Organizations lists, overview counts (provisional all of V2) |
| CF-03 | owner directories of operators and members | ✔ | | | | | | Operators directory, Users & identity |
| CF-11–CF-13 | aggregates, growth, attention signals | ✔ | | | | | | overview, dashboard |
| CF-36–CF-42 | commercial reads and commands | ✔ | BIL-01 commercial config | | | | | Licenses, subscriptions, P7-S4 |
| **CF-65** | owner refund-case list | ✔ | refund cases by id | | ✔ | | | refunds UI |
| **CF-66** | owner discovery of payments/purchases/invoices | ✔ | | | ✔ | | | refunds, billing |
| **CF-67** | owner fraud-hold list | ✔ | place/release/read by id | | ✔ | | | fraud holds UI |
| **CF-68** | owner recovery-obligation list | ✔ | BIL-28 by id; BIL-33 partial | | ✔ | | | Assistance recovery (real) |
| **CF-69** | owner late-settlement list | ✔ | BIL-32 by id; BIL-33 partial | | ✔ | | | Assistance settlements (real) |
| **CF-70** | owner read/list of assistance requests, disputes | ✔ | commands BIL-19/22 | | ✔ | | | Assistance directory, case (real) |
| **CF-71** | human File evidence path | ✔ 🔴 | grants service-only | | | ✔ (Core design) | File prod M8/DG-2 | evidence upload/open; fraud holds; Path B |
| CF-72 | reads of fee caps, delegations, proposals | ✔ | commands | | ✔ | | | fees UI |
| CF-73 | Core roadmap Admin section stale | doc | | | | | | — |
| **CF-74** | repeat semantics without `Idempotency-Key` | ✔ (contract) | | | | | | fraud holds, surplus record, write-off (uncertain stays blocked) |
| CF-75 | owner read of a receipt's state | ✔ | | | | | | receipt recovery after page loss |
| CF-76 | same-key replay order for T2 | ✔ (contract) | | | | | | T2 resend (never today) |
| **CF-77** | BIL-33 end-of-results | ✔ (contract) | BIL-33 | | ✔ | | | any BIL-33 list |
| Financial deployment / certification | S3–S6 CONDITIONAL PASS (dev/sim); S-INT not run; Billing not deployed; 56 handlers mount nothing in production (`CORE-INTEGRATION.md` §11.3, §11.10) | | **✔** | | | ✔ DG-4 (A10 Billing) | **✔** | every financial adapter |
| CF-04, CF-45, CF-47 | audit: platform-level, safe projection, window rules | ✔ | AUD-03/04 dev-only | per-Organization owner read 🟢 | ✔ | | Audit prod at migration 0003 | Audit (real) |
| CF-05 | release catalog read | ✔ | REL dev-only | | | | | Releases |
| CF-06 | operator-facing health | ✔ | | | | | | Services, Monitoring |
| CF-14, CF-44, CF-48 | notifications | ✔ | | | | | | Notifications |
| CF-49–CF-64 | settings and owner security gaps | ✔ (various) | | 🟢 owner security routes | ✔ | | | Settings (real) |
| CSP | production Content-Security-Policy | | | | | ✔ (needs no-flash hash, Core origins) | **✔** `deploy/nginx.conf` | real session |

**Frontend-only now:** CSP with `'self'` (no Core origin needed yet), F1-S6, F1-S7, governance docs, tests. **Core-owned first:**
everything in column 1. **Owner decisions:** D-A4, CSP policy, inert sidebar entries, `/foundation` exposure, test-tool dependencies.

## 7. Design and UX findings

| # | Finding | Evidence | Severity |
|---|---|---|---|
| U1 | Four inert sidebar entries for the owner | `navigation.ts:46,47,88,97`; `sidebar.html` `sidebar__item--unavailable` | medium (clarity) |
| U2 | Step-up entry implemented 11 times in features | `grep 'one-time-code'` in operators, organizations, platforms, settings | medium (consistency, future duplication) |
| U3 | Platforms directory uses its own loading/empty/error markup (skeletons) instead of `nw-data-state` | `features/platforms/pages/platforms.page.html:35-46`, `:124-125` | low |
| U4 | Breadcrumbs truncate deep trails on narrower desktops | `layout/breadcrumbs/breadcrumbs.scss` (designed) | low (documented A11) |
| U5 | French high punctuation with ordinary spaces (309 strings outside Assistance) | **QF-2** in `docs/ROADMAP.md` | low |
| U6 | Timing-sensitive add-authenticator spec | **QF-1** in `docs/ROADMAP.md`; not reproduced in the A12 runs or this audit's run | low (test reliability) |
| U7 | `/foundation` reachable without session in production | `app.routes.ts` | low (exposure decision) |
| U8 | Demo labelling: every data page carries the demo badge/simulation note (per-feature templates matched: activity, assistance, billing, overview, licenses, notifications, operators, organizations, platform-dashboard, platforms, releases, services, settings; auth has `auth-demo-note`) | `grep shell.demo/simulat` per feature | ok |
| U9 | No permission leak found (operator has no company capability; platform scope checked in facades) | §4 | ok |
| U10 | Accessibility and responsive evidence is **rendered** only for A2/A3 and Assistance (A10–A12); other features rely on unit specs and token contrast (`check:contrast`) | `docs/review/*` | medium (acceptance gap) |

## 8. Test and acceptance coverage findings

| Area | State | Gap |
|---|---|---|
| Route-level integration (real routes + bindings) | Assistance (`features/assistance/testing/assistance-routed-testing.ts`, navigation + acceptance specs); Settings (`RouterTestingHarness` in 2 specs); route-table specs for activity, auth, billing, licenses, notifications, operators, releases, services, settings | **no routed journey** for overview, platforms, platform dashboard, organizations/members, operators, licenses, audit, releases, services, notifications; no route-table spec for company-overview, platforms, platform-dashboard, organizations |
| Owner/operator permission | specs in every feature (§4) | — |
| Cross-Company / cross-Platform isolation | Assistance (UI + mock), organizations/operators (facade specs) | no routed isolation sweep outside Assistance |
| Demo/production separation | `check:production` (bundle markers), `adapterProviders` specs per routes file | — |
| Keyboard / screen-reader semantics | component-level specs; rendered keyboard sweeps only for Assistance | no automated a11y engine (axe not a dependency; adding one needs Owner approval) |
| Localization / RTL | `check:i18n` parity for the whole catalog; Arabic render specs only in assistance (5), settings (7), foundation (1) | no AR/RTL render spec in 12 features |
| Visual regression | none automated (Playwright runs are ad hoc, outside the project) | needs Owner approval for a test dependency and a baseline policy |
| Financial invariants | Assistance (A12 sweep over 15 cases); F1 run spec (53 `it`) | none for future financial screens (do not exist) |
| Error and retry | data-state + retry specs per feature page | routed outage sweep only in Assistance |
| Reliability | 3 consecutive full runs green (A12); this audit's run green | QF-1 open |

## 9. Prioritized PR-sized roadmap

Each slice is independently reviewable. "Core first" = Core work (or a Core decision) must happen before the slice is useful.
Sizes: S ≤ ~300 changed lines, M ≤ ~1 000, L larger.

### P0 — Security, correctness and architecture blockers

| Id | Workstream | Evidence | Missing / expected change | Depends on | Risk | Acceptance criteria | Size | Core first |
|---|---|---|---|---|---|---|---|---|
| G0-P0-1 | Governance docs | `CLAUDE.md` stage table, `ROADMAP.md` §F1 (:340-344) vs PRs #55–#61; Assistance absent; stage-name collision; `CORE-INTEGRATION.md` §11.9 counts | record F1-S1–S5 and Assistance A1–A12 as merged; rename or prefix the Assistance track (e.g. "AS-1…AS-12") or the ROADMAP stages; refresh §11.9 | Owner confirmation of what was authorized | low | stage tables match `git log`; no identifier means two things | S (docs) | no |
| G0-P0-2 | D-A4 decision record | `CORE-INTEGRATION.md` §11.7; ROADMAP D-A4 | Owner chooses BFF (ADR-0050 D13) vs Core cookie mode vs development memory-only; record constraints (forward step-up/idempotency/receipts unchanged, never log) | Owner (+ Core if cookie mode) | high | written decision; HTTP-adapter work unblocked or explicitly deferred | S (docs) | decision |
| G0-P0-3 | Production CSP | `docs/DEPLOYMENT.md` "No Content-Security-Policy yet"; ARCHITECTURE §21 | strict CSP in `deploy/nginx.conf` (`default-src 'self'`, hash of the no-flash script, fonts self-hosted, no Core origin yet); smoke-test assertion | Owner approval (config change) | medium | CI smoke test checks the header; app loads with no CSP violation in all three languages | S | no |
| G0-P0-4 | `/foundation` exposure | `app.routes.ts` | decide: keep public, gate behind demo builds, or remove from production | Owner decision | low | decision recorded; route/production check updated if changed | S | no |

### P1 — Missing or incomplete core Admin workflows

| Id | Workstream | Evidence | Missing / expected change | Depends on | Risk | Acceptance criteria | Size | Core first |
|---|---|---|---|---|---|---|---|---|
| G0-P1-1 (F1-S6a) | Shared step-up block | 11 local step-up entries (§7 U2); `actions.stepUp.*` keys | one reusable factor-and-code component used by **one** existing dialog first (no behaviour change) | F1 authorization by the Owner | medium | migrated dialog's specs unchanged and green; EN/FR/AR, RTL, keyboard | M | no |
| G0-P1-2 (F1-S6b) | Receipt authorization dialog | `financial-authorization-run.ts`; mock unbound | dialog over the run (purpose, factor, verify, submit, uncertain/expired/spent states; authorization vs completion shown separately); a receipt `DemoDomain` binding; no feature wiring | G0-P1-1 | medium | state-machine-driven component specs; secret never in DOM/URL/log (spies); production bundle clean | M | no |
| G0-P1-3 (F1-S7) | Contract fixtures | no `core/authorization/testing/` | JSON fixtures of receipt DTOs and refusal codes citing Core lines at the pinned revision; mapping specs parse them; HTTP-adapter checklist | — | low | fixtures cite file:line; mapping specs green | S–M | no |
| G0-P1-4 | Inert sidebar entries | `navigation.ts:46,47,88,97` | per entry: remove, or route to an honest "not available" page with its Core follow-up (Files CF-71, Monitoring CF-06, Users CF-03, Organizations ORG-00), or point Organizations to the per-Platform directory | Owner decision | low | no unexplained dead item; spec per entry | S | no |
| G0-P1-5 | P9-S5 Platform settings | ROADMAP :372 "P9-S5 Platform settings (S5-0 first)" | S5-0 Core verification, then a read-only page | Owner authorization | medium | per ROADMAP P9 pattern | M | verify first |
| G0-P1-6 | Auth HTTP adapter | `core/auth/auth.gateway.ts` (unavailable in prod) | first HTTP adapter against a local Core, per D-A4 | G0-P0-2, CF-07, CF-15 | high | works against local Core; tokens never in storage/URL/log | L | decision + origin config |
| G0-P1-7 | Financial screens (refunds, fraud holds, reconciliation, Payment disputes, fees) | none | read-first mock screens behind typed gateways, each its own slice (ROADMAP F2–F12) | Owner authorization; for real data CF-65/66/67/72/74/77 and S-INT | high | per slice; never executes money movement in demo beyond simulation | L (many slices) | for real integration |

### P2 — Product completeness and UX

| Id | Workstream | Evidence | Missing / expected change | Depends on | Risk | Acceptance criteria | Size | Core first |
|---|---|---|---|---|---|---|---|---|
| G0-P2-1 | Migrate remaining step-up entries | §7 U2 | move the other 10 entries to the shared block | G0-P1-1 | medium | each migration a small PR with unchanged specs | M (split) | no |
| G0-P2-2 | Platforms states | `platforms.page.html` | adopt `nw-data-state` for empty/error/forbidden, keep skeletons for loading | — | low | specs unchanged in meaning | S | no |
| G0-P2-3 | QF-2 French punctuation | ROADMAP QF-2 | no-break space catalog-wide + `check:i18n` rule | — | low | rule fails on regression | S | no |
| G0-P2-4 | Passkey registration and sessions list | ROADMAP :372; CF-51 | owner passkey registration (WebAuthn client) and own-sessions read | Owner authorization; CF-51 | medium | per P9 pattern | M | verify first |
| G0-P2-5 | Releases, Notifications depth | CF-05, CF-14/48 | only if Core adds reads | Core | low | — | — | yes |

### P3 — Quality, polish and acceptance

| Id | Workstream | Evidence | Missing / expected change | Depends on | Risk | Acceptance criteria | Size | Core first |
|---|---|---|---|---|---|---|---|---|
| G0-P3-1 | Shared routed harness | `features/assistance/testing/assistance-routed-testing.ts` | generalize to `src/app/testing/` and add routed journeys per feature (overview, platforms, dashboard, organizations, operators, licenses, audit, releases, services, notifications), one feature per PR | — | low | each journey: owner path, operator refusal, unavailable + retry, production bindings | M each | no |
| G0-P3-2 | Route-table specs | missing for company-overview, platforms, platform-dashboard, organizations | guard and binding specs like `billing.routes.spec.ts` | — | low | specs green | S | no |
| G0-P3-3 | Arabic/RTL render specs | AR specs only in assistance, settings, foundation | one AR render spec per feature page | — | low | `dir="rtl"`, references `dir="ltr"`, translated headings | S each | no |
| G0-P3-4 | Rendered acceptance per area | `docs/review/*` only A2/A3/Assistance | per-area rendered checks (3 viewports × 2 themes × 3 languages, 11 accents, keyboard) | byte-identical tokens | low | report per area like A12 | M each | no |
| G0-P3-5 | Automated a11y and visual regression | no axe/Playwright dependency | propose tools and baseline policy | **Owner dependency approval** | medium | CI job with stable baselines | M | no |
| G0-P3-6 | QF-1 | ROADMAP QF-1 | wait-until-field fix | — | low | spec stable over repeated runs | S | no |
| G0-P3-7 | Remote branch hygiene | many squash-merged branches remain on origin (e.g. `feat/admin-p3a-organizations`, `claude/*-f1-s*`) | Owner deletes stale branches | Owner | low | only active branches remain | S | no |

**Suggested order:** G0-P0-1 → G0-P0-2 (decision) and G0-P0-3/4 → G0-P1-3 and G0-P1-1 → G0-P1-2 → G0-P1-4 → G0-P3-1/2/3 in parallel
→ remaining P1/P2 as the Owner authorizes. Real HTTP adapters start only after D-A4 and per-capability Core readiness.

## 10. Owner decisions required

| Id | Decision | Why now |
|---|---|---|
| OD-G0-1 | Confirm that F1-S2a, S2b, S3, S4, S5 (PRs #55–#61) were authorized, and whether F1-S6/S7 are authorized next | docs say "not authorized" while the code is merged |
| OD-G0-2 | Naming of the Assistance track vs ROADMAP stages A9–A13 | identifiers collide |
| OD-G0-3 | D-A4: BFF, Core cookie mode, or development memory-only | blocks every HTTP adapter |
| OD-G0-4 | Production CSP now (`'self'` only) vs with the first Core origin | security baseline before any session |
| OD-G0-5 | Inert sidebar entries: remove, explain, or redirect | user clarity |
| OD-G0-6 | `/foundation` in production | exposure |
| OD-G0-7 | Approve test dependencies (axe-core, Playwright test runner) for automated a11y and visual regression, or keep ad hoc runs | acceptance automation |
| OD-G0-8 | Which financial slices (F2–F12) to authorize as mock-first screens while Core lists are missing | scope of P1-7 |

## Appendix A — Verified facts, assumptions, uncertainties, tests not run

**Verified (commands run on the baseline):** routes (`app.routes.ts`, `layout/shell.routes.ts`, every `features/*/*.routes.ts`);
28 gateways (`find -name '*.gateway.ts'`); no `HttpClient` usage; 24 demo domains; owner capability set and empty operator set;
browser storage limited to preferences; F1 files and merge commits (`git log` PRs #55–#61); receipt mock not bound; 11 step-up
entries; test counts per area; full test run 180/2118 green; Core diff `0044b20..c49bd59` has no controller/bootstrap change.

**Assumptions:** remote branches reported "ahead" of `main` are squash-merged history (their PRs are merged), not pending work;
the ROADMAP F1 status text is stale rather than reflecting an unmerged authorization (the Owner merged the PRs).

**Uncertainties:** whether the Owner intends `/foundation` to stay public; whether F1-S6 should also replace the 11 existing step-up
entries (design §13 says "no feature wiring"); production deployment state after `admin-deploy-initial` (2026-10-03) — later
deployments were not inspected.

**Not run:** browser rendering or axe for this audit (no UI changed); `npm run build`/`check:production` (unchanged code; last run
green in A12); CI on this documentation-only branch is listed in its PR.
