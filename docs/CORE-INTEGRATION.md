# Nawara Admin ↔ Nawara Core integration

- **Status:** A0 discovery record. Re-verify before each Admin stage that integrates a contract: Core is the authority, this file is a
  map.
- **Evidence baseline:** `../nawara-core`, read-only. A0: 2026-10-01, Core `origin/main` = `8628616`. **Refreshed 2026-10-02**
  (Company Overview slice): Core `origin/main` = `03e10a0`, re-checked at `0954566` (only a two-line release-service type
  cleanup since; no contract change). Between the two, `apps/auth-service/src`,
  `apps/organization-service/src` and `apps/audit-service/src` are **unchanged** (`git diff --stat` empty), so every contract
  below still holds. The Core roadmap (`docs/CORE-ROADMAP.md`) is now **merged to `main`** (CF-10 resolved); localization
  R6 (all services) and R7 are closed, R8 is next.
- **Precedence:** a service's OpenAPI (`GET /<service>/docs`) and Core ADRs win over this document. Report differences to Core.

---

## 1. Evidence baseline

Core documents read: `README.md`, `CLAUDE.md`, `docs/CORE-ROADMAP.md` (complete), `docs/architecture/core-product-integration-guide.md`
(complete), ADR-0041, ADR-0042 (step-up amendment), ADR-0050, ADR-0054, `docs/architecture/stage-10/stage-10-administrative-client-model-study.md`,
`docs/architecture/stage-21/stage-21-x-cutover-record.md` (status sections), `apps/organization-service/README.md`.
Source inspected: all HTTP controllers of all services, Auth's token/session/refresh/grants/owner/operator code, the service-kit
bootstrap and error filter, Audit's query model.

Two accepted Core decisions govern Admin directly:

- **ADR-0041** — administrative capabilities are APIs of the domain service that owns the data; client-neutral; authorized by the
  server on every request. Any access/composition layer holds no business rule, authority or state.
- **ADR-0050** — a privileged human presents their **own** Auth bearer to the target service, which verifies them live through Auth.
  Headers, body fields and links are never authority. No delegated-human token system. A future admin BFF is allowed only as
  presentation infrastructure that forwards the human's bearer (decision 13).

## 2. Core V1 / V2 status (verified)

**Core V1 is current and real.** Its capability set is closed (ADR-0052). The localization refactor (ADR-0054) is active:

```text
R0–R7            ✅ CLOSED   (as of 2026-10-02: R6 all services, R7 shared cleanup)
R8  Legacy/type cleanup  ⏳ NEXT
R9–R11           ⏳
Final Core Validation (Stage 22)  🔒 ABSOLUTE LAST
```

This matches the A0 brief exactly. Production: auth-service, organization-service (**not authoritative**), audit-service, RabbitMQ.
Implemented but **not in production**: billing, payment, notification, file, release. ai-service is a starter. The organization
ownership cutover is blocked on G6 (deferred by the owner).

**Core V2 is planned (A0 Baseline … A19 Release Certification)** — verified, identical to the A0 brief. **Nothing in V2 exists in code.**
The V2 stages Admin depends on: **A4** Authentication, **A5** Organization, **A6** Authorization, **A7** Audit, **A8** Notification,
**A9** File, **A10** Billing, **A11** Payment, **A12** Observability, **A16** Product Integration.

