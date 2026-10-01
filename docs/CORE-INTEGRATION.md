# Nawara Admin ↔ Nawara Core integration

- **Status:** A0 discovery record. Re-verify before each Admin stage that integrates a contract: Core is the authority, this file is a
  map.
- **Evidence baseline:** `../nawara-core`, read-only, 2026-10-01. Core `origin/main` = `8628616`. The Core roadmap
  (`docs/CORE-ROADMAP.md`) is on branch `docs/core-v1-v2-admin-context` (`925e830`, pushed, **not yet merged to `main`**).
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
R0–R5            ✅ CLOSED
R6  Remaining    🔵 ACTIVE   R6.1 Audit ✅ · R6.2 Organization ✅ · R6.3 Release ✅ (+ Audit timing stabilization ✅)
                             R6.4 File ⏳ NEXT · R6.5 Payment ⏳ · R6.6 Billing ⏳ · R6.7 Notification ⏳
R7–R11           ⏳
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

CF-10  Merge the Core roadmap
Service:          documentation
Current behavior: docs/CORE-ROADMAP.md exists only on docs/core-v1-v2-admin-context (925e830).
Admin requirement: a stable, merged reference.
Classification:   n/a
Recommended checkpoint: next Core documentation merge (owner).
```

## 10. Undefined architectural decisions (Core side)

- Whether "License" becomes a Core term or remains Billing Subscription/Entitlement (V2 A10).
- Operator capability sets / fine-grained permissions (V2 A6).
- Organization lifecycle semantics (BD-5).
- Whether operator administration is ever publicly browser-reachable (stage-10 study: open deployment/security choice).
- Browser session model for administrative clients (CF-01).
