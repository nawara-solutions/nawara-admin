# Nawara Admin V2 — Master Roadmap (R0 reconciliation, direct Core verification)

| | |
|---|---|
| Status | **PROPOSAL FOR OWNER APPROVAL.** Read-only reconciliation. Nothing here is implemented, authorized or committed. |
| Prepared | 2026-10-30, under the Owner's "AUTHORIZE DIRECT CORE VERIFICATION" (Option 2) |
| Core evidence | `nawara-solutions/nawara-core`, `main` = **`0044b20cc7278c1d23d71ee1a39c3d8ab9118db9`** (merge of PR #409, committed 2026-10-30T21:14:38+01:00), verified 2026-10-30T20:30:48Z (see §0) |
| Admin evidence | `nawara-solutions/nawara-admin`, branch `claude/gallant-einstein-ip4nif` = `main` merge **`cf4b1a9998f2b1ca4192f691f602a1067155e903`** (PR #51, 2026-10-30T20:33:29+01:00), working tree clean |
| Not used | the original "Complete Product Roadmap & Core V2 Feature Alignment" assignment, the original verified Core handoff and its route appendix, and the Admin frontend audit. None of them was in this session (see §0.4). Production, Nawara Lab 01 and deployed infrastructure were not accessed. |

**Citation form.** `core:<path>:<line>` means `nawara-core@0044b20`; `admin:<path>:<line>` means `nawara-admin@cf4b1a9`.
Paths are relative to the repository root.

**Evidence labels.** **SRC**: read in source at the stated revision. **DOC**: stated by a Core or Admin document at that revision. I
did not verify it against a running system. **INF**: my inference, labelled as such. **UNK**: cannot be determined from the
available evidence.

---

## 0. Revision and freshness verification

### 0.1 Repository identity and authoritative revision

| Check | Result | Evidence |
|---|---|---|
| Repository identity | `origin` = `https://github.com/nawara-solutions/nawara-core` | `git remote get-url origin` on the read-only clone |
| Remote `HEAD` / `refs/heads/main` | both `0044b20cc7278c1d23d71ee1a39c3d8ab9118db9` | `git ls-remote origin HEAD refs/heads/main`, 2026-10-30T20:30:48Z |
| PR #409 (`0044b20`) included | **YES.** It **is** the tip of `main` (merge of `docs/core-v2-stage-certification-records`; its content commit is `b798cdf`) | `git log -1` |
| Later merged changes | **NONE** at verification time | the remote `main` ref equals `0044b20` |
| Last merges before #409 | #408 `18b0089` (real-broker deploy suites on demand), #407 `2029fd6` (Auth fault-isolation tests), #406 `32e3450` (S1e5 certification), #405 `b31f496` (S6 cross-process certification + R6H-5 fix), #404 `f24b760` (S6h-B Billing reconciliation) … | `git log origin/main` |

**How the clone was made.** I made a fresh shallow clone (`--depth 1`) into `/home/user/nawara-solutions/nawara-core`, then fetched
`main` history to depth 400 to test PR ancestry. This touched no existing working tree and switched no branch, and nothing was written
to Core. A read-only clone fetches from the remote by definition; I am recording this because your brief restricted fetching.

### 0.2 Merged versus unmerged changes

| Ref | State on `main` | Note |
|---|---|---|
| PR #405, #406, #407, #408, #409 | **merged** (head is an ancestor of `main`) | `git merge-base --is-ancestor` |
| PR #197–#203, #297, #368 | **not in `main`**; each still has a `refs/pull/N/merge` ref | heads match `dependabot/*` branches (#197–#203, #297, #368). The GitHub API refused this session (`nawara-core` is not attached), so whether each is **open** is **UNK** |
| PR #319 (`fix/cir-s1-idempotent-replay`, head `06b62c1`) | **not in `main`**; no merge ref | Core records it as **"on hold"**, needing separate reconciliation before any Organization-related work (`core:docs/architecture/core-v2-s-execution-roadmap.md:91`, `:461`) |
| Working-tree changes in Core | **none observable**: the clone is fresh, and I cannot see any other Core working tree | — |

### 0.3 Route inventory (the "208-route" check)

The route appendix was not available, so I derived the inventory from source. I parsed every `@Controller` / `@Get|Post|Put|Patch|Delete`
handler under `apps/*/src` (excluding specs). The script is at
`docs/review/r0-core-alignment/tools/routes.py`; its output is in
`docs/review/r0-core-alignment/core-routes.tsv` and, with authorization decorators, `docs/review/r0-core-alignment/core-routes-auth.tsv`.

| Service | Handlers |
|---|---|
| auth-service | 64 |
| billing-service | 64 |
| payment-service | 28 |
| organization-service | 17 |
| file-service | 17 |
| release-service | 8 |
| audit-service | 7 |
| notification-service | 3 |
| **Total** | **208** |

**The count is 208 at `0044b20`.** Because the appendix itself was unavailable, I **cannot prove that it is the same set of 208** the
appendix lists, only that the count agrees. **Differences that could hide behind the same count:**

- shared-library routes (health and docs mounted by `libs/service-kit`) are not counted; Auth's own `GET /auth/health` and `GET /` are;
- 56 of the 208 handlers are in modules that **mount nothing in production** (§3.3), so a production route count would be much lower;
- 8 are the Payment simulation harness, mounted only with simulation enabled outside production (`core:apps/payment-service/src/app.module.ts:57-58`).

By caller type (decorator heuristic; each service still decides authority per request): **104** take a human bearer, **6** take any
authenticated bearer, **17** accept a service token *or* a human bearer, **56** take a service token only, **8** belong to the
simulation harness (service token), and **17** are public, pre-authentication or provider webhooks.

### 0.4 What could not be reconstructed

| Missing input | Effect on this roadmap |
|---|---|
| Original "Complete Product Roadmap & Core V2 Feature Alignment" assignment | **I did not follow its text.** Its exact navigation, financial feature list, wording and acceptance criteria are unknown. This roadmap is built from your two R0 briefs plus verified source. Anything the original assignment required beyond them is **not reconstructable**, for example a specific screen inventory, specific KPIs, or naming conventions for the financial area. |
| Original verified Core handoff (its revision and evidence classifications) | I could not check whether it described `0044b20` or an earlier revision. Every Core claim here rests on the verification above, not on the handoff. |
| Route appendix | Replaced by the source-derived inventory (§0.3). The two can only be compared if you supply the appendix. |
| Admin frontend audit | Replaced by a direct inventory of Admin at `cf4b1a9` (§2). The audit's findings, severity grades and recommendations are unknown. |
| Meaning of "S3–S6" | **Reconstructed from Core:** these are Core V2 execution stages S3 Billing, S4 Payment, S5 assistance and cash, S6 refunds, disputes, recovery, reconciliation and losses (`core:docs/architecture/core-v2-s-execution-roadmap.md:290-405`). |
| Meaning of "ORG-00" | **Reconstructed from Core:** contract-register entry "ORG-00: No Core V2 contract" (`core:docs/architecture/core-v2-d-a2-contract-register.md:298-306`). |
| "Three separate step-up transports" | **Reconstructed from source** (§11.2). |
| Deployment and operational state | Not verifiable by inspecting source (your rule 3). Every "Deployed" and "Operational" cell is labelled DOC or UNK, never inferred from code or CI. |

---

## 1. Executive summary

1. **Core has moved a long way past what Admin documents.** Admin's integration record still says "**Nothing in V2 exists in code**"
   (`admin:docs/CORE-INTEGRATION.md:51`). It was last checked against Core `304064f` (PR #348, 2026-10-24), which is **132 commits** behind
   `0044b20`. Since then Core has merged S2 to S6. This adds **Owner-facing human APIs** for refunds, payment disputes, fraud holds,
   recovery and surplus, late assisted settlement, reconciliation, `FinancialLoss`, signed balances, Platform commercial configuration,
   the personal-product catalog, fees, assistance corrections, Audit Company and Platform timelines with legal holds, and Release reads.
   Core's own Admin section is also stale: it still says Billing and Payment have "**no human administration API**"
   (`core:docs/CORE-ROADMAP.md:686`).
2. **None of it is production capability.** Every S3–S6 module other than the Platform commercial module **mounts no route in
   production**: 56 of the 208 handlers (§3.3). Billing and Payment are not deployed (DOC). Their production disposition is unchanged
   (A10 **DECISION REQUIRED (DG-4)**, A11 **MOVE V3**). Every stage is a **CONDITIONAL PASS for development and simulation only**, with
   **operational acceptance: none in scope** (§15).
3. **Admin's financial area can therefore only be built mock-first and simulation-scoped.** HTTP integration is possible only against
   a local Core running the simulation provider. A production Admin must present these areas as **unavailable**, never as working.
4. **The human-facing contracts have discovery gaps.** You can act on a known id (a refund case, fraud hold, recovery obligation or late
   settlement), but Core offers no Owner **list** for most of them. There is also no Owner read of payments or purchases to start a refund
   from, and **no human route to provide File evidence**, which fraud holds, dispute evidence and external surplus repayment all require.
   I list 19 prerequisites in §10. Several workflows can be designed and mocked but **cannot be completed against Core** until they are
   resolved.
5. **There are three distinct step-up transports** (§11.2). Admin models only the first today: the step-up token (`x-step-up-token`)
   that Auth consumes on its own routes (`admin:src/app/core/auth/step-up.gateway.ts:21-48`). The financial workflows need the third:
   **single-use Auth authorization receipts**. These are issued after an Auth-local, factor-only step-up and presented to Billing or
   Payment. The secret is shown once, expires in 10 minutes, and a lost response voids it.
6. **ORG-00 is decisive for navigation.** Core V2 defines **no Organization route** and defers human hierarchy reads until authority
   activation (F7). Admin's Organization and Platform directories therefore stay provisional (mock) for all of Core V2, whatever happens
   in the financial area.
7. **D-A4 is still undecided and still blocks every HTTP adapter.** Core has no cookie sessions, CORS uses `credentials:false`, and
   refresh tokens are returned in the response body (`core:docs/architecture/core-v2-a4-authentication.md:41`,
   `core:libs/service-kit/src/bootstrap.ts:50`). Cookie sessions and any backend-for-frontend (BFF) are deferred to Core A16
   (`core:docs/architecture/core-v2-a4-authentication.md:111`).
8. **Owner authority dominates.** Of the financial operations, only **fee proposals** are operator actions in Core. Everything else is
   Owner-only and verified live. Admin's current capability policy, which grants operators nothing (`admin:src/app/core/access/capability-policy.ts:142`),
   stays correct for finance. Admin will eventually need a few operator capabilities: fee proposals, the Audit Platform read, and
   Organization metadata edit.
9. **Recommended first slice:** **F0, a documentation-only refresh of Admin's Core baseline to `0044b20`**. It reclassifies contract
   states and records the new Core follow-ups. No code. Admin features stay deferred under your 2026-10-06 priorities unless you
   authorize otherwise (§12, §16, §17).

---

## 2. Current verified Admin implementation map (`cf4b1a9`)

### 2.1 Stage and architecture

- The stage table and current priorities are in `admin:CLAUDE.md`. The latest slice is P9-S4e (owner password change), awaiting review.
  Priorities set 2026-10-06: (1) shared frontend distribution, (2) Drive discovery, (3) remaining Admin business features **deferred**.
- **Adapters:** 25 gateways. **Every adapter is a mock or an `Unavailable…` stub. No `HttpClient` adapter exists**: `grep HttpClient` over
  `src/app` finds nothing outside specs. There are 21 mock adapter files and 143 spec files.
- **Capability policy:** an Owner has 22 capabilities and an operator has **none** (`admin:src/app/core/access/capability-policy.ts:115-147`).
  The only operator check is Platform entry by assignment (`canEnterPlatform`).
- **Step-up:** one purpose-typed gateway for `x-step-up-token` (13 purposes), authenticator code only in the UI
  (`admin:src/app/core/auth/step-up.gateway.ts:5-48`).

### 2.2 Routes, features and Core status

| Admin route | Guard (UX) | Feature / gateway(s) | Core contract today (`0044b20`) | Admin state |
|---|---|---|---|---|
| `/login`, `verify`, `enroll`, `code`, `code/verify`, `confirm`, `no-access`, `platform` | guest/session | `features/auth`, `core/auth/auth.gateway.ts` | 🟢 Auth owner and operator login, enrollment, contact verification (§4) | mock prototype (A4-S1–S4) |
| `/overview` | `company.overview.view` | `company-overview` (`company-overview`, `commercial-summary` gateways) | 🔴 no aggregate (CF-11/12/13) | mock |
| `/platforms`, `/platforms/:platformId` | `company.platforms.view` | `platforms` (`platform-directory`, `platform-command`), `platform-dashboard` | create/edit 🟢 (Organization admin routes); **list 🔴 (ORG-00 / CF-02)** | mock; create mocked (P4-S1) |
| `/platforms/:platformId/organizations[/:organizationId[/members[/:membershipId]]]` | Platform entry | `organizations` (`organization`, `organization-command`, `organization-commercial`, `membership`, `admin-invitation`) | memberships, invitations and admin role 🟢 (Auth); org create/edit 🟢; **list 🔴 (ORG-00)** | mock (P3a–P5-S3b) |
| `/operators`, `/operators/:operatorId` | `company.operators.view` | `operators` (`operator-directory`, `operator-assignment`, `operator-account`) | create, confirm, block, unblock and assignments 🟢; **directory 🔴 (CF-03)** | mock (P6) |
| `/licenses` | `company.commercial.view` | `licenses` | 🔴/🟡: no human subscription or entitlement read (§5, CF-36/37) | mock (P7-S1/S2) |
| `/billing` | `company.commercial.view` | `billing` (`billing.gateway.ts`: "payment follow-ups", CF-40) | **now partly 🟡-dev**: Owner balances, reconciliation, losses and disputes exist in simulation (§4); invoice and payment lists still 🔴 | mock, read-only |
| `/audit` | `company.audit.view` | `activity` | **AUD-03/AUD-04 now exist** (dev; not deployed) | simulated browser (P8-S1) |
| `/releases` | `company.releases.view` | `releases` | **REL-01..03 now exist** (dev; Release not in production) — supersedes CF-05 | information page only (P8-S4) |
| `/services` | `company.services.view` | `core/core-services` | 🔴 (CF-06) | mock (P8-S2) |
| `/notifications` | session | `notifications` | 🔴 NOT-00 (no Notification human route in Core V2) | mock (P8-S3) |
| `/settings`, `/settings/{appearance,language,account,company,security}`, `/settings/security/{add-authenticator,secret-key,password}` | various | `settings` (`account-security`, `company-settings`) | owner factors, secret key and password 🟢; company profile 🔴 (CF-49) | mock (P9) |
| `/forbidden`, `**`, `/session-unavailable`, `/foundation` | — | layout | — | real (no backend) |

Route guards are taken from `admin:src/app/layout/shell.routes.ts:54-222` and `admin:src/app/app.routes.ts:16-46`.

### 2.3 Gaps in Admin's own documentation (drift)

| Item | Drift |
|---|---|
| `admin:docs/CORE-INTEGRATION.md:20-51` | baseline predates Core V2 S1–S6, states "Nothing in V2 exists in code" |
| `admin:docs/CORE-INTEGRATION.md` §9 CF-04, CF-05, CF-38, CF-40 | partly or wholly answered in Core by AUD-04, REL-01..03, BIL-02/03 (Owner catalog read), PAY-12 and the balance reads (dev-only) |
| `admin:src/app/features/billing/data-access/billing.gateway.ts:5-9` | "Payment and Billing offer no owner read …" is no longer fully true (development), and stays true for production |
| `admin:src/app/core/auth/step-up.gateway.ts` | no model of the service-verified or receipt transports |

---

## 3. Core architecture and service inventory (`0044b20`)

### 3.1 Services

| Service | Owns | Human surface for Admin | Production (DOC) |
|---|---|---|---|
| auth-service | identity, sessions, MFA, step-up, grants, memberships, operators, Platform assignments, **authorization receipts** | yes (49 human-bearer handlers) | **in production**, but running a legacy image that has drifted from the recorded digest (`core:docs/CORE-ROADMAP.md:53-62`); S-stage code not deployed (G-7) |
| organization-service | Company → Platform → Organization records (**non-authoritative**; Auth owns the hierarchy) | 4 admin writes; reads are service-only | in production, not authoritative |
| audit-service | audit records, Company and Platform scope, legal holds | Owner Organization read (V1); AUD-03/04, legal holds (S2) | in production at migration 0003; S2-Audit needs 0004 (M9) and later (`core:docs/architecture/core-v2-s-execution-roadmap.md:227-229`, `:271`) |
| release-service | products, components, releases, compatibility policy | Owner reads and two Owner commands | **not in production** (MOVE V3) |
| billing-service | catalog, invoices, routing, subscriptions, personal purchases, fees, assistance, refund cases, fraud holds, recovery, late settlements, reconciliation, `FinancialLoss` | 47 human-bearer handlers (mostly Owner) | **not in production**; A10 DG-4 |
| payment-service | payments, attempts, provider facts, finality, refunds, disputes, reconciliation, balances | Owner disputes, reconciliation and balances (via service-or-user guard) | **not in production**; A11 MOVE V3 |
| file-service | files, evidence grants, holds, tickets | **none**: service tokens only (`core:apps/file-service/src/grants/grant.controller.ts:41-42`) | not in production (M8, DG-2) |
| notification-service | delivery | **none** (NOT-00) | not in production (DG-3) |

Shared libraries: `libs/service-kit` (bootstrap, CORS `credentials:false`, events, provenance) and `libs/audit-contract`.

### 3.2 Architecture rules Admin must respect (SRC/DOC)

- **ADR-0041 / ADR-0050.** Administrative capabilities are domain-owned, client-neutral APIs. A privileged human presents their **own**
  bearer and the target service verifies it live through Auth. Headers, bodies and links are never authority. A future BFF may only
  forward the human's bearer (`core:docs/CORE-ROADMAP.md:654-660`).
- **Fail closed.** Every human authority is verified live per request. If Auth is unavailable the answer is `503` with no mutation
  (`core:docs/architecture/core-v2-d-a2-contract-register.md:38-40`).
- **Collapsed 404.** Cross-Company and cross-Platform reads answer `404` whether the record is missing or forbidden
  (`core:docs/architecture/core-v2-s6-financial-certification.md:135-136`).
- **Stable codes.** Behaviour branches on HTTP status and `code`, never on `message` (ADR-0054).
- **Idempotency classes** (`core:docs/architecture/core-v2-d-a2-contract-register.md:49-64`):
  - class M (money) means 90 days with a permanent uniqueness key; `Idempotency-Key` is required, a replay returns the stored outcome,
    a different body under the same key gives `409`, and a concurrent duplicate gives `409 idempotency_key_in_use`;
  - class X (receipt issuance) never returns a stored response.

### 3.3 Production refusal (SRC)

| Module (service) | Production behaviour | Evidence |
|---|---|---|
| Billing `CheckoutModule` (BIL-10) | empty module | `core:apps/billing-service/src/checkout/checkout.module.ts:17` |
| Billing `AssistanceModule` (BIL-13–22, BIL-26) | empty module | `core:apps/billing-service/src/assistance/assistance.module.ts:27` |
| Billing `RefundModule` (refund cases + **fraud holds**) | empty module | `core:apps/billing-service/src/refunds/refund.module.ts:33`, `:41` |
| Billing `RecoveryModule` | empty module | `core:apps/billing-service/src/recovery/recovery.module.ts:21` |
| Billing `LateSettlementModule` | empty module | `core:apps/billing-service/src/late-settlements/late-settlement.module.ts:21` |
| Billing `ReconciliationModule` | empty module | `core:apps/billing-service/src/reconciliation/reconciliation.module.ts:20` |
| Payment `RefundsModule`, `DisputesModule`, `ReconciliationModule` | empty unless refunds are configured **and** the environment is not production | `core:apps/payment-service/src/refunds/refunds.module.ts:23`; `.../disputes/disputes.module.ts:21`; `.../reconciliation/reconciliation.module.ts:17` |
| Payment `SimulationModule` | only with simulation enabled and not production | `core:apps/payment-service/src/app.module.ts:57-58` |
| **Billing `PlatformsModule`** (billing_platform, fees, Owner catalog) | **mounted in all environments**; Billing itself is not deployed | `core:apps/billing-service/src/platforms/platforms.module.ts:21`; `core:apps/billing-service/src/app.module.ts:112` |

---

## 4. Complete relevant Core API mapping (Core route → Admin)

Legend:
- **Caller** is the guard at `0044b20`.
- **Step-up**: T1 = Auth-local `x-step-up-token`; T2 = `x-step-up-token` forwarded to a service that verifies and consumes it through
  `POST /auth/step-up/verify`; T3 = authorization receipt (§11.2).
- **Prod**: whether the route exists in a production build (SRC for refusal; DOC for deployment).
- **Admin**: the existing or proposed Admin surface.

Service-only, public and webhook routes Admin must never call (product, service and provider paths) are grouped at the end of the section.

### 4.1 Auth (human)

| Route | Caller | Step-up | Admin |
|---|---|---|---|
| `POST /auth/login`, `POST /auth/admin/login/owner/{webauthn-options,verify}` | public / pre-auth | — | `/login`, `/login/verify` |
| `POST /auth/admin/enroll/{totp,totp/confirm,webauthn/options,webauthn}` | pre-auth enrollment / owner | — | `/login/enroll` |
| `POST /auth/admin/login/operator/{request-code,verify-code}` | public | — | `/login/code[/verify]` |
| `POST /auth/admin/operators/confirm` | owner | — | (operator confirmation flow) |
| `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `GET /auth/grants` | any bearer | — | session core (blocked on D-A4) |
| `POST /auth/step-up/verify` | any bearer | consumes T2 | **never called by Admin** (services call it with the human's bearer) |
| `GET /auth/admin/factors`; `POST /auth/admin/factors/{totp,totp/confirm,webauthn/options,webauthn}`; `DELETE /auth/admin/factors/:id` | owner | T1 `owner.factor.enroll` / `.remove` | `/settings/security/*` |
| `POST /auth/admin/step-up/webauthn-options`, `POST /auth/admin/step-up` | owner | issues T1/T2/T3 proofs | step-up dialog |
| `POST /auth/admin/secret-key/rotate`, `POST /auth/admin/password/change` | owner | T1 factor-only | `/settings/security/{secret-key,password}` |
| `POST /auth/admin/recovery/{start,complete,cancel}` | pre-auth / owner | — | not built (CF-57/58) |
| `POST /auth/admin/operators`; `.../:id/{block,unblock}` | owner | T1 `operator.create` (create only) | `/operators` |
| `GET/POST/DELETE /auth/admin/operators/:id/platform-assignments[/:platformId]` | owner | T1 `platform_assignment.*` | `/operators/:id` |
| `POST /auth/admin/members/:id/{suspend,restore}` | owner | T1 `account.suspend` / `.restore` | **deferred** (P5-S4, CF-28–31) |
| `GET /auth/platform-access/:platformId` | owner, operator | — | Platform entry check |
| `GET /auth/admin/organizations/:id` | owner, operator | — | organization detail (the only human hierarchy read) |
| `/auth/organizations/:organizationId/{join-codes,memberships,admin-invitations}…` (12 routes) | owner, operator, member (service decides) | T1 for join codes, admin invitations and admin role (owner) | `/platforms/:p/organizations/:o/members` |
| `POST /auth/admin/hierarchy-references/:kind/:id/repair` | any bearer (owner checked) | T1 `hierarchy.reference.repair` | **not in scope** (ADR-0061 activation MOVE V3) |
| **`POST /auth/admin/authorization-receipts`** (AUTH-01) | owner | consumes T3 step-up; `Idempotency-Key` (class X) | **new: receipt service (F1)** |

Evidence: `core:apps/auth-service/src/**/*.controller.ts` (lines in `docs/review/r0-core-alignment/core-routes.tsv`); step-up purposes in
`core:apps/auth-service/src/owner/step-up.service.ts:23-100`.

### 4.2 Organization (human)

| Route | Caller | Step-up | Admin |
|---|---|---|---|
| `POST /organization/admin/platforms` | owner | T2 `platform.create` | Create platform (P4-S1) |
| `PATCH /organization/admin/platforms/:id` | owner | none | (name edit; not built) |
| `POST /organization/admin/organizations` | owner, **or** an assigned operator, with step-up | T2 `organization.create` | Create organization (P3b-S1). **Operators cannot step up** (CF-08), so in practice owner only |
| `PATCH /organization/admin/organizations/:id` | owner, assigned operator, org admin | none | Edit organization (P3b-S2) |
| reads `GET /organization/{companies,platforms,organizations}[/:id]` | **service token only** (`hierarchy.read`) | — | **cannot be used by Admin (ORG-00)** |

Evidence: `core:apps/organization-service/src/admin/admin.controller.ts:78,113,136,170`;
`core:apps/organization-service/src/organizations/organizations.controller.ts:50-63`.

### 4.3 Audit and Release (human)

| Route | Caller | Step-up | Prod | Admin |
|---|---|---|---|---|
| `GET /audit/owner/organizations/:organizationId/records` (AUD-07) | owner | — | V1 route deployed (DOC); AUD-07 verified-only rule needs S2 deployment | `/audit` |
| `GET /audit/owner/company/records` (AUD-03) | owner (Company scope, ≤31 days, 100 per page) | — | not deployed (M9/G-7/AP-R) | `/audit` (Company timeline) |
| `GET /audit/operator/platforms/:platformId/records` (AUD-04) | **operator** (live assignment) | — | not deployed | **new operator surface** |
| `POST /audit/owner/company/legal-holds[/:holdId/release]` | owner | T2 `audit.legal_hold.place` / `.release` | not deployed | new |
| `GET /release/admin/products`, `…/releases`, `…/compatibility-policy/history` (REL-01..03) | owner | — | Release not in production | `/releases` (replaces CF-05 placeholder) |
| `POST /release/admin/…/releases/:version/withdraw`, `POST …/compatibility-policy` | owner | T2 `release.withdraw`, `compatibility_policy.change` | not in production | new (owner commands) |

Evidence: `core:apps/audit-service/src/owner/scoped-query.controller.ts:44-59`; `core:apps/audit-service/src/legal-hold/legal-hold.controller.ts:46,61`;
`core:apps/release-service/src/admin/{read,admin}.controller.ts`.

### 4.4 Billing (human)

| Route (register id) | Caller | Step-up | Prod route | Admin |
|---|---|---|---|---|
| `POST/GET /billing/admin/platforms/:platformId` (BIL-01) | Platform owner (live `/auth/platform-access`) | — | mounted; Billing not deployed | Platform commercial configuration |
| `GET/POST /billing/admin/platforms/:platformId/products`, `…/products/:productId/prices`, `…/archive`, `…/prices/:priceId/retire` (BIL-02/03, S3g) | Platform owner | — | mounted; Billing not deployed; **catalog gate: OD-05 values OPEN** | Platform catalog |
| `PUT …/fee-caps`, `POST …/fee-delegations[/:delegationId/revoke]`, `POST /billing/admin/fee-proposals/:id/{approve,reject}` (BIL-04/05/07) | owner (`FeeActorKind('owner')`) | — | mounted; not deployed | Platform fees (owner) |
| `POST /billing/platforms/:platformId/fee-proposals[/:id/withdraw]` (BIL-06) | **operator** (`FeeActorKind('operator')`, needs a delegation) | — | mounted; not deployed | Platform fees (operator) |
| `POST /billing/admin/assistance-requests/:id/corrections` (BIL-19) | owner | **T2** `billing.assistance.correct` | **refused** | Assistance oversight |
| `POST /billing/admin/assistance-disputes/:id/resolution` (BIL-22) | owner | **T2** `billing.assistance.dispute.resolve` | refused | Assistance oversight |
| `GET /billing/organizations/:organizationId/restrictions` (BIL-26) | service, or a human whose authority the service decides (Platform owner or Organization actor) | — | refused | Organization finance panel |
| `POST /billing/admin/refund-cases`, `GET …/:id`, `POST …/:id/authorizations` (BIL-23/24/25), `POST …/:id/cancel` | owner (`RefundOwnerGuard`) | **T3** `refund` receipt (`refund.authorize`) on authorizations | refused | Refunds |
| `POST /billing/admin/fraud-holds`, `POST …/:id/release`, `GET …/:id` (BIL-27) | owner | **T3** `fraud_hold_place` / `fraud_hold_release` + File evidence grants | refused | Fraud holds |
| `GET /billing/admin/recovery-obligations/:id` (BIL-28) | owner (read only) | — | refused | Recovery |
| `POST /billing/admin/recovery-surpluses/:id/resolution` (BIL-30) | owner | **T3** `recovery_surplus_external` + File evidence (Path B) | refused | Recovery / surplus |
| `GET /billing/admin/late-settlements/:id`, `POST …/:id/application` (BIL-32) | owner | **T3** `late_settlement_apply` | refused | Late settlements |
| `GET /billing/admin/reconciliation-cases[/:id]`, `POST …/:id/acknowledgement` (BIL-33) | owner | — (acknowledgement for review-only types) | refused | Reconciliation |
| `GET /billing/admin/financial-losses`, `POST /billing/admin/recovery-obligations/:id/write-off` (BIL-34) | owner | **T3** `recovery_write_off` | refused | Losses / write-off |

Not for Admin (product or member surfaces, **not** operator administration): assistance requests, decline, cash collection,
settlement, disputes, cash-return confirm and return, dispute responses (BIL-13–18, 20, 21); `GET /billing/recovery-obligations/:id`,
`POST …/settlement`, `POST /billing/recovery-surpluses/:id/recipient-confirmation` (BIL-28/29/31, Organization administrator); late-settlement
attestation; `POST /billing/checkout/direct` (BIL-10, member).

Service-only: invoices, payment requests, products and prices (producer), and entitlement reads (BIL-09, BIL-11).

### 4.5 Payment (human via `ServiceOrUserGuard`, Owner verified in the handler)

| Route (register id) | Caller | Step-up | Prod | Admin |
|---|---|---|---|---|
| `GET /payment/admin/disputes`, `GET …/:id` (PAY-09) | owner | — | refused | Disputes |
| `POST /payment/admin/disputes/:id/evidence` (PAY-10) | owner | — (needs a File grant `dispute_evidence`) | refused | Disputes (blocked: §10 H-10) |
| `POST /payment/admin/disputes/:id/decision` (PAY-11) | owner | **T3** `dispute_decision` (`payment.dispute.decide`) | refused | Disputes |
| `GET /payment/admin/reconciliation-items` (PAY-12; `unmatched_fact` and other kinds) | owner | — | refused | Reconciliation (Payment side) |
| `GET /payment/admin/balances`, `GET /payment/admin/payments/:paymentId/balance` (R6H-12) | owner | — | refused | Balances |
| `POST /payment/admin/provider-facts/:id/associations` (PAY-13) | owner | **T3** `provider_fact_associate` | refused | Unmatched facts |
| `GET /payment/payments/:id`, `GET /payment/payments/:paymentId/refunds` | service or user (`payment.read`) | — | payment read: production; refunds read: refused | **UNK** whether an Owner bearer may read a payment (the user path appears payer-scoped; not verified) |

Evidence: `core:apps/payment-service/src/disputes/disputes.controller.ts:48-110`; `core:apps/payment-service/src/reconciliation/reconciliation.controller.ts:35-111`.

**Never callable from Admin:**
- `/payment/simulation/*` (8 routes; service token, simulation only);
- `POST /payment/webhooks/:provider` (signature);
- `/payment/reconciliation/items` (Billing only, PAY-12 consumer);
- `/payment/payments/:paymentId/{captures/:factId,dispute-exposure}`, `/payment/disputes/losses` (service token);
- every File, Notification and Organization read route (service token);
- `/auth/service/authorization-receipts/*` (service token).

---

## 5. Six-level capability matrix

Columns:
1. **Impl**: implemented in source.
2. **Merged**: on `main` at `0044b20`.
3. **Tested / certified**: CI evidence and stage verdict.
4. **Human API**: a route usable with the operator's own bearer, including discovery.
5. **Deployed**: running in an environment.
6. **Operational**: accepted operationally.

Deployment and operational state are **never inferred from code or CI**. "NO (SRC)" means a production build mounts no route, so
nothing usable can be deployed. "DOC" means a Core record states it and I did not verify it.

| # | Capability | 1 Impl | 2 Merged | 3 Tested / cert | 4 Human API | 5 Deployed | 6 Operational |
|---|---|---|---|---|---|---|---|
| C01 | Owner sign-in (password + TOTP/WebAuthn) | YES | YES | YES (Auth e2e; V1 certified, DOC `core:docs/CORE-ROADMAP.md:199`) | YES | UNK: Auth is in production (DOC) but on a drifted legacy image (`core:docs/CORE-ROADMAP.md:62`) | UNK |
| C02 | Operator code sign-in | YES | YES | YES | YES | UNK (same) | UNK; production code delivery unverified (Admin CF-19) |
| C03 | Browser session (refresh across reload) | PARTIAL (body tokens only) | YES | YES | **PARTIAL**: no cookie mode, CORS `credentials:false` (D-A4) | UNK | UNK |
| C04 | Owner factors, secret key, password, recovery | YES | YES | YES | YES | UNK | UNK |
| C05 | T1 Auth-local step-up | YES | YES | YES | YES | UNK | UNK |
| C06 | T2 service-verified step-up | YES | YES | YES | YES (Admin sends the token to the target service) | UNK for V1 purposes; NO for S2/S5 purposes (DOC: not deployed) | UNK |
| C07 | T3 authorization receipts (AUTH-01..03) | YES | YES (#351, #352, #391, #393, #396, #398, #400, #402) | YES (S2-Auth PASS dev; S6 cross-process) | YES (AUTH-01) | NO (DOC: G-7/M3) | NO (DOC) |
| C08 | Operator lifecycle and Platform assignments | YES | YES | YES | YES | UNK | UNK |
| C09 | Operator directory (list) | NO | — | — | **NO** (CF-03) | — | — |
| C10 | Member suspend / restore | YES | YES | YES | PARTIAL: no read of account state or list of suspended (CF-28/30) | UNK | UNK |
| C11 | Memberships, join codes, admin invitations, admin role | YES | YES | YES | YES (CF-23–27 caveats) | UNK | UNK |
| C12 | Hierarchy writes (create/edit Platform, Organization) | YES | YES | YES | YES | DOC: in production, **not authoritative** | UNK |
| C13 | Hierarchy human reads (list Companies, Platforms, Organizations) | NO | — | — | **NO (ORG-00, CF-02)**; single org via `/auth/admin/organizations/:id` | — | — |
| C14 | Organization lifecycle (suspend, inactive) | NO (ADR-0060 runtime MOVE V3) | — | — | NO | — | — |
| C15 | Owner Organization audit (V1 / AUD-07) | YES | YES | YES (S2-Audit PASS dev) | YES | V1: DOC yes; AUD-07 rule: NO (needs S2 deployment) | UNK |
| C16 | Owner Company timeline (AUD-03) | YES | YES (#355) | YES (dev) | YES | NO (DOC) | NO |
| C17 | Operator Platform audit (AUD-04) | YES | YES (#355) | YES (dev) | YES (operator) | NO (DOC) | NO |
| C18 | Audit legal holds | YES | YES (#356) | YES (dev) | YES (T2) | NO (DOC; AP-R open) | NO |
| C19 | Release Owner reads (REL-01..03) | YES | YES (#358) | YES (S2-Rel PASS dev) | YES | NO (DOC: MOVE V3) | NO |
| C20 | Release withdraw / compatibility policy | YES | YES | YES | YES (T2) | NO (DOC) | NO |
| C21 | Platform billing configuration (BIL-01) | YES | YES (#366) | YES (S3 CONDITIONAL PASS) | YES | NO (DOC: Billing not deployed) | NO |
| C22 | Owner personal-product catalog (BIL-02/03) | YES | YES (#372) | YES | YES (read + write) | NO | NO; **catalog values OD-05 OPEN** |
| C23 | Fees: caps, delegations (owner); proposals (operator) | YES | YES (#370, #371) | YES | PARTIAL: commands exist, **no read** of caps, delegations or proposals | NO | NO |
| C24 | Organization subscription / entitlement read | YES (service) | YES | YES | **NO**: service-only `entitlement.read` (CF-36/37) | NO | NO |
| C25 | Personal subscriptions / entitlement | YES (service read B6); BIL-12 NOT BUILT | YES | YES | NO | NO | NO |
| C26 | Owner discovery of invoices, payments, purchases | NO | — | — | **NO** (CF-40; invoices list is payer- or producer-scoped) | — | — |
| C27 | Assistance oversight: correction, dispute resolution (BIL-19/22) | YES | YES (#382, #383) | YES (S5a–d CONDITIONAL PASS; **S5 NOT certified**) | PARTIAL: commands by id; **no Owner read or list** of requests or disputes | NO (SRC refusal) | NO |
| C28 | Restrictions read (BIL-26) | YES | YES (#384, #397) | YES | YES (Owner of the Platform, decided per request) | NO (SRC) | NO |
| C29 | Refund cases (open, read, authorize, cancel) | YES | YES (#387–#390, #403, #405) | YES (S6 CONDITIONAL PASS, cross-process) | PARTIAL: **no case list; no payment/purchase discovery** | NO (SRC) | NO |
| C30 | Payment disputes (list, read, evidence, decision) | YES | YES (#391, #392) | YES | PARTIAL: **evidence needs a human File path (none)** | NO (SRC) | NO |
| C31 | Fraud holds | YES | YES (#393, #394, #395) | YES | PARTIAL: **no list; File evidence has no human path** | NO (SRC) | NO |
| C32 | Recovery obligations (Owner read) and surplus resolution | YES | YES (#396, #397) | YES | PARTIAL: read by id; **no list**; Path B needs File evidence | NO (SRC) | NO |
| C33 | Late assisted settlement (L-4) | YES | YES (#398, #399) | YES | PARTIAL: read and apply by id; no list (reachable through reconciliation cases) | NO (SRC) | NO |
| C34 | Billing reconciliation cases | YES | YES (#404) | YES | YES (list + read + acknowledgement) | NO (SRC) | NO |
| C35 | Payment reconciliation items, balances, fact association | YES | YES (#401) | YES | YES | NO (SRC) | NO |
| C36 | `FinancialLoss` list, recovery write-off | YES | YES (#404) | YES | YES | NO (SRC) | NO |
| C37 | Legal remedies (BIL-35) | NO (OPEN) | — | — | NO | — | — |
| C38 | Human File evidence (upload + grant) | NO (service only) | — | — | **NO** | — | — |
| C39 | Personal notification inbox | NO (NOT-00; S7 conditional) | — | — | NO | — | — |
| C40 | Operator-facing service health | NO | — | — | NO (CF-06) | — | — |
| C41 | Simulation provider / harness | YES | YES (#378) | YES | **must never be human** (service token) | NO (refused in production) | — |

Test evidence for C21–C36 is the stage records (`core:docs/architecture/core-v2-s3-billing.md`, `…-s4-payment.md`,
`…-s5-assistance-and-cash-obligations.md`) and the S6 report (`core:docs/architecture/core-v2-s6-financial-certification.md:26-123`). The S6
cross-process run found and corrected one MEDIUM defect (`:142-153`). I did not re-run any suite.

---

## 6. Owner / Operator authorization matrix

Source is the guard and `@Actors` declarations at `0044b20`. The **service decides per request**; Admin's matrix is UX only. "Live"
means Auth is consulted on each request.

| Domain | Action | Owner | Operator | Step-up | Admin capability (proposed name; UX only) |
|---|---|---|---|---|---|
| Platforms | create | ✅ | ❌ | T2 `platform.create` | `platform.create` (exists) |
| Platforms | rename | ✅ | ❌ | — | `platform.edit` (new) |
| Organizations | create | ✅ | ⚠️ allowed by the route, but needs a step-up operators cannot obtain (CF-08, C-5) | T2 `organization.create` | `organization.create` (exists) |
| Organizations | edit metadata | ✅ | ✅ (assigned) | — | `organization.edit` (new; operator too) |
| Organizations | read one | ✅ | ✅ (assigned) | — | Platform entry |
| Organizations | list | ❌ | ❌ | — | (ORG-00: mock only) |
| Memberships / join codes / invitations | per route | ✅ | ✅ per `@Actors` and the service rule | T1 (owner) on join codes, invitations and admin role | existing P5 behaviour unchanged |
| Members | suspend / restore | ✅ | ❌ | T1 factor-only | `member.account.suspend` (deferred) |
| Operators | create, block, unblock, assign | ✅ | ❌ | T1 (create, assign) | existing |
| Audit | Organization (V1) / Company timeline / legal holds | ✅ | ❌ | T2 on holds | `company.audit.view`, `audit.legalHold.manage` (new) |
| Audit | Platform records (AUD-04) | ❌ | ✅ (live assignment) | — | `platform.audit.view` (**new operator capability**) |
| Release | read / withdraw / policy | ✅ | ❌ | T2 on commands | `company.releases.view`, `release.manage` (new) |
| Billing config | `billing_platform`, catalog | ✅ (Platform owner, live) | ❌ | — | `platform.commercial.manage` (new) |
| Fees | caps, delegations, approve, reject | ✅ | ❌ | — | `platform.fees.manage` (new) |
| Fees | propose, withdraw | ❌ | ✅ (with a delegation) | — | `platform.fees.propose` (**new operator capability**) |
| Assistance | correction, dispute resolution | ✅ | ❌ | **T2** | `finance.assistance.manage` (new) |
| Restrictions | read | ✅ (Platform owner) | UNK (the service decides) | — | `finance.restrictions.view` |
| Refunds | open, read, authorize, cancel | ✅ | ❌ | **T3** on authorize | `finance.refunds.manage` |
| Disputes | read, evidence, decide | ✅ | ❌ | **T3** on decide | `finance.disputes.manage` |
| Fraud holds | place, release, read | ✅ | ❌ | **T3** + File evidence | `finance.fraudHolds.manage` |
| Recovery | read; surplus external record; write-off | ✅ | ❌ | **T3** | `finance.recovery.manage` |
| Late settlement | read, apply (L-4) | ✅ | ❌ | **T3** | `finance.lateSettlements.manage` |
| Reconciliation | cases, acknowledgement, Payment items, balances, association | ✅ | ❌ | **T3** on association | `finance.reconciliation.manage` |
| Losses | read | ✅ | ❌ | — | `finance.losses.view` |

Invariants the matrix must keep:
- operators never approve fees (I-18, `core:docs/architecture/core-v2-d-a2-contract-register.md` §3);
- recovery settlement is an Organization administrator action, "never the beneficiary or the Owner" (`core:docs/architecture/core-v2-s6-financial-certification.md:93`), so it is **not** an Admin action;
- members and operators are refused on every Owner financial route (`:135-136`).

---

## 7. Existing versus missing Admin modules

| Module | Exists in Admin | Core support (dev) | Core support (prod) | Classification |
|---|---|---|---|---|
| Authentication | yes (mock) | 🟢 | UNK (drifted image) | keep; HTTP after D-A4 |
| Company overview | yes (mock) | 🔴 aggregates | 🔴 | keep mock |
| Platforms directory / commands | yes (mock) | commands 🟢, list 🔴 | same | keep; list stays mock (ORG-00) |
| Organizations / members | yes (mock) | 🟢 except list | same | keep |
| Operators | yes (mock) | 🟢 except directory | same | keep |
| Licenses & entitlements | yes (mock) | 🔴 human read | 🔴 | keep mock; reframe against ADR-0044 (no "license" entity) |
| Billing follow-ups | yes (mock) | partial | 🔴 | **extend** into Finance |
| Audit (activity) | yes (simulated) | 🟢 AUD-03/04/07 | V1 only | extend: Company timeline, operator Platform view, legal holds |
| Releases | info page | 🟢 REL-01..03 + commands | not in prod | extend (Owner) |
| Services | yes (mock) | 🔴 | 🔴 | keep |
| Notifications | yes (mock) | 🔴 | 🔴 | keep |
| Settings / security | yes (mock) | 🟢 | UNK | keep |
| **Platform commercial configuration** (billing_platform, catalog, fees) | **missing** | 🟡 dev | not deployed | new |
| **Finance: refunds** | **missing** | 🟡 dev (no list) | refused | new |
| **Finance: payment disputes** | **missing** | 🟡 dev | refused | new |
| **Finance: fraud holds** | **missing** | 🟡 dev (File gap) | refused | new (design + mock only) |
| **Finance: recovery and surplus** | **missing** | 🟡 dev | refused | new |
| **Finance: late settlements** | **missing** | 🟡 dev | refused | new |
| **Finance: reconciliation** (Billing cases + Payment items) | **missing** | 🟡 dev | refused | new |
| **Finance: balances and losses** | **missing** | 🟡 dev | refused | new |
| **Finance: assistance oversight** | **missing** | 🟡 dev (no Owner read) | refused | new (blocked on read) |
| **Receipt step-up (T3) service** | **missing** | 🟢 dev | not deployed | new foundation |
| **Service-verified step-up (T2) routing** | partial (only T1 modelled) | 🟢 | UNK | extend |
| **HTTP adapter layer** (interceptor, error mapping, idempotency keys) | **missing** | — | — | new (after D-A4) |

---

## 8. Proposed navigation and information architecture

Principles:
- **Keep every existing route and guard.** New pages extend existing route trees instead of adding top-level siblings.
- **Selecting a Platform or Organization is context, not authentication** (`core:docs/CORE-ROADMAP.md:705-719`).

```text
Company (owner)
├── /overview                              (existing)
├── /platforms                             (existing)  ── list mock (ORG-00)
│    └── /platforms/:platformId            (existing dashboard)
│         ├── organizations/…              (existing)
│         ├── commercial                   NEW  billing_platform · catalog · fees (owner)       [dev-only banner]
│         ├── fees/proposals               NEW  operator: propose/withdraw · owner: approve/reject
│         └── audit                        NEW  operator Platform records (AUD-04)
├── /operators                             (existing)
├── /licenses                              (existing; ADR-0044 vocabulary review)
├── /billing                               (existing route, becomes the Finance hub; owner only)
│    ├── (index)                           existing payment follow-ups + balances summary (R6H-12)
│    ├── reconciliation                    NEW  Billing cases (BIL-33) + Payment items (PAY-12) + unmatched facts (PAY-13)
│    ├── refunds/:caseId                   NEW  case detail, authorize (T3), cancel  — list blocked (H-04)
│    ├── disputes[/:id]                    NEW  PAY-09/10/11 (decision T3; evidence blocked H-10)
│    ├── fraud-holds/:id                   NEW  BIL-27 (place/release T3 + File evidence; blocked H-06/H-10)
│    ├── recovery/:obligationId            NEW  BIL-28 read, BIL-30 surplus (T3), write-off (T3)
│    ├── late-settlements/:id              NEW  BIL-32 read + L-4 application (T3)
│    ├── losses                            NEW  FinancialLoss (BIL-34)
│    └── assistance                        NEW  corrections / dispute resolution (T2) — blocked on Owner read (H-09)
├── /audit                                 (existing) + Company timeline (AUD-03) + legal holds (T2)
├── /releases                              (existing) + REL-01..03 + withdraw / policy (T2)
├── /services, /notifications, /settings   (existing)
```

Additional rules for the new pages:
- Every new financial page carries a **"Simulation — not available in production"** state, driven by the gateway (adapter unavailable
  or Core `404` on an unmounted route). It is never driven by a client flag that could show financial data as real.
- Detail pages without a Core list are reached only from evidence that carries the id: a reconciliation case, a balance row or a
  dispute. Admin never invents ids and never asks the Owner to type financial identifiers as a primary flow.
- Operators see **Platforms → (assigned) → fees/proposals, audit, organizations**, and nothing under `/billing`.

---

## 9. Financial administration roadmap (S3–S6)

For every workflow, **Core is the only authority**. Admin never computes eligibility, amounts, balances, deadlines or outcomes. It
displays Core's answer and submits exactly one Core command. Amounts are never request values for refunds (full purchase only, I-5).

### 9.1 Invariants and finality rules Admin must preserve (SRC/DOC)

| Rule | Core source | Admin consequence |
|---|---|---|
| Explicit immutable routing; `entitlementKind` never routes (I-1) | register §3 | show the routing target read-only; never edit it |
| Organization grace exactly 24 h, Personal none (I-3) | S3 record | display only; never compute |
| Personal and recovery invoices never change `subscription` (I-4) | S3 record | never present a recovery or personal payment as subscription renewal |
| Full-purchase refunds only; one reversal per purchase (I-5) | register §3 | no amount field; no partial refund UI |
| Provider facts immutable, independent of allocation (I-6) | S4 record | facts are evidence views, never editable |
| No second checkout while a payment is uncertain (I-10) | S4c | show "uncertain" as a blocking state, never "failed" |
| Cash alone never activates or settles (I-13, ADR-0068) | S5 record | no "mark paid in cash" action, ever |
| `settleBy = cashCollectedAt + 72h`; overdue derived, never stored (I-12) | S5 record | render Core's derived state only |
| T1/T2/T3/D6 block **new** requests only; discharge always allowed (I-11) | S5 record | restrictions are informational for Admin; never block an Owner discharge or correction in the UI |
| No new refund case while a dispute is open; a completed case refuses new attempts (I-16) | register §3 | surface `refund_dispute_open`, `refund_case_completed` as terminal explanations |
| Provisional dispute never cancels Premium; assisted final loss gives recovery for the base only (I-17) | register §3 | label disputes "provisional" vs "final"; no access changes from Admin |
| Recovery surplus: owed to the school, never revenue, loss or access, no expiry, never re-opens T3 (I-8) | register §3 | surplus is a liability view, never a credit |
| `FinancialLoss` only from evidence facts or an Owner write-off (I-9) | register §3 | write-off is accounting only, "never forgiveness"; T3 stays (`core:docs/architecture/core-v2-s6-financial-certification.md:121`) |
| Balances are signed, never clamped (FC-5) | S6 report §3.6 | render negative values as negative; no `max(0, …)` |
| Unanswered authorization stays an open case until a definitive outcome (Q8, fail-closed) | S6 report §8 | never show "failed" or "released" for an unknown authorization |
| Fee caps set and approved by the Owner; operators only propose (I-18) | register §3 | operator UI has no approve control |
| One currency per Platform (I-19) | register §3 | no currency selector |
| Payment never calls Billing back (I-20) | register §3 | Admin never composes cross-service state as if Payment knew Billing |

### 9.2 Workflow-by-workflow gap analysis

| Workflow (stage) | Core routes | Authority / step-up | Finality and recovery rules | Human-API gap | Admin today | Plan |
|---|---|---|---|---|---|---|
| **Platform commercial configuration** (S3d) | BIL-01 | Platform owner, live platform-access check; immutable `companyId` | write once per Platform | none for the Platform's own config | none | F12 (mock → dev HTTP) |
| **Personal catalog** (S3g) | BIL-02/03 owner routes | Platform owner | archive and retire are terminal; **catalog gate: OD-05 values OPEN** | no Organization-plan catalog for humans | `/licenses` mock | F12; the UI must not suggest real prices before OD-05 |
| **Fees** (S3f) | BIL-04..07 | Owner caps, delegations, approve, reject; operator propose, withdraw | proposals decided once | **no reads** (H-11) | none | F12 (commands mock-first; reads blocked) |
| **Organization subscription / entitlement** (S3b/e) | BIL-09 (service) | — | grace 24 h | **no human read (H-12)**; **no human command at all**: `activate()`/`renew()` retired (S3b) | `/licenses` mock | stay mock; **Admin must not offer "activate/renew license"** |
| **Direct purchase / checkout** (S3f, S4) | BIL-10 (member) | member | finality, class M | not an Admin action | — | none (product apps) |
| **Payments and finality** (S4) | PAY-01..06 | service | closing, uncertain, final; late success never reopens | **no Owner payment list (H-05)** | `/billing` follow-ups mock | read-only view once H-05 exists |
| **Assistance oversight** (S5c) | BIL-19, BIL-22 | Owner, **T2** step-up (`billing.assistance.correct` / `.dispute.resolve`) | corrections append-only (`superseded_by_correction`); no monetary corrections; `cash_not_returned` and `collection_not_made` disputes have no S5c resolution (J-1) | **no Owner read or list of requests and disputes (H-09)** | none | F11 design + mock; blocked for HTTP |
| **Restrictions** (S5d, S6f T3) | BIL-26 | Platform owner (per request) | derived, never stored; D6 not enforced (V-4) | none | none | read panel in the Organization context |
| **Refunds** (S6a–d, R6H-5) | BIL-23/24/25 + cancel; AUTH-01 | Owner; **T3** `refund` receipt bound to case, payment, amount, currency, reason, optional `captureFactId` | full only; capture-specific vs ordinary never interchangeable; lost Auth response recovered **only with the same receipt** (R6B-9); ambiguous dispatch never completes without verified evidence; a completed case refuses all | **no case list (H-04); no payment or purchase discovery (H-05)** | none | F5 |
| **Payment disputes** (S6e-D) | PAY-09/10/11; AUTH-01 | Owner; **T3** `dispute_decision` (contest/accept) | open dispute blocks new refund admission; final full chargeback reverses a direct purchase once; partial chargeback is review-only (policy OPEN) | **evidence requires File grant (H-10)** | none | F6 (decision via T3; evidence disabled) |
| **Fraud holds** (S6e-H) | BIL-27; AUTH-01 | Owner; **T3** `fraud_hold_place` / `_release`; 1–5 File evidence grants | 14-day expiry; exact-duration compensation (C-1); release once | **no list (H-06); no human File evidence (H-10)** | none | F10 design + mock only |
| **Recovery and surplus** (S6f, S6h-B) | BIL-28 owner read; BIL-30; AUTH-01 | Owner reads and records Path B external (**T3** `recovery_surplus_external` + File evidence); settlement is the Organization administrator's (not Admin) | base-only obligation; principal / surplus split by the database; no offset, no expiry | **no obligation list (H-07); Path B File evidence (H-10)** | none | F8 |
| **Late assisted settlement** (S6g) | BIL-32 read + application; AUTH-01 | Owner; **T3** `late_settlement_apply` | never automatic; L-4's five evidence conditions; refused when cash return is confirmed or a purchase exists; full entitlement duration from the application | **no list (H-08)**; reachable through reconciliation cases | none | F9 |
| **Reconciliation** (S6h) | BIL-33; PAY-12; PAY-13; AUTH-01 | Owner; acknowledgement only for review-only types; association **T3** `provider_fact_associate` | twelve case types; resolution only by evidence (database-checked); association append-only; unmatched facts invisible to Billing until associated | none for the lists | none | **F3, F7 (first financial slices: they have lists)** |
| **Balances** (R6H-12) | Payment balances | Owner | signed, never clamped | none | none | F4 |
| **`FinancialLoss` and write-off** (S6h-B) | BIL-34; AUTH-01 | Owner; write-off **T3** `recovery_write_off` | write-off is accounting only; T3 stays; later recovery adjusts append-only; a concurrent recovery gives `write_off_not_permitted` and the Owner re-authorizes | none | none | F4 (read), F8 (write-off) |
| **Legal remedies** (BIL-35) | none | — | — | OPEN in Core | — | deferred |

**Production status of every row above: development and simulation only.** The commercial configuration, catalog and fees module is
mounted but Billing is not deployed. Everything else is refused in production (§3.3).

### 9.3 Receipt-based (T3) flow Admin must implement exactly

1. **Obtain a step-up.** `POST /auth/admin/step-up` with the operation's **Auth-local, factor-only purpose** (TOTP or passkey, never
   the secret key) (`core:apps/auth-service/src/owner/step-up.service.ts:59-97`).
2. **Issue the receipt.** `POST /auth/admin/authorization-receipts` with `x-step-up-token`, a fresh `Idempotency-Key` and the
   **binding**, for example for a refund `{operation, audience, companyId, refundCaseId, paymentId, amount, currency, reason[, legalOverride][, captureFactId]}`
   (`core:apps/auth-service/src/receipts/receipt-binding.ts:158-172`). The response carries the secret **once**
   (`core:apps/auth-service/src/receipts/authorization-receipt.controller.ts:31-40`).
3. **Present the receipt immediately** to the consuming route as `receiptSecret` in the body, with that route's own class-M `Idempotency-Key`.
4. **Never store the secret** anywhere: not in a store, a log, a URL, telemetry, an idempotency record or a retry queue. Hold it only
   in the call chain.

Error handling:
- `409 receipt_issued_response_lost` means the receipt is **voided**, so start again from step 1.
- `503 receipt_outcome_unknown` means replay the **same** key.
- On the consumer, `503 refund_authorization_unresolved` / `refund_payment_unavailable` means the relay **is recorded**: re-read the
  case, never re-issue a receipt for it.
- The receipt lifetime is 10 minutes (`core:docs/architecture/core-v2-s-execution-roadmap.md:251-254`).

---

## 10. Missing Core human-facing contract register

These are proposed **Core follow-ups for Admin to record** (F0). None is a Core change made here. New ids continue Admin's CF series.

| Id | Prerequisite | Blocks (Admin) | Existing CF | Core gate / note |
|---|---|---|---|---|
| H-01 | Human hierarchy reads (list Companies, Platforms, Organizations) | real directories | CF-02 | **ORG-00**: deferred until authority activation (F7); S8 conditional |
| H-02 | Owner operator directory | `/operators` real list | CF-03 | — |
| H-03 | Member account-state read and suspended list | P5-S4 | CF-28, CF-30 | — |
| H-04 | Owner **refund case list** (filters: state, platform) | Refunds index | new **CF-65** | BIL-25 is read-by-id only |
| H-05 | Owner **payment / purchase discovery** for the Company (to open a refund, view finality) | Refunds entry, payment views | CF-40 (extend) → **CF-66** | invoices list is payer/producer-scoped (`core:apps/billing-service/src/invoices/invoices.controller.ts:77-90`) |
| H-06 | Owner **fraud-hold list** | Fraud holds index | new **CF-67** | — |
| H-07 | Owner **recovery obligation list** | Recovery index | new **CF-68** | partly reachable through reconciliation cases |
| H-08 | Owner **late-settlement list** | Late settlements index | new **CF-69** | reachable through reconciliation cases |
| H-09 | Owner **read and list of assistance requests and disputes** | Assistance oversight | new **CF-70** | the request read is beneficiary or Organization administrator only (`core:apps/billing-service/src/assistance/assistance.controller.ts:181`) |
| H-10 | **Human File evidence**: upload and evidence grant on behalf of the Owner | dispute evidence, fraud holds, surplus Path B, late-settlement evidence | new **CF-71** | File routes are service-only; "No human … route" (`core:apps/file-service/src/grants/grant.controller.ts:41-42`); M8/DG-2 for production |
| H-11 | Reads of fee caps, delegations and proposals | Fees page | new **CF-72** | — |
| H-12 | Owner read of Organization subscription / entitlement | `/licenses` | CF-36, CF-37 | service-only `entitlement.read` |
| H-13 | Organization-plan catalog read | `/licenses` | CF-38 (partly resolved for personal products) | OD-05 values OPEN |
| H-14 | Browser session (cookie mode) **or** an approved Admin BFF | every HTTP adapter | CF-01 | D-A4; Core A16 |
| H-15 | Operator step-up | operator Organization create | CF-08 | C-5 |
| H-16 | Personal notification inbox | `/notifications` | CF-48 | NOT-00; S7 (C-3, C-6) |
| H-17 | Operator-facing service health | `/services` | CF-06 | — |
| H-18 | CORS allow-list for the Admin origin on every service Admin calls | every HTTP adapter | CF-07 | configuration per service (`core:libs/service-kit/src/bootstrap.ts:50`) |
| H-19 | Core documentation correction: Admin section says Billing and Payment have no human admin API | traceability | new **CF-73** | `core:docs/CORE-ROADMAP.md:686` |

Also record the **resolutions** in F0:
- **CF-04**: answered in development by AUD-03/04.
- **CF-05**: answered in development by REL-01..03.
- **CF-38**: answered for personal products.
- **CF-40**: partly answered (balances, reconciliation, disputes, losses).

All of these remain not deployed.

---

## 11. Browser authentication and HTTP architecture decisions

### 11.1 D-A4 (browser session strategy)

**Facts (SRC/DOC).**
- Refresh tokens are rotating, family-revoked on reuse, and **returned in the response body**.
- **Cookie sessions are absent.**
- CORS uses `credentials:false`.
- Cookie sessions and a BFF are placed in Core **A16** (`core:docs/architecture/core-v2-a4-authentication.md:27-41`, `:111`;
  `core:libs/service-kit/src/bootstrap.ts:50`).
- Admin forbids tokens in browser storage (`admin:CLAUDE.md`, Security).

| Option | Reload survives | Admin rule compliance | Core change | Note |
|---|---|---|---|---|
| A. Memory only | no | ✅ | none | the dev default already recorded (`admin:docs/ROADMAP.md:1149`); poor production UX for an Owner who must step up often |
| B. **Admin token-handler BFF** (presentation-only; forwards the human's bearer; holds the refresh token in an HTTP-only cookie) | yes | ✅ if it holds **no authority or business rule** (ADR-0050 D13) | none in Core; new Admin deployable | must forward `x-step-up-token`, `Idempotency-Key` and the receipt body unchanged and never log them; adds infrastructure |
| C. Core cookie mode | yes | ✅ | Core A16 work | unscheduled; MOVE V3 risk |

**Recommendation (INF):** keep **A for development**. Decide between B and C before any production HTTP adapter (Owner decision D-A4,
§16). No financial HTTP adapter depends on this choice, because those routes are refused in production anyway.

### 11.2 The three step-up transports (SRC)

| Transport | Obtained at | Presented to | Consumed by | Purposes at `0044b20` | Admin today |
|---|---|---|---|---|---|
| **T1 Auth-local** | `POST /auth/admin/step-up` | the Auth route itself, `x-step-up-token` | Auth | `platform_assignment.*`, `operator.create`, `owner.*`, `join_code.*`, `organization.admin.*`, `admin_invitation.*`, `account.suspend` / `.restore`, `hierarchy.reference.repair` | ✅ modelled (13 purposes) |
| **T2 service-verified** | `POST /auth/admin/step-up` | another service, `x-step-up-token` (Organization, Release, Audit, Billing) | that service calls `POST /auth/step-up/verify` with the **Owner's own bearer**; single use, session- and purpose-bound | `platform.create`, `organization.create`, `release.withdraw`, `compatibility_policy.change`, `audit.legal_hold.place` / `.release`, `billing.assistance.correct`, `billing.assistance.dispute.resolve` | ⚠️ `platform.create` and `organization.create` are already used against Organization, but the gateway does not distinguish transports |
| **T3 receipt-bound** | `POST /auth/admin/step-up` → `POST /auth/admin/authorization-receipts` | Billing or Payment, as `receiptSecret` | Auth consumes the receipt at the service's request (AUTH-02/03, service tokens); the step-up proof itself is **refused by `/auth/step-up/verify`** | `refund.authorize`, `payment.dispute.decide`, `billing.fraud_hold.place` / `.release`, `billing.recovery_surplus.record_external`, `billing.late_settlement.apply`, `payment.provider_fact.associate`, `billing.recovery.write_off` (all factor-only) | ❌ not modelled |

Evidence: `core:apps/auth-service/src/owner/step-up.service.ts:23-100`; `core:apps/auth-service/src/receipts/receipt-binding.ts:158`.

**Design consequence.** Split Admin's step-up contract into explicit transports. A T3 purpose must be **unrepresentable** as a T1/T2
grant: a T3 step-up token is never sent as `x-step-up-token` to a domain route. Factor choice follows Core's allow-list per purpose,
with the secret key offered only where Core allows it.

### 11.3 HTTP layer decisions (to approve with F15)

- one interceptor that attaches the bearer **only** to configured Core origins;
- per-request `Idempotency-Key` generation, owned by the facade and kept for the lifetime of one user intent so a retry is the same intent;
- error mapping on `status` + `code` only;
- `503` carries no mutation, so retries are explicit and keyed;
- the collapsed `404` is presented as "not found or not yours";
- respect `Cache-Control: no-store` responses;
- never send `liveMode` or amounts that Core derives.

---

## 12. Mock-first development strategy

1. **Contract states.** Each new financial gateway is 🟡 **DEV-ONLY**, a new sub-state of 🟡: "implemented in Core for development and
   simulation, refused in production". Mocks model Core's documented shapes **and** Core's real error codes, but **the mock is not the
   contract**. Every field is cited to a Core DTO at `0044b20` in the gateway doc comment.
2. **Build flavours.**
   - Demo build: mock adapters with fictional data.
   - Development build with local Core: HTTP adapters to a local Core with `simulation` enabled.
   - Production build: `Unavailable…` adapters for every 🟡 DEV-ONLY gateway, with no mock and no request (the existing pattern,
     `admin:src/app/features/billing/data-access/billing.gateway.ts:12-16`).
3. **Never mock authority.** Mocks may refuse with Core's codes (`step_up_required`, `refund_dispute_open`, `receipt_issued_response_lost`, …).
   They never grant something Core would refuse. Receipt mocks enforce single use, 10-minute expiry and binding equality.
4. **Never simulate money outcomes in the UI.** A mocked refund moves through Core's states only by mock time and fixtures, never by
   a user control. The `/payment/simulation/*` harness is never reachable from Admin.
5. **Demo world.** Extend the P2.5 canonical demo world with financial fixtures: unmatched facts, a review-only partial chargeback, a
   negative balance, a voided receipt, and an unresolved (Q8) authorization. Every fixture is clearly fictional.
6. **Order:** list-backed workflows first (reconciliation, balances, losses), receipt workflows next, then workflows blocked on
   discovery or File evidence (design and mock only).

---

## 13. Dependency-ordered, independently reviewable PR slices

Each slice is one Admin PR. Each needs its own Owner authorization, runs `npm run validate`, includes en/fr/ar keys, light/dark/system
themes and RTL checks, and **changes no existing branding, accent, theme, route or test expectation**. "Blocked" means it can be
designed and mocked, but its HTTP adapter waits for the named prerequisite.

| # | Slice | Depends on | Content | Out of scope |
|---|---|---|---|---|
| **F0** | Core baseline refresh (docs only) | R0 approval | `docs/CORE-INTEGRATION.md` §1, §2, §7, §9 to `0044b20`; new 🟡 DEV-ONLY state; CF-65–CF-73; CF-04/05/38/40 resolutions; `docs/ROADMAP.md` stage A3 financial track + decision rows; this roadmap's adopted parts | any code |
| F1 | Step-up transports + receipt contract (mock) | F0 | split `StepUpGateway` into T1/T2/T3; `AuthorizationReceiptGateway` (abstract, mock, unavailable); binding types per receipt operation; tests for single use, expiry, voided-on-lost-response, no secret in state | UI |
| F2 | Finance hub under `/billing` (shell) | F0 | child routes, owner capabilities (`finance.*`), dev-only and production-unavailable states, navigation entries, i18n | workflows |
| F3 | Reconciliation cases (Billing) | F2 | list + detail + acknowledgement (review-only types), case-type vocabulary (12 types) | resolution commands Core reserves for evidence |
| F4 | Balances and losses | F2 | Payment balances (signed), per-payment balance, `FinancialLoss` list with adjustments | write-off |
| F5 | Refund case detail and authorization | F1, F3 | open (from evidence ids), read, authorize (T3), cancel; R6H-5 capture-specific handling; recovery from `503` by re-read | refund list (blocked H-04), payment discovery (blocked H-05) |
| F6 | Payment disputes | F1, F2 | list, detail, contest/accept (T3); "provisional vs final" | evidence upload (blocked H-10) |
| F7 | Unmatched facts and association | F1, F3 | PAY-12 items, PAY-13 association (T3) | — |
| F8 | Recovery and surplus | F1, F3 | obligation read, surplus Path A view, Path B record (T3; evidence blocked H-10), write-off (T3) | obligation list (blocked H-07), Organization-side settlement |
| F9 | Late assisted settlement | F1, F3 | read + L-4 application (T3) with the five evidence conditions displayed | list (blocked H-08) |
| F10 | Fraud holds (design + mock) | F1 | place / release / read with T3 | HTTP (blocked H-06, H-10) |
| F11 | Assistance oversight (design + mock) | F1 (T2) | correction, dispute resolution | HTTP (blocked H-09) |
| F12 | Platform commercial configuration | F2 | `billing_platform`, catalog (catalog gate banner), fee caps and delegations (owner), operator proposals; first **operator** capabilities | fee reads (blocked H-11) |
| F13 | Audit V2 | F0 | Company timeline (AUD-03), operator Platform records (AUD-04, operator capability), legal holds (T2) | — |
| F14 | Release administration | F0 | REL-01..03 reads, withdraw / policy (T2) | — |
| F15 | HTTP foundation | **D-A4** decided | interceptor, origins, error mapping, idempotency helper; still no domain adapter | — |
| F16 | HTTP adapters, in deployment order: Auth → Organization writes → Audit → Release → Billing/Payment (local dev only) | F15, H-18, each service's deployment for non-dev builds | one adapter per PR | production enablement of any 🟡 DEV-ONLY gateway |

Critical path: **F0 → F1 → F2 → F3 → F5/F7**. F12–F14 are independent after F0 or F2.

---

## 14. Tests, security, staging and production acceptance criteria

### 14.1 Per-slice tests (Vitest, existing conventions)

- **Facade and gateway:** every Core error code the route documents maps to a stable UI state, and nothing branches on `message`.
- **Receipts:**
  - the secret never reaches a signal, store, `console`, URL or persisted preference (spy on storage APIs);
  - a second use is refused;
  - `receipt_issued_response_lost` restarts from step-up;
  - `receipt_outcome_unknown` replays the same key;
  - a different body under one key surfaces `idempotency_key_reused` and never auto-retries.
- **Money commands:** one `Idempotency-Key` per intent; a retry after `503` reuses it; navigating away does not resend.
- **Rendering:** signed balances render negative; no partial-amount input exists for refunds; capture-specific and ordinary receipts are never interchangeable in the UI model.
- **Access:** owner-only routes refuse operators (UX guard plus `/forbidden`); operator fee proposals never show approve.
- **Product rules:** i18n parity (`check:i18n`), RTL snapshots of new pages, contrast (`check:contrast`), keyboard and screen-reader paths for every dialog (step-up, receipt confirmation).
- **Production build:** every 🟡 DEV-ONLY gateway resolves to `Unavailable…` (a build-configuration test).

### 14.2 Security acceptance

- No token, step-up token or receipt secret in browser storage, URLs or logs (existing rule, extended to receipts).
- No service token in the browser, ever. No call from Admin to `/auth/service/*`, `/payment/simulation/*`, `/payment/webhooks/*`, or any File, Notification or Organization service-only route.
- The bearer is attached only to configured Core origins.
- The step-up factor offered for each purpose matches Core's allow-list; the secret key is never offered for a factor-only purpose.
- A security review (`/security-review`) is required on F1, F5, F6, F7, F8, F9 and F15.

### 14.3 Staging (development) acceptance

- Against a **local** Core at a recorded revision (≥ `0044b20`) with the `simulation` provider and refunds configured, **never Lab 01 or production**.
- End-to-end per workflow with a real Owner session and real TOTP step-up:
  - reconciliation list → refund case → T3 authorize → completion observed through Core reads;
  - dispute decision;
  - provider-fact association;
  - write-off;
  - L-4 application.
- Evidence recorded under `docs/review/<slice>/` (screenshots en/fr/ar, light/dark, mobile/desktop), as in prior slices.

### 14.4 Production acceptance (future; not authorized)

A financial page may leave "unavailable" in production only when **all** of the following hold:
- Core's production activation of the relevant module is Owner-authorized and deployed (DG-4 / A10, A11 dispositions changed);
- S-INT and the relevant operational gates (OD-BRK-3, `PAYMENT_SERVICE_POLICY` reconciliation grant, late-success handling) are closed;
- H-10 / H-18 and D-A4 are resolved;
- real provider adapters exist (deferred today);
- Admin's own production review passes.

Until then, the production build ships these pages in their unavailable state only.

---

## 15. Certification and deployment limitations

| Item | State at `0044b20` | Source |
|---|---|---|
| S1 event security | CONDITIONAL PASS (dev); operational NOT STARTED; C-4, AP-R, NP-K, G-7 OPEN; OD-BRK-2b-L real-systemd half **BLOCKED (hardware maintenance, Lab 01)** | `core:docs/architecture/core-v2-s1-event-security.md:8` |
| S2 foundations | CONDITIONAL PASS (dev); R-6a OPEN (OD-R6a); Audit Organization scope rows BLOCKED until F7; operational NOT STARTED | `core:docs/architecture/core-v2-s2-independent-foundations.md:8` |
| S3 Billing | CONDITIONAL PASS (dev, simulation); OD-05, BIL-12, EVT-05, invoice legal content, DG-4 OPEN | `core:docs/architecture/core-v2-s3-billing.md:8`, `:44-54` |
| S4 Payment | CONDITIONAL PASS (dev, simulation); Organization-payer creation grant inactive; real providers DEFERRED; MOVE V3 | `core:docs/architecture/core-v2-s4-payment.md:8`, `:42-49` |
| S5 Assistance | S5a–d CONDITIONAL PASS; **S5 NOT CERTIFIED** (S5e and D6 deferred: V-4, OD-R6a) | `core:docs/architecture/core-v2-s5-assistance-and-cash-obligations.md:8`, `:61` |
| S6 Financial | CONDITIONAL PASS (simulation); Q8, partial chargebacks, V-4, V-5, OD-R6a, EVT-05/06 OPEN; production activation gated | `core:docs/architecture/core-v2-s6-financial-certification.md:10`, `:181-194` |
| S6 residual | one unexplained `401` in sequential receipt replays ("not explained, not dismissed") | `:239-241` |
| S-INT, Final Core Validation | not run; Final Core Validation stays absolutely last | `core:docs/architecture/core-v2-s-execution-roadmap.md:426-440` |
| Deployment | **No S-stage deploys**; merges build images only; production deployments are separate, digest-based, Owner-approved | `:84-87` |
| Production services | Auth, Organization (non-authoritative), Audit, RabbitMQ (DOC); Auth image drift recorded | `core:docs/CORE-ROADMAP.md:55-62` |
| ADRs | 0035, 0036, 0044 (Part B), 0045, 0057 §13, 0067, 0068, 0069 still **Proposed** | `core:docs/architecture/core-v2-s-execution-roadmap.md:27-35` |

**Consequence for Admin.** No Admin financial feature can claim production readiness. Admin "complete" for a financial slice means
mock-complete, plus development-verified against a local simulation Core, at most.

---

## 16. Owner decision register

| Id | Decision | Options | Recommendation | Blocks |
|---|---|---|---|---|
| **D-R0-0** | Approve this roadmap as the Admin V2 master plan | approve / amend / reject | — | everything |
| **D-R0-1** | Priority versus the 2026-10-06 priorities (Admin business features deferred) | keep deferral (F0 only) / authorize the financial track / authorize a subset | **F0 now**; the financial track only by explicit authorization | F1+ |
| **D-R0-2** | Finance placement | extend `/billing` (proposed) / new top-level `/finance` | extend `/billing` (keeps routes) | F2 |
| **D-R0-3** | Demo builds show financial mocks | yes, clearly fictional / no | yes | F2+ |
| **D-R0-4** | New contract sub-state 🟡 DEV-ONLY | adopt / no | adopt | F0 |
| **D-R0-5** | Record CF-65–CF-73 as Core follow-ups | yes / amend | yes | F0 |
| **D-R0-6** | First operator capabilities (fee proposals, AUD-04, Organization edit) | now (F12/F13) / later | with F12/F13 | F12, F13 |
| **D-R0-7** | Admin financial pages in production builds | unavailable state (proposed) / hidden | unavailable state | F2 |
| **D-A4** | Browser session | memory (dev) → BFF **or** Core cookie mode | decide before F15 | F15, F16 |
| D-A4-1, D-A4-2 | existing demo-session and copy decisions | — | unchanged | — |
| **Core-side (recorded, not Admin's to decide)** | DG-4 (Billing pilot), A11, OD-05 catalog values, BIL-12, EVT-05/06, Q8, partial-chargeback policy, V-4, V-5, OD-R6a, C-3/C-6 (S7), C-5 (operator Organization creation), PR #319, H-10 File human path, DG-2 (File provider), DG-8 (Owner loss mitigation) | — | track in Admin's register | F-slices as listed |

### Deferred capabilities (not in Admin V2 scope unless Core changes)

- partial refunds;
- real payment providers;
- cash settlement for other sellers;
- legal remedies (BIL-35);
- tax, invoicing entity and credit notes;
- commercial IN_APP notifications (S7);
- Organization lifecycle (ADR-0060 runtime MOVE V3);
- Organization authority changes (S8);
- human hierarchy reads (ORG-00);
- Owner transfer and exceptional recovery (DG-8);
- member suspension UI (P5-S4, blocked);
- license or seat semantics beyond ADR-0044 (CF-42).

Source: `core:docs/architecture/core-v2-s-execution-roadmap.md:479-486`.

---

## 17. Recommended first implementation slice

**F0: Core baseline refresh (documentation only, Admin repository).**

Why first:
- every later slice cites `docs/CORE-INTEGRATION.md`, which is wrong about Core today ("Nothing in V2 exists in code");
- it changes no code, route, theme or test;
- it respects your 2026-10-06 priorities (Admin business features stay deferred);
- it gives Core a precise follow-up list (CF-65–CF-73) without touching Core.

Scope:
1. Record the new baseline: Core `0044b20` and how it was verified.
2. Reclassify Admin's contract matrix (§7 of that file) with the 🟡 DEV-ONLY state and the 208-route evidence.
3. Add the three step-up transports.
4. Add CF-65–CF-73 and the CF-04/05/38/40 resolutions.
5. Add the financial track and decisions to `docs/ROADMAP.md`, marked **not started / not authorized**.

Acceptance:
- `npm run format:check` (Markdown is excluded from Prettier) and `npm run validate` unchanged and green;
- no symlinked shared-standard file touched;
- design-conformance review.

**If you also authorize code:** the next slice should be **F1** (step-up transports and the receipt contract, mock only). It is the
security foundation every receipt workflow depends on, and it has no UI to review.

---

*End of report. Read-only: nothing was implemented, committed, pushed or deployed. Core was read through a fresh clone; no Core file,
branch or setting was changed. Stopping here for Owner approval.*