Admin never interferes with this roadmap: it records needs as [Core follow-ups](#9-core-follow-ups).

## 3. Who uses Admin, and with what authority

Auth has three account kinds (ADR-0012, ADR-0050). Authority = verified identity + relationship facts + scope. **No kind is a
super-admin.**

| Persona | Core identity | Scope | Login | Step-up | Admin user? |
|---|---|---|---|---|---|
| **Platform owner** | `owner` (one per Company) | their Company, its Platforms and Organizations | password → TOTP or passkey (`/auth/login` → `/auth/admin/login/owner/verify`) | ✅ TOTP / passkey / secret key, purpose-bound | **Primary user** |
| **Platform operator** | `operator` (created by the owner) | Platforms assigned to them | one-time working code (`/auth/admin/login/operator/*`), session bounded by shift | ❌ not built (ADR-0042 A.1 accepted, unbuilt) | **Yes**, limited to non-sensitive operations |
| Organization admin | `member` with an admin-flagged membership | one Organization | `/auth/login` | — | **No.** A customer-side role; served by product apps. Revisit only by explicit owner decision |

Consequences for Admin:

- "Global operator context" is **not** "all of Nawara". It is **the actor's scope**: the owner's Company, or an operator's assigned
  Platforms. `GET /auth/grants` returns these facts (`companyId`, `platformAssignments`, `organizationAdminMemberships`).
- Operators cannot perform any operation requiring step-up (e.g. organization create) until Core builds operator step-up.

## 4. Authentication findings

| Aspect | Core V1 reality | Evidence |
|---|---|---|
| Credential | **Bearer JWT** (HS256, ~15 min default, `ACCESS_TOKEN_TTL_SEC`) + opaque **refresh token** (14 days default), both returned **in the JSON body** | `auth-service/src/tokens/token.service.ts`, `auth/session.service.ts`, `config/app-config.ts` |
| Claims | `sub`, `role`, `adminTier` (`owner`/`operator`), `sid`. **No organization/platform/company claim** — context is always decided server-side | `token.service.ts` |
| Refresh | `POST /auth/refresh` rotates; **re-presenting a rotated token revokes the whole session** (no grace window) | `tokens/refresh-token.service.ts` |
| Operator ceiling | operator sessions cannot outlive the shift; refresh returns 401 with `code`/`reason` `session_ceiling_reached` | `operator/operator-code.service.ts`, `auth.service.ts` |
| Logout | `POST /auth/logout` (bearer + refresh token in body) | `auth.controller.ts` |
| Current user | `GET /auth/me` (identity, `adminTier`, memberships for members); `GET /auth/grants` (authorization facts) | `auth.controller.ts`, `grants.service.ts` |
| Owner MFA | login returns `{status:'mfa_required', challengeToken, methods}` / `enrollment_required` / `recovery_required` | `owner/owner-auth.service.ts` |
| TOTP / WebAuthn | enrollment, factor list/add/remove, passkey login and step-up | `owner/owner.controller.ts` |
| WebAuthn RP | RP ID `nawara-solutions.com`; origin **`https://admin.nawara-solutions.com`** (owner decision, commit `d63053f`) | `config/app-config.ts` |
| Step-up | `POST /auth/admin/step-up` → `{stepUpToken, expiresAt}`: single use, ≤15 min, session- and purpose-bound; sent as header **`x-step-up-token`** to the target service, which consumes it through Auth | `owner.controller.ts`, ADR-0042 A.1 |
| Recovery | password + secret key → cool-down → enrollment token (never a session) | `owner/recovery.service.ts` |
| Live authorization | every request reloads user + session; block/suspend/revoke act on the **next request** | ADR-0050 context |
| CORS | off unless exact origins are listed (`CORS_ORIGINS`), **`credentials: false`** — every service, via the kit | `auth-service/src/main.ts`, `service-kit/src/bootstrap.ts` |
| CSRF | not applicable to Core calls: no cookies, bearer in `Authorization` header | stage-10 admin client model study §8 |
| Localization | `Accept-Language` en/fr/ar on error `message`; Auth adopted (R5) | ADR-0054 |

**Tension recorded (CF-01):** the integration guide §2 says browser clients keep refresh tokens in "HTTP-only storage", but Auth only
returns refresh tokens in JSON bodies and refuses credentialed CORS. A pure SPA cannot satisfy both. See ARCHITECTURE §11 for the
Admin strategy and the decision required before A4.

## 5. Domain findings

### Organization (Company → Platform → Organization)

- Hierarchy: a Company has Platforms; a Platform has Organizations. Anchors never move; ids are never reused.
- **Today Auth is authoritative.** organization-service is deployed but `authoritative=false`; "nothing reads from, or writes to,
  this service in any Core flow today" (its README). Cutover gates G6/G7 are deferred.
- Human routes that exist:
  - `GET /auth/admin/organizations/:id` (owner, operator) — single lookup, authorized via the hierarchy. **Authoritative today.**
  - `GET /auth/platform-access/:platformId` (owner, operator) — live "may I act on this platform?".
  - `POST|PATCH /organization/admin/platforms|organizations` — human bearer, grants from Auth, step-up for creates. **Writes to the
    non-authoritative store until cutover.**
- **No human route lists Companies, Platforms or Organizations.** All list/read routes of organization-service are service-token
  only. Admin cannot build an organization directory on V1 contracts (CF-02).
- Organization lifecycle (suspend/archive/delete) is undecided (BD-5). No `status` exists.

- **Create platform, verified 2026-10-02** (`apps/organization-service/src/admin/admin.controller.ts` `createPlatform`):
  body `{ companyId, name }` (name 1–200); `HumanAuthGuard` (the owner's own bearer, grants from Auth); authority
  `canCreatePlatform`: **owner of that Company only** (operators never); header **`x-step-up-token`** for purpose
  **`platform.create`** (accepted factors TOTP, WebAuthn, secret key: `auth-service/src/owner/step-up.service.ts`), verified
  through `POST /auth/step-up/verify`; **`Idempotency-Key` required** (replay → `200` + `Idempotent-Replayed: true`, first
  success `201`); `404 company_not_found` before authority; `403 admin_forbidden` / `step_up_required`. **Audit:** the
  success is written in the same transaction (`platform.created` hierarchy audit + actor record); every refusal writes
  `hierarchy.admin_operation_denied`. **Cutover:** the repository calls `OwnershipService.assertWritable`, so until the
  ownership phase is `ACTIVE` every create answers **`409 not_authoritative`**. Admin must reuse this contract and must not
  build a second creation flow.

### Memberships, users and access (Auth)

- Per organization (owner, operator, org admin): list memberships by status; approve / reject / revoke; join codes create / list /
  revoke (owner needs step-up); admin invitations (owner + step-up, operators refused); grant / revoke organization admin (owner +
  step-up). Controller: `auth-service/src/membership/organization.controller.ts`.
- Operators (owner): create (step-up `operator.create`), confirm, block / unblock (deliberately no step-up), platform assignments
  grant / revoke (step-up) and history.
- Member security (owner + factor step-up, closed reason code): suspend / restore (`auth-service/src/members/member-security.controller.ts`).
- **Missing:** no directory of operators, no user search, no member directory outside one organization (CF-03).

### Authorization

- V1: identity kind + relationship facts (Company ownership, Platform assignments, org-admin memberships) evaluated **by each owning
  service**, live. Purpose-bound step-up for sensitive operations. Service callers: deny-by-default policies (not relevant to a browser).
- No roles/permissions catalog, no operator capability sets, no "permissions of the current user" endpoint (V2 A6). Admin derives a
  **UX-only** capability model from `kind` + `grants` (ARCHITECTURE §10) and always handles `403`.

### Audit

- `GET /audit/owner/organizations/:organizationId/records` — owner's own bearer; one organization of their Company per request;
  `from`/`to` UTC, **≤ 31 days**, `limit` ≤ 100, opaque cursor, rate-limited, self-audited, `Cache-Control: no-store`.
- Record: `eventId, occurredAt, recordedAt, action, category, sourceService, actor{type,id,userKind?}, organizationId, resource,
  subject, outcome, changes, correlationId, causationId`.
- **Not available to humans:** platform-level records (null organization, e.g. `owner.*`, `account.*`), cross-organization sweeps,
  any operator read. Needs Company attribution in the audit contract (CF-04).

### File

- Every route is **service-token** (product backends) or ticket-redeem. No human/admin API. ADR-0050 D12 places File administration out
  of V1. → V2 A9.

### Notification

- Service-token send / status / cancel only. No human API, no template administration API (templates are published by migration).
  → V2 A8.

### Billing

- Owns catalog, prices, invoices, payment requests and **Subscription/Entitlement** (ADR-0038, ADR-0044: one Subscription per
  Organization; no `License` entity).
- Human routes exist only for the **payer** of an invoice (`ServiceOrUserGuard`, relation-scoped, collapsed 404). No staff/operator
  administration; ADR-0050 D12 explicitly excludes staff commercial mutations from V1. Not in production. → V2 A10.

### Payment

- Settlement only; its only service caller is Billing. Human routes: the payer reads a payment and starts/syncs an attempt. No staff
  administration. Not in production. → V2 A11.

### Release

- Owner of the operating Company, with factor step-up: `POST /release/admin/products/:product/components/:component/releases/:version/withdraw`
  (`release.withdraw`) and `…/compatibility-policy` (`compatibility_policy.change`). Not in production.
- Public: `GET /release/products/:product/components/:component/compatibility?version=` (rate-limited, ETag).
- **No human read/list of products, releases or policies** (CF-05). Register/publish are CI-only (service token).
- Release is **never** entitlement.

### Health / monitoring

- Each service exposes unauthenticated `/health` (liveness) and `/ready` (readiness); Auth exposes `/auth/health`. These are
  infrastructure probes, not an operator API (no aggregation, no CORS intent, gateway exposure unverified). → V2 A12 (CF-06).

## 6. License / entitlement conclusion

- **There is no `License` domain in Core.** Ownership of entitlement **is decided**: billing-service (ADR-0038, ADR-0044).
  Authentication never depends on it (ADR-0026). Release does not own it (ADR-0051).
- **No operator contract exists** to create or change a subscription/entitlement. The Core roadmap classifies it
  **PLANNED / TO BE DEFINED DURING CORE V2 (A10, with A6 for authority)**.
- Whether "license" becomes a Core term or stays Billing's Subscription/Entitlement is a **Core V2 decision against ADR-0044**, not an
  Admin decision. Admin's wizard (organization → product → plan/entitlements → validity → review → activate) is built as 🟡 UI over a
  frontend `LicenseGateway` with a mock adapter. Fields such as `maxUsers`, `features`, `validity` are **frontend view-model fields
  only** and are not proposed as backend fields.

## 7. Contract matrix

🟢 EXISTING / CONFIRMED · 🟡 PLANNED V2 / MOCKED · 🔴 UNDEFINED. "Prod" = deployed in production today.

| Admin capability | Core owner | Status | Evidence | Admin strategy |
|---|---|---|---|---|
| Owner login (password + TOTP/passkey) | Auth | 🟢 Prod | `auth.controller.ts` `login`; `owner.controller.ts` `login/owner/*` | HTTP adapter (A4) |
| Owner first-factor enrollment | Auth | 🟢 Prod | `owner.controller.ts` `enroll/*` | HTTP (A4) |
| Owner recovery | Auth | 🟢 Prod | `owner.controller.ts` `recovery/*` | HTTP (A4/A7) |
| Operator login (working code) | Auth | 🟢 Prod | `operator.controller.ts` `login/operator/*` | HTTP (A4) |
| Operator contact confirmation | Auth | 🟢 route; reissue 🔴 (CF-16); docs vs source 🟡 (CF-17) | `operator.controller.ts` `operators/confirm` | mock adapter (A4-S3, development only); HTTP later |
| Session refresh / logout | Auth | 🟢 Prod | `auth.controller.ts` `refresh`, `logout` | HTTP; storage strategy = decision D-A4 |
| Current user / grants | Auth | 🟢 Prod | `GET /auth/me`, `GET /auth/grants` | HTTP (A4/A6) |
| MFA factor management | Auth | 🟢 Prod | `owner.controller.ts` `factors*` | HTTP (A7) |
| WebAuthn (passkeys) | Auth | 🟢 Prod | `webauthn-options`, `factors/webauthn*`; RP `nawara-solutions.com` | HTTP + browser WebAuthn API (A4) |
| Owner step-up | Auth | 🟢 Prod | `POST /auth/admin/step-up`, `x-step-up-token` | Shared step-up flow (A4) |
| Operator step-up | Auth | 🟡 | ADR-0042 A.1 accepted, not built | Hide/disable sensitive ops for operators |
| Secret key rotate / password change | Auth | 🟢 Prod | `secret-key/rotate`, `password/change` | HTTP (A7) |
| Organization directory (list/search) | Organization | 🔴 | org lists are service-token only | Mock adapter; **CF-02** (V2 A5) |
| Organization detail | Auth (today) → Organization | 🟢 Prod | `GET /auth/admin/organizations/:id` | HTTP, behind `OrganizationGateway` |
| Organization create / edit | Organization | 🟢 contract · ⚠ not authoritative | `/organization/admin/*` | Gateway ready; **writes disabled by config until cutover** |
| Platform create / edit | Organization | 🟢 contract · ⚠ not authoritative | `/organization/admin/platforms*` | Same |
| Organization lifecycle (suspend/archive) | Organization | 🔴 | BD-5 undecided | Placeholder only |
| Memberships (list/approve/reject/revoke) | Auth | 🟢 Prod | `organization.controller.ts` | HTTP (A7) |
| Join codes / admin invitations | Auth | 🟢 Prod | `organization.controller.ts` | HTTP (A7) |
| Organization-admin grant/revoke | Auth | 🟢 Prod | `memberships/:id/admin` | HTTP (A7) |
| Operators (create/confirm/block/unblock) | Auth | 🟢 Prod | `operator.controller.ts` | HTTP (A7) |
| Operator directory | Auth | 🔴 | no list route | Mock; **CF-03** |
| Platform assignments | Auth | 🟢 Prod | `platform.controller.ts` | HTTP (A7) |
| Member suspend / restore | Auth | 🟢 Prod | `member-security.controller.ts` | HTTP (A7) |
| User search / identity directory | Auth | 🔴 | none | Mock; **CF-03** |
| Roles / permissions catalog | Authorization | 🟡 | V2 A6 | UX capability model from grants |
| Audit — one organization (owner) | Audit | 🟢 Prod | `owner-query.controller.ts` | HTTP (A9) |
| Audit — platform-level / operator reads | Audit | 🔴 | ADR-0050 D6 excludes | Placeholder; **CF-04** |
| Files | File | 🟡 | V2 A9; V1 service-token only | Mock (A12) |
| Notifications | Notification | 🟡 | V2 A8; V1 service-token only | Mock (A12) |
| Billing administration | Billing | 🟡 | V2 A10; V1 payer/service only | Mock (A11) |
| Payments administration | Payment | 🟡 | V2 A11; V1 payer/Billing only | Mock (A11) |
| License / entitlement | Billing (decided) | 🟡 contract TBD | ADR-0038/0044; roadmap "Licenses" | Mock wizard (A11) |
| Release withdraw / minimum version | Release | 🟢 (not Prod) | `release-service/src/admin/admin.controller.ts` | HTTP (A10) |
| Release catalog / history read | Release | 🔴 | none for humans | Mock; **CF-05** |
| Client compatibility (Admin's own build) | Release | 🟢 (not Prod) | `compatibility.controller.ts` | Optional: Admin registers as a web component (CF-07) |
| Service health | per service | 🔴 | `/health`, `/ready` probes only | Placeholder; **CF-06** (V2 A12) |
| Monitoring / metrics | Observability | 🟡 | V2 A12 | Mock (A13) |
| Error contract | all | 🟢 | ADR-0054; kit filter | Shared `CoreError` mapping (A3) |
| **Company Overview (2026-10-02 slice)** | | | | |
| Actor's Company id (owner) / assignments (operator) | Auth | 🟢 Prod | `GET /auth/grants` (`grants.service.ts` `forUser`) | `Actor` model mirrors it; demo session until A4 |
| Owner identity for the profile | Auth | 🟢 Prod (email, phone only) | `GET /auth/me` (`auth.service.ts` `me`) | Display name 🔴: none in Core; UI falls back to the email |
| Company name; list of the Company's Platforms with names | Organization / Auth | 🔴 | no human route (CF-02) | `ScopeDirectoryGateway`, mock in demo builds |
| Platform access check | Auth | 🟢 Prod | `GET /auth/platform-access/:platformId` (200 / collapsed 404) | Mirrored by `canEnterPlatform` (UX); not yet called |
| Counts: platforms, organizations, per-platform memberships, per-platform operators | Organization / Auth | 🔴 | no aggregate or list route (CF-02, CF-03, CF-11) | `CompanyOverviewGateway`, mock in demo builds |
| Unique identities (distinct accounts) across the Company | Auth | 🔴 | none; must never be a sum of memberships (CF-03, CF-11) | Mock |
| Pending invitations, company-wide | Auth | 🔴 aggregate (🟢 per organization) | `GET /auth/organizations/:id/admin-invitations` lists one organization, derived `active` status | **Provisional demo definition:** organization-admin invitations with status `active` across the Company's organizations (CF-11) |
| Organization growth history | Organization | 🔴 | no history or time-series route (CF-12) | Mock, fictional history |
| "Needs attention" signals | Auth / Organization | 🔴 | none (CF-13) | Mock, fictional items |
| Recent administrative activity, company-wide | Audit | 🔴 | owner reads one organization per request, ≤ 31 days; platform-level records service-only (CF-04) | Mock, fictional entries |
| Create platform | Organization | 🟢 contract · ⚠ not authoritative | `POST /organization/admin/platforms` (see §5) | Shown to the owner, disabled with an explanation; real flow later (A4 step-up + cutover) |
| Access & security: owner account security | Auth | 🟢 Prod (page not built) | `GET /auth/admin/factors`, factor add/remove, `secret-key/rotate`, `password/change` (owner only) | Overview row only, action disabled; no score or rating is computed |
| Access & security: operator assignments vs unique operators | Auth | 🔴 | assignments readable only per operator (`GET /auth/admin/operators/:id/platform-assignments`); no operator directory (CF-03) | Mock; assignments and unique operators kept as separate figures |
| Attention: access assignments to review | Auth | 🔴 | none (CF-13) | Mock |
| Commercial: active licenses, expiring soon (+ attention item) | Billing | 🟡 | no `License` entity; entitlement read is service-token only, per organization, `{ valid, expiresAt }`; no staff API; not in production | Separate `CommercialSummaryGateway`, mock in demo builds; "license" is a view-model term (§6) |
| Commercial: payment issues | Payment / Billing | 🟡 | payer-only human routes; no staff API; not in production | Same gateway, mock |
| Services & health (Auth, Organization, Release, Billing, Payment, File, Notification, Audit) | all / observability | 🟡 (CF-06, V2 A12) | each service: unauthenticated `/health` → `{status:'ok'}`, `/ready` → `ready \| unavailable` (service kit); no aggregation, no "delayed" state, not an operator API; billing, payment, file, notification, release not in production | Separate `ServiceHealthGateway`, mock in demo builds; the card says "Illustrative statuses of Nawara Core services, not live health" beside the "n of 8 operational" count; never presented as live health, readiness or deployment |
| Platform directory (`/platforms`): Platforms with organizations, memberships, operator assignments | Organization / Auth | 🔴 | no human route lists a Company's Platforms or their counts (CF-02, CF-03, CF-11) | `PlatformDirectoryGateway`, mock in demo builds; "unavailable" otherwise |
| Unread notification count (sidebar badge, top-bar bell) | Notification | 🟡 | delivery only; no human inbox or unread-count route (CF-14) | `NotificationSummaryGateway`, mock in demo builds; no badge or bell when unavailable |
| Releases (navigation) | Release | 🟢 actions (not prod) · 🔴 catalog (CF-05) | `release/admin/...` withdraw / compatibility policy (`OwnerGuard`) | Sidebar entry only, not a link |

## 8. Transport rules Admin must follow

- `Authorization: Bearer <access>` only to Nawara services, TLS only.
- `Accept-Language: en|fr|ar` on every call (from the active UI locale). Tolerate English fallback; read `Content-Language` if useful.
- **Branch on `statusCode` + `code` only. Never parse `message`.** Some paths are still code-less until R6.4–R7 complete; map them by
  status.
- `x-request-id` per request (8–128 chars `[A-Za-z0-9._:-]`), generated client-side, attached to diagnostics.
- `Idempotency-Key` on creates that require it; one key per logical operation, reused on retries, kept until a terminal answer.
- `x-step-up-token` for step-up operations; obtain immediately before the operation (single use).
- Retry only `429`, `503`, network errors/timeouts — bounded exponential backoff with jitter; honour `Retry-After`. Never retry
  `400/401/403/404/409/422`.
- Lists: `?limit=&cursor=` → `{ items, nextCursor }`. **No totals, no page numbers, no server sort parameters** (newest first).
- Instants: ISO 8601 UTC with `Z`. Time zones: IANA ids.
- `503 hierarchy_unavailable` = unknown, retry later; never treat as success.

## 9. Core follow-ups

Recorded for the Core owner. **Admin changes nothing in Core.**

```text
CF-01  Browser refresh-token storage
Service:          auth-service
Current behavior: refresh token returned in JSON; CORS credentials:false; guide §2 asks browsers for "HTTP-only storage".
Admin requirement: a session that survives a page reload without exposing the refresh token to script.
Classification:   🟡 (V2 A4 lists "cookies"); interim option is an Admin token-handler BFF permitted by ADR-0050 D13.
V1 or V2:         V2 A4 (cookie mode) — or an owner decision on an Admin BFF before Admin A4.
Recommended checkpoint: Core V2 A4; owner decision D-A4 before Admin A4.

CF-02  Human-scoped hierarchy read API
Service:          organization-service (after cutover) / Auth (today)
Current behavior: no human route lists Companies, Platforms or Organizations.
Admin requirement: owner lists their Company's Platforms/Organizations; operator lists those of assigned Platforms; cursor paging, filters.
Classification:   🔴 → design in V2 A5 (+ A6 for scope).
V1 or V2:         V2.
Recommended checkpoint: Core V2 A5.

CF-03  Owner-scoped operator and member directories
Service:          auth-service
Current behavior: operators can be created/blocked but not listed; members visible only per organization.
Admin requirement: list/search operators of the Company; find a user across the owner's organizations (minimized projection, ADR-0050 D11).
Classification:   🔴
V1 or V2:         V2 A4/A5/A6.
Recommended checkpoint: Core V2 A5.

CF-04  Platform-level audit for humans
Service:          audit-service
Current behavior: owners read one organization at a time; platform-level records are service-only (no Company attribution).
Admin requirement: owner reads their Company's platform-level evidence (account.*, operator.*, owner.*).
Classification:   🔴 (needs ADR-0049 amendment: Company attribution).
V1 or V2:         V2 A7.
Recommended checkpoint: Core V2 A7.

CF-05  Release catalog read for the owner
Service:          release-service
Current behavior: owner can withdraw and change policy but cannot list products/components/releases/policies.
Admin requirement: render the release history to choose what to withdraw.
Classification:   🔴
V1 or V2:         V2 (A16/A15) or a scoped V1 addition if the owner authorizes.
Recommended checkpoint: owner decision; default V2.

CF-06  Operator-facing service health
Service:          all / observability
Current behavior: /health and /ready probes only.
Admin requirement: an authenticated, aggregated, read-only health/status view.
Classification:   🟡 (V2 A12).
V1 or V2:         V2 A12.
Recommended checkpoint: Core V2 A12.

CF-07  Admin origin enablement (deployment, not code)
Service:          every service Admin calls
Current behavior: CORS off unless CORS_ORIGINS lists the origin.
Admin requirement: add https://admin.nawara-solutions.com (and staging origins) to CORS_ORIGINS; expose X-Request-Id /
                  Idempotent-Replayed / Retry-After via Access-Control-Expose-Headers; allow x-step-up-token, Idempotency-Key,
                  x-request-id, Accept-Language request headers. Optionally register Admin as a Release "web" component.
Classification:   🟢 mechanism exists; configuration is a production action.
V1 or V2:         V1 configuration, owner-authorized, at Admin A4 integration.
Recommended checkpoint: separate owner authorization when Admin first integrates against a deployed environment.

CF-08  Operator step-up
Service:          auth-service
Current behavior: accepted (ADR-0042 A.1), not built; operators denied sensitive operations.
Admin requirement: operators performing organization create and future sensitive operations.
Classification:   🟡
V1 or V2:         V2 A4/A6.
Recommended checkpoint: Core V2 A4.

CF-09  Organization lifecycle
Service:          organization-service
Current behavior: BD-5 undecided; no status field.
Admin requirement: suspend/archive presentation and "disabled organization" context handling.
Classification:   🔴
V1 or V2:         V2 A5.
Recommended checkpoint: Core V2 A5.

CF-10  Merge the Core roadmap                                         RESOLVED 2026-10-02
Service:          documentation
Current behavior: docs/CORE-ROADMAP.md is on Core main (verified at 03e10a0).
Admin requirement: a stable, merged reference.
Classification:   n/a
Recommended checkpoint: none (done).

CF-11  Owner-scoped Company summary aggregates
Service:          organization-service (hierarchy counts) and auth-service (identities, memberships, operators, invitations)
Current behavior: no aggregate exists. Lists are per organization (memberships, admin invitations) or service-token only
                  (Platforms, Organizations); there is no count of operators, and no identity directory (CF-03).
Admin requirement: for the owner's Company: number of Platforms and Organizations; DISTINCT user identities (one person with
                  memberships in several Platforms counts once, never a sum of memberships); per-Platform membership and
                  active-operator counts; organization-admin invitations awaiting acceptance across the Company's
                  organizations (the Admin demo's provisional definition; Core decides the real one).
Classification:   🔴 (needs a domain decision on what "user identity" and "pending invitation" mean at Company scope).
V1 or V2:         V2 A5/A6.
Recommended checkpoint: Core V2 A5, together with CF-02/CF-03.

CF-12  Organization growth history
Service:          organization-service (after cutover)
Current behavior: Organizations have createdAt; no history, time series or per-period count is exposed to humans.
Admin requirement: total organizations of the Company per day/week over a bounded period (e.g. 30/90 days), for a chart.
Classification:   🔴 (could also be derived from an owner-readable organization list with createdAt, CF-02, if lifecycle
                  CF-09 never removes organizations; otherwise a history is needed).
V1 or V2:         V2 A5.
Recommended checkpoint: Core V2 A5.

CF-13  Administrative attention signals
Service:          auth-service (invitations, memberships, assignments) / organization-service
Current behavior: none. Pending memberships and admin invitations can only be listed per organization.
Admin requirement: a small owner-scoped summary of items needing review (invitations awaiting acceptance, pending membership
                  requests, operator assignments to review), each with a count and a link target.
Classification:   🔴 (what counts as "needs attention" is a product/domain decision).
V1 or V2:         V2 (A5/A6/A7).
Recommended checkpoint: owner decision; default V2.

CF-14  Signed-in person's notification summary
Service:          notification-service
Current behavior: delivers notifications; no human route reads a person's inbox or an unread count.
Admin requirement: an unread count for the signed-in owner/operator (shell badge and bell), later the inbox itself.
Classification:   🟡 (the service exists; the human read model does not).
V1 or V2:         V2.
Recommended checkpoint: with the Notifications page (Admin stage to be planned).

CF-15  Owner sign-in contract details (verify before the auth HTTP adapter)
Service:          auth-service
Current behavior: 🟢 routes exist (login, owner verify, WebAuthn options, me, grants, platform-access, logout); Admin A4-S1
                  uses a mock only, with a simulated passkey prompt (no WebAuthn).
Admin requirement: exact login request fields and accepted identifier formats; stable `code` per outcome (invalid credentials,
                  invalid factor, expired challenge, rate limited, unavailable), so Admin stops falling back on HTTP status;
                  `methods` values and order, and whether they list only enrolled factors; TOTP format, validity and
                  challenge-token lifetime; whether a refused code keeps the challenge; the WebAuthn login options request and
                  how a cancelled prompt differs from a failed one; whether verify returns the session or another next state;
                  which accounts are authenticated but have no Admin access; that `GET /auth/platform-access/:platformId`
                  answers 200 / collapsed 404 for the owner and assigned operators, as Admin uses it to authorize return
                  navigation into a Platform scope.
Classification:   🟢 contract to read from Auth's OpenAPI and source (not re-inspected for this slice).
V1 or V2:         V1.
Recommended checkpoint: before the auth HTTP adapter (rest of Admin A4).

CF-16  Operator confirmation-code reissue
Service:          auth-service
Current behavior: 🟢 (source, origin/main 763e1a8) the confirmation code is issued only when the owner creates the operator
                  (operator-admin.service.ts:31; default lifetime 8 h, OPERATOR_CONFIRMATION_TTL_SEC). No route resends or
                  reissues it; Core's ADD says a resend endpoint "is not designed". Blocking cancels it; unblocking issues none.
                  An operator whose code expired, was killed by 5 wrong guesses, or was blocked before confirming has no path.
Admin requirement: a way to obtain a new confirmation code (operator-requested and/or owner-triggered), with the same
                  enumeration and rate-limit care as request-code. Whether re-creating the same identifier is refused is
                  🟡 unverified.
Classification:   🔴 missing capability.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the A4-S3 HTTP integration and A7 operator administration (the A4-S3 mock prototype is built
without any reissue: it offers none and points to the company owner).

CF-17  Operator confirmation: Core documentation versus source
Service:          auth-service (documentation and source)
Current behavior: recorded, not resolved here (origin/main 763e1a8):
                  (a) ADR-0015, the SDD (operator confirm section) and the ADD say a successful confirmation publishes
                      admin.operator_contact_confirmed and sends the first working code automatically; the source only sets
                      contactVerifiedAt and writes an audit record (operator-code.service.ts:169–184), and Core's own e2e test
                      requests the working code itself.
                  (b) ADR-0015 and the TDD accept an enumeration side channel (204 for an already-confirmed operator whatever
                      the code, 401 otherwise); the source comment and the security review say "no oracle".
                  (c) GET /auth/me's contactVerified reads the user table, while operator confirmation sets the operator
                      table, so it does not report an operator's confirmation.
Admin requirement: Core states which behaviour is intended. Until then Admin follows the source: after confirmation the operator
                  requests a working code; Admin never says one was sent and never reads /auth/me contactVerified as an
                  operator's confirmation status.
Classification:   🟡 documentation/source discrepancy.
V1 or V2:         V1 (documentation or source fix, Core owner's choice).
Recommended checkpoint: before the A4-S3 HTTP integration.

CF-18  Owner visibility of operator confirmation status
Service:          auth-service
Current behavior: POST /auth/admin/operators answers { id, email, phone, isActive }; no owner route reports whether an
                  operator has confirmed their contact (no operator directory: CF-03).
Admin requirement: the owner sees "pending confirmation" for operators they created (minimized projection).
Classification:   🔴 (with CF-03).
V1 or V2:         V2 A4/A5 with CF-03.
Recommended checkpoint: A7 operator administration.

CF-19  Production delivery of operator codes
Service:          notification-service (with auth-service events)
Current behavior: 🟡 unverified. Auth emits admin.operator_code_issued and admin.operator_confirmation_code_issued
                  (operator-code.service.ts:93, :104, origin/main 763e1a8) for Notification to deliver by email or SMS;
                  Core's roadmap lists notification-service as "implemented, not in production" (docs/CORE-ROADMAP.md:50).
                  A roadmap entry is not deployment evidence either way; nothing has been checked against production.
Admin requirement: evidence that working and confirmation codes are delivered in production (email and SMS), before any Admin
                  copy or flow relies on it. Until then Admin never claims a code was sent (A4-S2, A4-S3).
Classification:   🟡 unverified (deployment, not a contract gap).
V1 or V2:         to confirm with the Core owner.
Recommended checkpoint: before the working-code and confirmation HTTP integration.

CF-20  Locale of operator code messages
Service:          auth-service, notification-service
Current behavior: 🟢 (source, 763e1a8) the code events carry no locale (operator-code.service.ts:93, :104), and Notification
                  resolves a missing locale to its configured default (notification-service intake/locale.ts). The message
                  language is therefore independent of the language the operator uses in Admin.
Admin requirement: code messages in the operator's language (EN/FR/AR), or an agreed source of the preferred locale (for
                  example a request parameter or a stored preference); Admin's own copy stays separate from message content.
Classification:   🟡 product decision and contract addition.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the working-code and confirmation HTTP integration.
```

## 10. Undefined architectural decisions (Core side)

- Whether "License" becomes a Core term or remains Billing Subscription/Entitlement (V2 A10).
- Operator capability sets / fine-grained permissions (V2 A6).
- Organization lifecycle semantics (BD-5).
- Whether operator administration is ever publicly browser-reachable (stage-10 study: open deployment/security choice).
- Browser session model for administrative clients (CF-01).
