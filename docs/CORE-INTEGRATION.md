# Nawara Admin ↔ Nawara Core integration

- **Status:** A0 discovery record. Re-verify before each Admin stage that integrates a contract: Core is the authority, this file is a
  map.
- **Evidence baseline:** `../nawara-core`, read-only. A0: 2026-10-01, Core `origin/main` = `8628616`. **Refreshed 2026-10-02**
  (Company Overview slice): Core `origin/main` = `03e10a0`, re-checked at `0954566` (only a two-line release-service type
  cleanup since; no contract change). Between the two, `apps/auth-service/src`,
  `apps/organization-service/src` and `apps/audit-service/src` are **unchanged** (`git diff --stat` empty), so every contract
  below still holds. The Core roadmap (`docs/CORE-ROADMAP.md`) is now **merged to `main`** (CF-10 resolved); localization
  R6 (all services) and R7 are closed, R8 is next.
- **P3b-0 (2026-10-23):** the Organization create and edit contracts, the `organization.create` step-up, Organization
  idempotency, admin invitations and the lifecycle decision were re-read from Core source (read-only) for P3b; §5 records
  them with file references (paths relative to `nawara-core/apps/`). The invitation contract was re-verified in detail in
  **P3b-S3-0** (Core `origin/main` `dd07f2a`). Implemented in Admin, each as a **demo-world mock only**: create (P3b-S1),
  metadata edit (P3b-S2) and admin invitations (P3b-S3); no HTTP adapter.
- **F0 Core V2 baseline (2026-10-30): Core `main` = `0044b20`** (`0044b20cc7278c1d23d71ee1a39c3d8ab9118db9`, the PR #409 merge),
  verified by `git ls-remote` at 2026-10-30T20:30:48Z, read-only. It is **132 commits** after `304064f`, the last revision
  recorded below (P9-S4-0), and contains Core V2 stages S1 to S6. [§11](#11-core-v2-s-track-alignment-f0-core-0044b20) records
  what changed for Admin: the source-derived 208-route inventory, the 🟡 DEV-ONLY contract state, the production-refused
  financial modules, the S3–S6 financial register, ORG-00, D-A4, the three step-up transports, the discovery gaps (CF-65 to
  CF-73) and the certification limits. The earlier baselines (`8628616`, `03e10a0`, `0954566`, `dd07f2a`, `750eb21`, `304064f`)
  are kept as they were written, for traceability; where §1–§10 disagree with §11, **§11 is current**. Evidence:
  [`review/r0-core-alignment/`](review/r0-core-alignment/README.md).
- **F1-S0 errata (2026-10-30), same Core revision `0044b20`:** five dated corrections to the F0 text (receipt issuance and Audit
  legal holds take a **body** `stepUpToken`; a receipt may stay in memory for one intent; issuance, consumption and completion are
  separate outcomes; uncertain no-key outcomes stay blocked) are in [§11.12](#1112-errata-f1-s0-2026-10-30); open Core questions
  CF-74 to CF-76 are in §9. The F0 text is kept and marked.
- **Assistance A3 (2026-10-30), same Core revision `0044b20`:** open Core question **CF-77** (no end-of-results contract in the
  reconciliation-case list, BIL-33) is in §9.
- **Assistance A7 (2026-10-31), same Core revision `0044b20`:** the assistance dispute and correction representations were re-read
  from source (`apps/billing-service/src/assistance/assistance-settlement.view.ts:34-57`, `assistance.controller.ts:84-123`,
  `db/migrations/0031_assistance_resolution.sql`); Admin's A1 types now carry `openedAt`, `escalationDue`, `response`,
  `resolution.resolvedAt` and `correctedAt`. Admin's dispute overview is a demo-only projection: the owner still has no read or
  list of disputes (**CF-70**, unchanged). No new Core follow-up. Business rules: [`design/assistance-a7-disputes.md`](design/assistance-a7-disputes.md).
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

> **Superseded at `0044b20` (F0, 2026-10-30).** The two paragraphs above are the A0 record (2026-10-01/02), kept unchanged. They
> are no longer true: Core V2 has an execution track S1–S8 (`docs/architecture/core-v2-s-execution-roadmap.md`), and S1 to S6
> are merged as **development and simulation** code, each a CONDITIONAL PASS (S5 not certified as a stage), with **no
> production deployment and no operational acceptance**. Core V1's localization refactor (R0–R11) is closed. Production
> services are unchanged (Core `docs/CORE-ROADMAP.md:55-62`, a documentary statement Admin has not verified). See
> [§11](#11-core-v2-s-track-alignment-f0-core-0044b20).

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
  Organization create is the clearest case: Core **authorizes** an assigned operator (`canCreateOrganization`), but the operator
  can never present the `organization.create` step-up, so Admin shows them the action disabled with that reason (P3b-S1, CF-08).

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

**F0 (`0044b20`):** the step-up row above describes one transport. Core now has **three** (Auth-local, service-verified and
receipt-bound), and the receipt-bound one is what every S6 money decision uses: [§11.4](#114-the-three-step-up-transports).
The session facts are unchanged (cookie sessions still absent; [§11.7](#117-d-a4-browser-session-dependency)).

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
- Organization lifecycle: **ADR-0060 is accepted** (lifecycle architecture), but its **runtime is deferred**
  (`docs/CORE-V3-ROADMAP.md:33` in Core). No `status`, provisioning, readiness or activation field exists in any Organization
  route or DTO today; Admin models none (CF-09). This is future architecture, not an implemented contract.

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

- **Create organization, verified 2026-10-23 (P3b-0)** (`organization-service/src/admin/admin.controller.ts:135-167`
  `createOrganization`):
  - Route `POST /organization/admin/organizations`, `HumanAuthGuard` (the caller's own bearer, grants from Auth).
  - Body (`domain/organization-input.ts:25-48`, limits `domain/input.ts:14`, rules `:22-49`): `platformId` (UUID, required),
    `name` (required, trimmed, 1–200), and the optional, nullable `taxCode` ≤ 64, `address` ≤ 500, `phone` ≤ 32, `type` ≤ 64
    (opaque free text, never interpreted). Every value is checked trimmed; an empty optional string is refused (send `null`);
    **unknown fields are invalid** (`400 invalid_organization_request`).
  - Order in the controller: `Idempotency-Key` (`:152`, missing or malformed → `400 idempotency_key_required`; format
    `[A-Za-z0-9._:-]`, 8–128) → normalise the body (`:153`) → the parent Platform (`:154`, unknown → **`404 not_found`**) →
    authority `canCreateOrganization` (`:155`, `admin/authorization-evaluator.ts:29-42`: **owner of the Platform's Company, or an
    operator assigned to the Platform**; otherwise `403 admin_forbidden`) → step-up `organization.create` (`:160`, missing,
    wrong-purpose, expired or spent → `403 step_up_required`) → repository create.
  - Repository (`organizations/organization.repository.ts:28-31, 46-72`, `ownership/ownership.service.ts:6-7, 41, 53-61`):
    `assertWritable` first (**`409 not_authoritative`** until the organization-service cutover), then the idempotency reservation
    and the insert in one transaction.
  - Success **`201`** with `OrganizationDto` (`organizations/organization.dto.ts`, `common/representation.ts:11-14`):
    `id, platformId, name, taxCode, address, phone, type, createdAt, updatedAt`. **No lifecycle status.** A replay answers
    **`200`** with `Idempotent-Replayed: true` and the stored result.
  - Note: the unknown-Platform refusal in source is `404 not_found` (from the Platform lookup), not a `platform_not_found` code.
    Admin shows both as the same tenant-safe refusal and never branches on the difference.
- **Idempotency (organization-service)** (`idempotency/idempotency.service.ts:10-55`): scope **(caller, operation, key)**; the
  request fingerprint is SHA-256 of the **normalised** request. Same key + same request → the stored result (replay); same key +
  another request → **`422 idempotency_key_reused`**. A failed attempt reserves nothing, so it does not consume the key. The
  step-up is consumed *before* the replay lookup, so a retry after an unknown outcome needs **the same key and a fresh step-up**;
  it never creates a second Organization.
- **Edit organization metadata, verified 2026-10-23 (P3b-0); built in Admin as a demo mock only (P3b-S2)**
  (`admin.controller.ts:169-189`): `PATCH /organization/admin/organizations/:id` with at least one of `name`, `taxCode`,
  `address`, `phone`, `type` (same limits; `null` clears an optional field; the name cannot be cleared; unknown and immutable
  fields are refused); **no step-up, no `Idempotency-Key`, no version or concurrency token**; a request that changes nothing
  writes nothing; success `200` with `OrganizationDto`. Authorized for the owner, an assigned operator, or an admin of that
  Organization (organization admins are not Admin actors). Writes are not authoritative before the cutover.
  - Admin sends only the changed fields. Because there is no key and no version, a lost answer is never resent
    automatically: the person reloads the current details and decides (P3b-S2). No audit event of the PATCH has been
    verified in source; the demo's `organization.updated` activity is a simulated record, not a Core audit contract.

### Memberships, users and access (Auth)

- Per organization (owner, operator, org admin): list memberships by status; approve / reject / revoke; join codes create / list /
  revoke (owner needs step-up); admin invitations (owner + step-up, operators refused); grant / revoke organization admin (owner +
  step-up). Controller: `auth-service/src/membership/organization.controller.ts`.
- **Admin invitations, source-verified 2026-10-23 (P3b-S3-0, Core `origin/main` `dd07f2a`); built in Admin as a demo mock
  only (P3b-S3).** Full design and contract: [`design/p3b-s3-admin-invitations.md`](design/p3b-s3-admin-invitations.md).
  Paths relative to `nawara-core/apps/auth-service/src/`:
  - Routes (`membership/organization.controller.ts:123-148`): `POST /auth/organizations/:organizationId/admin-invitations`
    (`201`), `GET …` (list), `POST …/:invitationId/revoke` (`204`, no body). UUID path ids (`ParseUUIDPipe`); step-up in
    `x-step-up-token`.
  - Body (`onboarding/dto.ts:32-39`): `invitationType` required, `^(?!admin$)[a-z][a-z0-9_-]{0,31}$` — an opaque,
    platform-defined audience label; **Core has no list of values**. `expiresInMinutes` optional integer (DTO 1–43,200);
    `inviteeContact` optional string ≤ 254. Unknown fields rejected (`libs/service-kit/src/bootstrap.ts:64`,
    `forbidNonWhitelisted`; `transform: false`, so numbers must be JSON numbers).
  - Expiry (`onboarding/invitation.service.ts:206-214`, `config/app-config.ts:276-281`): a duration; the server computes
    `expiresAt`; configured range default 15 min – 7 days, default 24 h; outside: `400 validation_error`.
  - Contact (`invitation.service.ts:72-78`, `:223`; `users/users.service.ts:19-21`): `@` → email trimmed and lowercased
    (format not checked); otherwise a phone stripped of spaces, `()`, `-` and matched to `^\+?[0-9]{8,15}$`; empty = no
    binding. Only an HMAC is stored; **the contact is never returned** (`contactBound` only).
  - Create (`invitation.service.ts:216-257`): body → throttle → Organization exists → transaction: authority (owner or
    organization admin, else collapsed `404 not_found`) → owner step-up `admin_invitation.create` consumed in the
    transaction → insert → audit. Answer `{ id, invitationType, expiresAt, createdAt, contactBound, code }`. A code
    collision is `409 conflict` (rolled back, step-up unspent). **No idempotency, no reconciliation route.**
  - Code (`crypto/join-code.ts:53-67`, ADR-0029): 12 Crockford characters (60 bits), `XXXX-XXXX-XXXX`, no prefix; shown once;
    HMAC only.
  - List (`invitation.service.ts:281-290`): `{ id, invitationType, contactBound, expiresAt, createdBy, createdAt,
    consumedAt, revokedAt, status }`, `status` derived consumed → revoked → expired → active; newest first; no pagination or
    filter; never the code or the contact. No step-up.
  - Revoke (`invitation.service.ts:259-278`): throttle → authority → step-up `admin_invitation.revoke` → update of an
    unconsumed, unrevoked invitation of that Organization (**expired ones included**). Otherwise `404 not_found`, rolled
    back (step-up unspent). Not idempotent. Never touches memberships.
  - Step-up (`owner/step-up.service.ts:41-43`, `:175-188`): both purposes accept TOTP or WebAuthn only, never the secret
    key; single use, owner-, session- and purpose-bound; default TTL 300 s.
  - Throttle (`config/app-config.ts:384`, `throttle/throttle.service.ts:39-40`): create and revoke share
    `invitation_manage_actor`, 20 per hour per actor by default, every attempt counted; `429 rate_limited`.
  - Audit (`invitation.service.ts:243-250`, `:272-276`): `admin_invitation.created` / `admin_invitation.revoked`. No event
    carries the code; nothing delivers invitations (ADR-0029 `:157-160`).
  - Core documentation drift (not Admin's to fix): the DTO says the type becomes the member's *role*, ADR-0030 and the code
    store it as the membership `audience`.
- **Memberships, source-verified 2026-10-23 (P5-S0, Core `origin/main` `b91b7bf`); the read is built in Admin as a demo
  mock only (P5-S1).** Full design: [`design/p5-users-and-memberships.md`](design/p5-users-and-memberships.md). Paths
  relative to `nawara-core/apps/auth-service/src/`:
  - List (`membership/organization.controller.ts:69-74`, `membership/membership.service.ts:87-97`): `GET
    /auth/organizations/:organizationId/memberships?status=`; `status` ∈ `pending | active | rejected` only
    (`onboarding/dto.ts:27-30`), **default `pending`** (Admin always sends it). **`revoked` exists but cannot be listed.**
    No pagination, search or sort; oldest request first. Readers: Company owner, operator assigned to the Platform,
    organization admin (`platform/platform-access.service.ts:95-110`); otherwise a collapsed `404`.
  - Row: `{ id, userId, status, requestedAt, approvedAt, rejectedAt, isOrganizationAdmin, email, phone, audience,
    contactVerified }`; raw email and phone for every reader. No name, provenance, `revokedAt` or decider.
  - **No single-membership read for administrators**: Admin resolves a membership's details from the three lists.
  - Approve / reject `POST …/memberships/:id/approve|reject` → `200 { id, status }`; `409 membership_already_decided`,
    `409 contact_not_verified` (approve); **no step-up**. **Built in Admin as a demo mock only (P5-S2;
    [`design/p5-s2-membership-decisions.md`](design/p5-s2-membership-decisions.md)).** Order (`membership.service.ts:100-129`):
    throttle → row locked by id and URL Organization (none: `404`) → authority (`404`) → **one's own membership: the
    same collapsed `404`** (not a distinct `403`) → not pending: `409 membership_already_decided` → approve with
    `REQUIRE_CONTACT_VERIFICATION` (default **false**, `config/app-config.ts:391`) and an unverified contact:
    `409 contact_not_verified` → conditional update (0 rows: `409`). Writes `status`, `approvedAt|rejectedAt`,
    `approvedBy|rejectedBy` (never returned); audit, central audit and an outbox event in the same transaction. No
    body, no idempotency key, no reason.
  - Revoke `POST …/memberships/:id/revoke` → `200 { id, status: 'revoked' }`; **no step-up**, no body, no idempotency.
    **Built in Admin as a demo mock only (P5-S3a;
    [`design/p5-s3-revocation-and-admin-role.md`](design/p5-s3-revocation-and-admin-role.md)).** Order
    (`membership.service.ts:148-192`): throttle → row locked by id and URL Organization (none: `404`) → authority
    (owner, assigned operator, organization admin; else `404`) → one's own membership: `404` → an organization admin
    revoking another admin: `404` (an owner or assigned operator may) → not active: `409 membership_not_active` (also
    for a repeat) → conditional update that also sets `isOrganizationAdmin = false`. Audit `membership.revoked`
    (`authority`, `wasAdmin`), central audit, outbox event. No administrative restore route exists; revoked rows are
    not listable (CF-24); re-join semantics unverified.
  - Admin role `POST | DELETE …/memberships/:id/admin` → `204`; owner only; step-up `organization.admin.grant|revoke`
    (TOTP or WebAuthn); the membership must be active. **Built in Admin as a demo mock only (P5-S3b;
    [`design/p5-s3-revocation-and-admin-role.md`](design/p5-s3-revocation-and-admin-role.md)).** Order
    (`membership.service.ts:194-218`): throttle → authority must be `owner` (operators and organization admins: the
    collapsed `404`) → step-up consumed in the transaction (`403 step_up_required`) → conditional update `status =
    'active' AND isOrganizationAdmin <> target` → no row: `404` and the transaction rolls back, so **the step-up is
    not spent** (unknown, another Organization's, not active, already admin for a grant, not admin for a removal).
    Audit `organization.admin.granted|revoked`, central `membership.admin_granted|admin_revoked`. No row lock, no last-
    admin rule; the grant does not check contact verification, while `organizationAuthority` requires it for an
    organization admin when `REQUIRE_CONTACT_VERIFICATION` is on (so such an admin may have no effective authority).
  - Suspend / restore (source on record from P5-S0, `members/member-security.controller.ts:1-60`,
    `member-security.service.ts:1-114`; **not built in Admin: P5-S4 is DEFERRED / BLOCKED BY CORE**, see
    [`design/p5-s4-account-suspension.md`](design/p5-s4-account-suspension.md)):
    - `POST /auth/admin/members/:id/suspend` with body `{ reason }`, reason ∈ `compromised_account | security_incident |
      policy_violation` (closed, `@IsIn`; free text `400`); `POST /auth/admin/members/:id/restore`, no body. `:id` is the
      member's **user id**. Both answer `200 { id, suspended, changed }` with `Cache-Control: no-store`.
    - **Owner only**: `@Actors('owner')`, so operators and members are refused by the guard with **`403`** (not a
      collapsed `404`).
    - Step-up `x-step-up-token`, purposes **`account.suspend` / `account.restore`**, **TOTP or WebAuthn only** (never the
      secret key), consumed inside the transaction.
    - Order: the owner's Company (none: `404`) → step-up consumed (`403`) → target locked `FOR UPDATE` → eligibility,
      else `404` with the transaction rolled back (**step-up not spent**) → already in that state: `200 changed:
      false`, nothing written (**step-up spent**) → `isActive` set; on suspend **every refresh-token family is revoked**
      (access tokens stop on the next request); restore does **not** recreate sessions → audit `account.disabled|
      enabled` (reason code only), central audit with `organizationId: null`.
    - Eligibility: `kind = member`, **at least one active membership in an Organization of the owner's Company**, and
      **no active or pending membership under another Company** (suspension is global). Unknown id, not a member, the
      owner, another Company's member and a shared identity are one indistinguishable `404`.
    - **Account-wide**: every Organization and every session of the person, not one membership; memberships, roles,
      subscriptions and payments are not changed.
    - Not available to Admin: the account's current state (no owner read; the membership list has no `isActive`), the
      person's other memberships, a member lookup (CF-03), a list of suspended accounts; no throttle on record.
      Hence CF-28 to CF-31.
  - Audience (owner clarification, 2026-10-23, from the Core join-code investigation): join codes carry an opaque
    `audience`, `requiresApproval` (pending vs active at registration) and `requiresSubscription` (a hint, not
    authorization). Nawara School's standard codes: `student` without approval, `teacher` with approval; a product
    default, not a Core rule. Admin never branches on the audience. Not source-verified here: what `approvedAt` holds for
    a membership admitted without approval (Admin labels it "Active since").
  - Throttle `membership_op_actor` 120 per 900 s. A member may hold memberships in several Organizations (ADR-0030); no
    administrative read finds them, and nothing counts distinct people.
- Operators (owner): create (step-up `operator.create`), confirm, block / unblock (deliberately no step-up), platform assignments
  grant / revoke (step-up) and history. Verified in P6-S0 at **origin/main `750eb21`** (2026-10-24, read only):
  - **Identity:** a `user` of kind `operator` (no password) plus an `operator` row (`userId` primary key, `companyId`,
    `contactVerifiedAt`): exactly one Company per operator; one email or one phone, unique across every account kind. Blocked
    is `user.isActive = false`; confirmed is `contactVerifiedAt`. Separate from members; never a membership.
  - **Assignments** (`platform_assignment`): an independent, append-only record (`id, operatorId, platformId, companyId,
    assignedBy, assignedAt, revokedAt, revokedBy, active`); a removal marks it, a re-grant inserts a new row; at most one active
    per operator and Platform (`platform_assignment_one_active`); same-Company composite keys make cross-Company assignments
    unrepresentable.
  - **Reads:** only `GET /auth/admin/operators/:id/platform-assignments` (owner; `200` every record oldest first; collapsed `404`
    for an unknown or another Company's operator) and the caller's own `GET /auth/grants`. **No** operator list, no single
    operator read, no read of blocked or confirmed state, no list of a Platform's operators (CF-03).
  - **Grant** `POST …/operators/:id/platform-assignments` `{platformId}`, header `X-Step-Up-Token` (`platform_assignment.grant`):
    `201 {id, platformId, assignedBy, assignedAt, revokedAt, active}`; `409 assignment_conflict` when already active; collapsed
    `404`; `503 hierarchy_unavailable` when the first touch of the Platform cannot reach Organization Service. **Revoke**
    `DELETE …/platform-assignments/:platformId` (`platform_assignment.revoke`): `204`; `404` when not active. One transaction
    each; the step-up is spent only on commit. Removal stops access on the operator's next request (live check) but ends no
    session.
  - **Create** `POST /auth/admin/operators` `{email}` or `{phone}` (exactly one), `operator.create`: `201 {id, email, phone,
    isActive}`; `409 account_already_exists` (any account kind; CF-33); no idempotency key (CF-32).
  - **Block / unblock** `POST …/operators/:id/block|unblock`, no body, no step-up, `204`, repeatable: block sets `isActive =
    false`, supersedes every unused code (login **and confirmation**) and revokes every session; assignments are kept; unblock
    restores no session.
  - **Factors:** `operator.create`, `platform_assignment.grant` and `.revoke` accept TOTP, a passkey **or the secret key**.
    Admin (P6-S2) offers the authenticator code only; every Admin step-up dialog does (passkey and secret-key step-up
    need a shared factor selector, a separate work item).
  - **Not verified:** the exact `429` answer of these routes (only the coarse per-IP throttle applies; Admin shows a
    generic "too many requests"); `503 hierarchy_unavailable` is verified for **grant only** (Admin treats any other
    `5xx` as unknown and reconciles).
  - **No** last-operator rule, no self-assignment (operators get `403`; the owner is never an operator); only the coarse per-IP
    throttle plus the step-up buckets apply.
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
  any operator read. Needs Company attribution in the audit contract (CF-04). Admin's `/audit` (P8-S1) is simulated
  activity only, never evidence that a Company- or Platform-wide read exists.
- **F0 (`0044b20`), 🟡 DEV-ONLY:** S2-Audit added `GET /audit/owner/company/records` (AUD-03, the owner's Company timeline),
  `GET /audit/operator/platforms/:platformId/records` (AUD-04, an operator's assigned Platform, live), Owner legal holds
  (`POST /audit/owner/company/legal-holds[/:holdId/release]`, service-verified step-up `audit.legal_hold.place` / `.release`)
  and the AUD-07 rule (only broker-verified records in the Organization read). **Not deployed:** production Audit is at
  migration 0003; S2-Audit needs 0004 (M9) and later, gates G-7 and AP-R (Core
  `docs/architecture/core-v2-s-execution-roadmap.md:227-229`, `:271`). CF-04 is answered in development only ([§9](#9-core-follow-ups)).

### File

- Every route is **service-token** (product backends) or ticket-redeem. No human/admin API. ADR-0050 D12 places File administration out
  of V1. → V2 A9.
- **F0 (`0044b20`):** S2-File added evidence grants, granted reads, holds and ticket leases, **still service-token only**: "No
  human, public or grantee route" (`file-service/src/grants/grant.controller.ts:41-42`). Several S6 Owner decisions require a
  File evidence grant (fraud holds, dispute evidence, an external surplus repayment), so Admin has **no way to supply
  evidence** (CF-71).

### Notification

- Service-token send / status / cancel only. No human API, no template administration API (templates are published by migration).
  → V2 A8.

### Billing

- Owns catalog, prices, invoices, payment requests and **Subscription/Entitlement** (ADR-0038, ADR-0044: one Subscription per
  Organization; no `License` entity).
- Human routes exist only for the **payer** of an invoice (`ServiceOrUserGuard`, relation-scoped, collapsed 404). No staff/operator
  administration; ADR-0050 D12 explicitly excludes staff commercial mutations from V1. Not in production. → V2 A10.
- **F0 (`0044b20`):** no longer true for development. S3, S5 and S6 added **Owner** routes (Platform commercial configuration,
  personal-product catalog, fees, assistance corrections, refund cases, fraud holds, recovery, late settlements, reconciliation
  cases, `FinancialLoss`) and one **operator** route family (fee proposals). Every one except the Platform commercial module
  **mounts nothing in production**, and Billing is not deployed. The invoice list is still payer- or producer-scoped. See
  [§11.5](#115-s3s6-financial-capability-register).

### Payment

- Settlement only; its only service caller is Billing. Human routes: the payer reads a payment and starts/syncs an attempt. No staff
  administration. Not in production. → V2 A11.
- **F0 (`0044b20`):** no longer true for development. S4 and S6 added Owner reads and decisions (`/payment/admin/disputes*`,
  `/payment/admin/reconciliation-items`, `/payment/admin/balances`, `/payment/admin/payments/:paymentId/balance`,
  `/payment/admin/provider-facts/:id/associations`), all **refused in production** (the modules mount nothing), on a
  **simulation provider only**; real providers are deferred and Payment's production disposition is MOVE V3. See
  [§11.5](#115-s3s6-financial-capability-register).

### Release

- Owner of the operating Company, with factor step-up: `POST /release/admin/products/:product/components/:component/releases/:version/withdraw`
  (`release.withdraw`) and `…/compatibility-policy` (`compatibility_policy.change`). Not in production.
- Public: `GET /release/products/:product/components/:component/compatibility?version=` (rate-limited, ETag).
- **No human read/list of products, releases or policies** (CF-05). Register/publish are CI-only (service token).
- **F0 (`0044b20`), 🟡 DEV-ONLY:** S2-Rel added the Owner reads `GET /release/admin/products`,
  `…/components/:component/releases` and `…/compatibility-policy/history` (REL-01 to REL-03). Release is still not in
  production (MOVE V3). The withdraw and policy commands use the **service-verified** step-up transport ([§11.4](#114-the-three-step-up-transports)).
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
- **Superseded for P7 (owner decisions D1–D9, 2026-10-24):** no license wizard is built. Admin shows Organization subscriptions
  and their entitlement read only (P7-S1, `/licenses`; P7-S2, `/licenses/platforms/:platformId` and the Organization
  detail's Subscription section; demo mocks), and says plainly that plans, seat allocation, subscription
  changes and revenue are not available. Proposed follow-ups CF-36 to CF-42 (§9); none is an existing endpoint.
- **F0 (`0044b20`):** still no `License` entity and still **no human read or command** for an Organization subscription or
  entitlement: the entitlement reads (BIL-09, BIL-11) are service-token only (`entitlement.read`), and S3b **retired**
  Billing's direct `activate()` / `renew()`; an Organization period now exists only through a recorded verified settlement
  (Core `docs/architecture/core-v2-s3-billing.md`, S3b). Admin must not offer "activate" or "renew". The fixed grace is now a
  Core rule (Organization exactly 24 hours, Personal none). CF-36, CF-37, CF-41 and CF-42 stay open; CF-38 is answered for
  personal products only ([§9](#9-core-follow-ups)).

## 7. Contract matrix

🟢 EXISTING / CONFIRMED · 🟡 PLANNED V2 / MOCKED · 🔴 UNDEFINED. "Prod" = deployed in production today.

> **F0 reading notes (`0044b20`).** (1) "Prod" records Core's own documentary production context at the time each row was
> written (Core `docs/CORE-ROADMAP.md:55-62`); Admin has **never verified** a running environment, and Core records that
> production Auth runs a legacy image that has drifted from its recorded digest (`:62`). "🟢 Prod" is therefore **not**
> operational proof of any route. (2) A fourth state applies from F0: **🟡 DEV-ONLY**, implemented and merged in Core for
> development and simulation, refused or undeployed in production ([§11.2](#112-contract-states-from-f0)). (3) Rows marked
> 🔴 for Audit Company/Platform reads, the Release catalog and Billing/Payment administration are partly answered by 🟡 DEV-ONLY
> routes at `0044b20`; the rows are kept as written and annotated below; [§11.5](#115-s3s6-financial-capability-register) and
> [§11.9](#119-current-admin-feature-and-mock-coverage) are current.

| Admin capability | Core owner | Status | Evidence | Admin strategy |
|---|---|---|---|---|
| Owner login (password + TOTP/passkey) | Auth | 🟢 Prod | `auth.controller.ts` `login`; `owner.controller.ts` `login/owner/*` | HTTP adapter (A4) |
| Owner first-factor enrollment | Auth | 🟢 Prod | `owner.controller.ts` `enroll/*` | HTTP (A4) |
| Owner recovery | Auth | 🟢 Prod | `owner.controller.ts` `recovery/*` | HTTP (A4/A7) |
| Operator login (working code) | Auth | 🟢 Prod | `operator.controller.ts` `login/operator/*` | HTTP (A4) |
| Operator contact confirmation | Auth | 🟢 route; reissue 🔴 (CF-16); docs vs source 🟡 (CF-17) | `operator.controller.ts` `operators/confirm` | mock adapter (A4-S3, development only); HTTP later |
| Session refresh / logout | Auth | 🟢 Prod | `auth.controller.ts` `refresh`, `logout` | HTTP; storage strategy = decision D-A4 |
| Current user / grants | Auth | 🟢 Prod | `GET /auth/me`, `GET /auth/grants` | HTTP (A4/A6) |
| MFA factor management | Auth | 🟢 Prod (verified P9-S4-0, `304064f`) | `owner.controller.ts` `factors*` (list; add TOTP begin/confirm + step-up `owner.factor.enroll`; passkey options/register; remove + step-up `owner.factor.remove`, never the last confirmed) | List: `AccountSecurityGateway.load()`, mock in demo builds over `DemoAuthState` (P9-S4a, read only), unavailable otherwise. Add TOTP: **P9-S4b**, `beginTotp()` / `confirmTotp(factorId, code, stepUpToken)` mock-first (begin replaces only an unconfirmed TOTP; step-up `owner.factor.enroll` checked first and spent on commit; `400 verification_failed` rolls back; begin + confirm share 10/hour; lost answers reconciled by the list, never resent; authenticator-code proof only, so a passkey-only owner cannot add one yet; no Core API cancels an unfinished setup); unavailable in production. Remove: **P9-S4d**, `removeFactor(factorId, stepUpToken)` mock-first (a dialog on Security; confirmed factors only; never the last confirmed factor, never the last authenticator app while only passkeys remain; step-up `owner.factor.remove` checked first and spent on commit; `404` absent, `409 factor_required`; unclear answers settled by the list, never resent; pending enrollments cancelled; sessions untouched); unavailable in production. Passkeys later; no HTTP adapter (A4). Details: `design/p9-s4-account-security.md` §10, §12 |
| WebAuthn (passkeys) | Auth | 🟢 Prod | `webauthn-options`, `factors/webauthn*`; RP `nawara-solutions.com` | HTTP + browser WebAuthn API (A4) |
| Owner step-up | Auth | 🟢 Prod | `POST /auth/admin/step-up`, `x-step-up-token` | `StepUpGateway` (P4-S1): simulated mock in demo builds (opaque in-memory grant, single use, purpose- and user-bound, expiring, never Core evidence), unavailable otherwise; purposes limited to documented ones in use: `platform.create` (P4-S1), `organization.create` (P3b-S1). Both accept TOTP, WebAuthn and secret key (`auth-service/src/owner/step-up.service.ts:23-56`); the demo simulates TOTP only. Later purposes are listed on `StepUpPurpose`, among them `owner.factor.enroll` (P9-S4b), `owner.secret_key.rotate` (P9-S4c) and `owner.factor.remove` (P9-S4d), all TOTP or WebAuthn, never the secret key |
| Operator step-up | Auth | 🟡 | ADR-0042 A.1 accepted, not built | Hide/disable sensitive ops for operators |
| Secret key rotate / password change | Auth | 🟢 Prod (verified P9-S4-0) | `secret-key/rotate` (step-up `owner.secret_key.rotate`, factor only; key returned once; not idempotent), `password/change` (step-up `owner.password.change`, factor only; no current password; ends other sessions) | Rotate: **P9-S4c**, `rotateSecretKey(stepUpToken)` mock-first ("Create a new secret key": first or replacement alike; step-up `owner.secret_key.rotate` checked first and spent on commit; the key shown once, masked; `401`/`403`/`429` definite, anything else unknown and never resent; demo verifier is a DEMO-only digest in `DemoAuthState`); unavailable in production; no HTTP adapter (A4). Password change: **P9-S4e**, `changePassword(newPassword, stepUpToken)` mock-first (`/settings/security/password`; Core's limits only, sent as typed; step-up `owner.password.change` checked first and spent on commit; `400 validation_error` definite, anything else unknown and never resent; this session continues, the owner's other sessions end at their next request; demo verifier and session ids in `DemoAuthState`); unavailable in production. No status read of the key (CF-54); no alert on either (CF-55); two-phase rotation and pending-recovery effect proposed (CF-60, CF-61). Details: `design/p9-s4-account-security.md` §11 |
| Organization directory (list/search) | Organization | 🔴 | org lists are service-token only | `OrganizationGateway.list(platformId)`, mock in demo builds (P3a); search, filters and sort in the browser; **CF-02** (V2 A5) |
| Organization detail | Auth (today) → Organization | 🟢 Prod | `GET /auth/admin/organizations/:id` | `OrganizationGateway.load(organizationId)`, mock in demo builds (P3a); the response shape is **not verified yet**, so no HTTP adapter; the UI checks the answer's Platform against the URL |
| Organization commercial facts (owner): subscription, payment issues, effective assisted-payments policy | Billing / Payment | 🟡 | no staff/owner read route before Core V2 A10/A11 | `OrganizationCommercialGateway`, PROVISIONAL mock contract (P3a); never called for an operator; the directory's subscription filter is a client-side mock capability |
| Organization create / edit | Organization | 🟢 contract · ⚠ not authoritative | `/organization/admin/*` | Gateway ready; **writes disabled by config until cutover** |
| Platform create / edit | Organization | 🟢 contract · ⚠ not authoritative | `/organization/admin/platforms*` | Same |
| Organization lifecycle (suspend/archive) | Organization | 🔴 | BD-5 undecided | Placeholder only |
| Memberships — list (one Organization, by status) | Auth | 🟢 Prod | `GET …/memberships?status=` | `MembershipGateway.list(organizationId, status)`, mock in demo builds (P5-S1); detail resolved from the lists; **CF-23, CF-24, CF-25** |
| Memberships — approve/reject | Auth | 🟢 Prod | `POST …/memberships/:id/approve\|reject` | `MembershipGateway.decide(organizationId, id, decision)`, mock in demo builds (P5-S2); never resent after a lost answer; **CF-26** |
| Memberships — revoke | Auth | 🟢 Prod | `POST …/memberships/:id/revoke` | `MembershipGateway.revoke(organizationId, id)`, mock in demo builds (P5-S3a); never resent after a lost answer; **CF-26, CF-27** |
| Join codes / admin invitations | Auth | 🟢 Prod | `organization.controller.ts` | HTTP (A7) |
| Organization-admin grant/revoke | Auth | 🟢 Prod | `memberships/:id/admin` | `MembershipGateway.setOrganizationAdmin(org, id, admin, { stepUpToken })`, mock in demo builds (P5-S3b); owner only, factor step-up; never resent after a lost answer; **CF-27** |
| Operators (create/confirm/block/unblock) | Auth | 🟢 Prod (verified P6-S0, `750eb21`) | `operator.controller.ts` | Block / unblock: **P6-S3**, owner-only "Block account" / "Unblock account" against a demo-world mock (no step-up, as Core; codes cancelled and the operator's session ended on block; nothing restored on unblock; lost answers reconcile against the DEMO state and allow only an explicit repeat). **No HTTP adapter**; Admin cannot re-read the account state from Core (CF-03, CF-35). Create: **P6-S4**, owner-only "Create operator…" (one contact, step-up `operator.create` spent on commit, zero assignments, neutral `409`; lost answers reconciled against the DEMO directory only, never resent) against the same mock; production does not offer it (no directory: CF-03; no idempotency or lookup: CF-32) |
| Signed-in operator's own Platform list after a change | Auth | 🟢 `GET /auth/grants` (live; `401` for an inactive account or an ended session) | `grants.service.ts`, `auth.guard.ts` | **P6-S2b**: `OperatorGrantsRefresh` re-reads it after a refused Platform read, on tab return, on a Platform switch and on "Try again" (single flight, stale answers dropped, never polls); a genuine `401` ends the local session (sign-in, reason `session-expired`); transient failures keep the last list. Display only: Core still authorizes every request. Against the demo `AuthGateway` mock; the HTTP adapter (A4) must map `401` and the unverified `429` |
| Platform assignment grant / revoke | Auth | 🟢 Prod (verified P6-S0) | `platform.controller.ts` `POST/DELETE …/platform-assignments` | P6-S2: owner-only "Give access" / "Remove access" (step-up `platform_assignment.grant` / `.revoke`, spent on commit; `409` / `404` / `503` / lost answer reconcile by reloading the history, never resent) against a demo-world mock; **no HTTP adapter**; the dialog offers the authenticator code only, though Core also accepts a passkey or the secret key (shared factor selector: separate work item) |
| Operator assignment history | Auth | 🟢 Prod (verified P6-S0) | `GET /auth/admin/operators/:id/platform-assignments` | `OperatorAssignmentGateway` in Core's shape (P6-S1); mock in demo builds, unavailable adapter otherwise: **no HTTP adapter authorized yet**, and no operator ids without a directory |
| Operator directory and one operator's account (contact, blocked, confirmed) | Auth | 🔴 | no list or single read; documented only (ADR-0012, SDD, TDD) | `OperatorDirectoryGateway`, PROVISIONAL mock contract (P6-S1) over the demo world; production "not available"; **CF-03** |
| Platform assignments | Auth | 🟢 Prod | `platform.controller.ts` | HTTP (A7) |
| Member suspend / restore | Auth | 🟢 Prod | `POST /auth/admin/members/:id/suspend\|restore` | **Deferred / blocked by Core** (P5-S4): no owner read of an account's state; a read-only "Nawara account" card only; **CF-28–CF-31** |
| User search / identity directory | Auth | 🔴 | none | Mock; **CF-03** |
| Roles / permissions catalog | Authorization | 🟡 | V2 A6 | UX capability model from grants |
| Audit — one organization (owner) | Audit | 🟢 Prod | `owner-query.controller.ts` | HTTP (A9) |
| Audit — platform-level / operator reads | Audit | 🔴 · **F0: 🟡 DEV-ONLY** (AUD-03 owner Company timeline, AUD-04 operator Platform read; not deployed) | ADR-0050 D6 excludes · F0: `audit-service/src/owner/scoped-query.controller.ts:44-59` | Placeholder; **CF-04** (answered in development only) |
| Files | File | 🟡 | V2 A9; V1 service-token only | Mock (A12) |
| Notifications | Notification | 🟡 | V2 A8; V1 service-token only | Mock (A12) |
| Billing administration | Billing | 🟡 · **F0: 🟡 DEV-ONLY** Owner financial routes, refused in production ([§11.5](#115-s3s6-financial-capability-register)) | V2 A10; V1 payer/service only | Mock (A11) |
| Payments administration | Payment | 🟡 · **F0: 🟡 DEV-ONLY** Owner disputes, reconciliation and balances, refused in production ([§11.5](#115-s3s6-financial-capability-register)) | V2 A11; V1 payer/Billing only | Mock (A11); **P7-S3**: owner-only read-only `/billing` payment follow-ups (`BillingGateway`, mock in demo builds, unavailable otherwise): Organization, Platform, failed / awaiting action only; no amount, invoice, settlement, refund or operation (CF-40 proposed) |
| License / entitlement | Billing (decided) | 🟡 contract TBD | ADR-0038/0044; roadmap "Licenses" | **P7-S1**: owner-only read-only `/licenses` overview (`LicensesGateway`, mock in demo builds, unavailable otherwise): subscription states, entitlement (active or grace), per-Platform distribution, declared Personal Premium; **P7-S2**: one Platform's Organization subscriptions (`LicensesGateway.platform`) and the Organization detail's entitlement row (`OrganizationCommercialGateway.load`); no wizard, no command (CF-36 to CF-42 proposed) |
| Release withdraw / minimum version | Release | 🟢 (not Prod) | `release-service/src/admin/admin.controller.ts` | HTTP (A10) |
| Release catalog / history read | Release | 🔴 · **F0: 🟡 DEV-ONLY** (REL-01 to REL-03; Release not in production) | none for humans · F0: `release-service/src/admin/read.controller.ts:66-96` | Mock; **CF-05** (answered in development only) |
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
| Unique identities (distinct accounts) across the Company | Auth | 🔴 | none; must never be a sum of memberships (CF-03, CF-11) | Shown unavailable, demo builds included: no person records before P5 (P2.5, D3) |
| Pending invitations, company-wide | Auth | 🔴 aggregate (🟢 per organization) | `GET /auth/organizations/:id/admin-invitations` lists one organization, derived `active` status | **Provisional demo definition:** organization-admin invitations with status `active` across the Company's organizations (CF-11) |
| Organization growth history | Organization | 🔴 | no history or time-series route (CF-12) | Mock, derived from the demo world's Organization creation dates (P2.5) |
| "Needs attention" signals | Auth / Organization | 🔴 | none (CF-13) | Mock, fictional items |
| Recent administrative activity, company-wide | Audit | 🔴 | owner reads one organization per request, ≤ 31 days; platform-level records service-only (CF-04) | Mock: the demo world's Platform events, newest first (P2.5) |
| Audit log page (`/audit`, P8-S1) | Audit | 🔴 Company / Platform-wide (CF-04) · 🟢 one organization (not integrated) | the owner's one-Organization read is not called; no Company- or Platform-wide read exists | **Simulated** administrative activity (`ActivityGateway`, mock in demo builds, unavailable otherwise), labelled "not Core audit evidence"; no export, no change field (CF-45), no Core window semantics claimed (CF-47). Core Audit integration is NOT done |
| Create organization | Organization | 🟢 contract · ⚠ not authoritative | `POST /organization/admin/organizations` (see §5, verified P3b-0) | P3b-S1: the owner's flow (name + optional metadata → step-up `organization.create` → idempotent command) against a demo-world mock that succeeds by default, `409 not_authoritative` as a scenario; operators see it disabled (no operator step-up, CF-08); production binds the unavailable adapter (no HTTP adapter yet) |
| Edit organization metadata | Organization | 🟢 contract · ⚠ not authoritative | `PATCH /organization/admin/organizations/:id` (§5) | P3b-S2: "Edit details" for the owner and assigned operators (no step-up), minimal patch, `null` clears, no automatic resend; demo-world mock (succeeds by default; `409 not_authoritative`, lost answer and `503` as scenarios); production binds the unavailable adapter (no HTTP adapter) |
| Organization admin invitations | Auth | 🟢 | `organization.controller.ts:123-148` (§5, verified P3b-S3-0) | P3b-S3: owner-only card on the Organization details; create (step-up `admin_invitation.create`, the code shown once, never stored), list (derived status, `contactBound` only), revoke (destructive confirmation + step-up `admin_invitation.revoke`); no automatic retry after a lost answer; demo-world mock; production binds the unavailable adapter (no HTTP adapter) |
| Create platform | Organization | 🟢 contract · ⚠ not authoritative | `POST /organization/admin/platforms` (see §5) | P4-S1: the owner's flow (confirm → step-up `platform.create` → idempotent command) against a demo-world mock, `409 not_authoritative` as a scenario; production binds the unavailable adapter (no HTTP adapter: response DTO not verified, writes not authoritative before cutover) |
| Access & security: owner account security | Auth | 🟢 Prod (verified P9-S4-0) | `GET /auth/admin/factors` (owner, bearer-scoped) | "Account security" links to `/settings/security` (P9-S4a): the owner's factors read only (type, confirmed or unfinished, added and last used as known); recovery explained without promises; no score; the "2FA enabled" line stays a policy statement, not a read. From there, "Add an authenticator app" (P9-S4b, mock-first) and "Create a new secret key" (P9-S4c, mock-first); each confirmed factor offers "Remove" (P9-S4d, mock-first) |
| Access & security: operator assignments vs unique operators | Auth | 🔴 | assignments readable only per operator (`GET /auth/admin/operators/:id/platform-assignments`); no operator directory (CF-03) | Mock; assignments and unique operators kept as separate figures |
| Attention: access assignments to review | Auth | 🔴 | none (CF-13) | Not shown: removed in P2.5 (no defined source), no replacement |
| Commercial: active licenses, expiring soon (+ attention item) | Billing | 🟡 | no `License` entity; entitlement read is service-token only, per organization, `{ valid, expiresAt }`; no staff API; not in production | Separate `CommercialSummaryGateway`, mock in demo builds; "license" is a view-model term (§6) |
| Commercial: payment issues | Payment / Billing | 🟡 | payer-only human routes; no staff API; not in production | Same gateway, mock |
| Services & health (Auth, Organization, Release, Billing, Payment, File, Notification, Audit) | all / observability | 🟡 (CF-06, V2 A12) | each service: unauthenticated `/health` → `{status:'ok'}`, `/ready` → `ready \| unavailable` (service kit); no aggregation, no "delayed" state, not an operator API; billing, payment, file, notification, release not in production | **P8-S2:** one shared `ServiceInventoryGateway` (mock in demo builds, unavailable otherwise) for `/services` and the Company Overview card: the eight documented services and their responsibilities, and "Live health unavailable"; no status, count, uptime, latency or version; the illustrative fixture is removed; the browser never calls the probes |
| Platform dashboard (`/platforms/:platformId`): figures, newest Organizations, attention, activity | Organization / Auth / Audit | 🔴 | no human route lists or aggregates a Platform's Organizations, memberships or signals (CF-02, CF-03, CF-11, CF-13); no platform-level or operator audit read (CF-04) | `PlatformDashboardGateway`, mock in demo builds; "unavailable" otherwise |
| Platform dashboard, commercial (owner): Organization subscriptions, Personal Premium, payment issues, assisted-payments policy (read only) | Billing / Payment | 🟡 | no staff/owner read route before Core V2 A10/A11; rules from the Core V2 architecture (24-hour grace, Personal Premium without grace, Platform-controlled assisted payments) | `PlatformCommercialGateway`, mock in demo builds; operators never ask |
| Platform directory (`/platforms`): Platforms with organizations, memberships, operator assignments | Organization / Auth | 🔴 | no human route lists a Company's Platforms or their counts (CF-02, CF-03, CF-11) | `PlatformDirectoryGateway`, mock in demo builds; "unavailable" otherwise |
| Unread notification count (sidebar badge, top-bar bell, `/notifications`) | Notification | 🟡 | delivery only; no human inbox or unread-count route (CF-14) | `NotificationSummaryGateway` through the shell's one `NotificationIndicator`, mock in demo builds (the signed-in session's own count; no identity parameter); unavailable otherwise: no badge, no dot, and the page says so. **P8-S3:** a personal count only, no message, no read/dismiss action (CF-44, CF-48 proposed) |
| Releases (`/releases`, P8-S4) | Release | 🟢 actions (not prod, not verified by Admin) · 🔴 catalog (CF-05) | `release/admin/...` withdraw / compatibility policy (`OwnerGuard`) | Owner-only **information page** (`ReleaseInformationGateway`, mock in demo builds, unavailable otherwise): what the service owns and how each capability stands; no release list, no version, no command, enabled or disabled |
| Personal Settings (`/settings` hub, `/settings/appearance`, `/settings/language`; P9-S1) | none (browser-local) | — | no Core contract involved | Theme, accent and language in the preference registry only (`nw.theme`, `nw.accent`, `nw.locale`); the one `ThemeService` and `LocaleService` state; never synchronized with a Core account. Account, security, Company and Platform settings are later P9 slices: security and Platform settings first need a read-only Core verification (factors, secret key, password; Platform PATCH); CF-49 to CF-53 proposed |
| Personal Account (`/settings/account`, P9-S2): the signed-in person's own account | Auth | 🟢 `GET /auth/me`, `GET /auth/grants` (the session's facts); 🔴 no further account read used | `auth.controller.ts`, `grants.service.ts` (per §4, §7) | Read only, from `AuthSession` and the shell's `ScopeContext` (Company name: scope directory, CF-02; an operator's Platforms: current grants named by the directory, P6-S2b refresh on "Try again"); no identity parameter; no display name (CF-53); an operator's "contact confirmed" is derived from Core issuing working codes only to confirmed contacts. No HTTP adapter (A4); account-read details beyond `/auth/me` stay deferred |
| Company settings (`/settings/company`, P9-S3): the Company's name and Platform count, links to existing administration | Organization / Auth | 🔴 no human Company read or edit (CF-02, CF-49) | — | Owner only (`company.settings.view`); `CompanySettingsGateway`, a mock in demo builds over the demo world's scope-directory selector (no session `401`, non-owner `403`, another Company `404`), unavailable otherwise; read only, no edit control; CF-49 stays open |

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

**Added at F0 (`0044b20`), for the receipt-bound and money routes ([§11.4](#114-the-three-step-up-transports)); not yet used by any
Admin code:**

- An **authorization receipt** secret (`POST /auth/admin/authorization-receipts`) is returned **once**, lives **10 minutes**
  (`auth-service/src/receipts/authorization-receipt.service.ts:14-15`) and is sent only as `receiptSecret` in the body of its one
  consuming Billing or Payment route. It is never stored, logged, put in a URL, kept in an idempotency record or queued for retry.
  **[Erratum E-3, 2026-10-30 ([§11.12](#1112-errata-f1-s0-2026-10-30)):** "never queued for retry" is too strong. Core documents
  an identical repeat of the same request (same `Idempotency-Key`, same `receiptSecret`) for an unresolved answer, so the secret
  may have to stay **in memory** for the life of one financial intent. It is still never persisted, logged or put in a URL.**]**
- Receipt issuance replay: `409 receipt_issued_response_lost` means the receipt is **voided** (start again from a new step-up);
  `503 receipt_outcome_unknown` means replay the **same** `Idempotency-Key`. Never return a stored secret.
- A receipt step-up token is **never** sent as `x-step-up-token` to a domain route: Core's `POST /auth/step-up/verify` refuses
  the receipt purposes without consuming them.
- Money commands are idempotency class M (90 days, `Idempotency-Key` required, permanent uniqueness key). A `503` that Core
  documents as "recorded" (for example `refund_authorization_unresolved`) is settled by **re-reading** the resource, never by a
  new receipt.
- Never send an amount, `liveMode` or any value Core derives; refunds take no amount (full purchase only).
- Admin never calls `/auth/service/*`, `/payment/simulation/*`, `/payment/webhooks/*`, or any File, Notification or
  Organization service-token route.

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
F0 status (`0044b20`): OPEN, unchanged. Cookie sessions are absent, CORS stays `credentials: false`
                  (`libs/service-kit/src/bootstrap.ts:50`); Core's A4 record places cookie sessions and a BFF in A16
                  (`docs/architecture/core-v2-a4-authentication.md:41`, `:111`). See §11.7.

CF-02  Human-scoped hierarchy read API
Service:          organization-service (after cutover) / Auth (today)
Current behavior: no human route lists Companies, Platforms or Organizations.
Admin requirement: owner lists their Company's Platforms/Organizations; operator lists those of assigned Platforms; cursor paging, filters.
Classification:   🔴 → design in V2 A5 (+ A6 for scope).
V1 or V2:         V2.
Recommended checkpoint: Core V2 A5.
F0 status (`0044b20`): OPEN and now explicitly out of Core V2: contract-register entry **ORG-00 "No Core V2 contract"** defers
                  human hierarchy reads until authority activation (F7); S8 is conditional (PR #319, C-5, A5.4-G1). See §11.6.

CF-03  Owner-scoped operator and member directories
Service:          auth-service
Current behavior: operators can be created/blocked but not listed; members visible only per organization.
                  P6-S0 (origin/main 750eb21): no route lists a Company's operators, reads one operator, exposes an
                  operator's blocked (user.isActive) or confirmed (contactVerifiedAt) state, or lists a Platform's operators.
                  GET /auth/admin/operators and GET /auth/admin/operators/:id exist only in ADR-0012, the SDD and the TDD.
                  Admin P6-S1 builds the directory on a provisional mock and shows "not available" in production.
Admin requirement: list/search operators of the Company, and read one, with id, contact, created date, blocked and confirmed
                  state and active Platform ids; find a user across the owner's organizations (minimized projection,
                  ADR-0050 D11).
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
F0 status (`0044b20`): ANSWERED IN DEVELOPMENT ONLY. AUD-03 `GET /audit/owner/company/records` (owner, Company scope, ≤31 days,
                  100 per page) and AUD-04 `GET /audit/operator/platforms/:platformId/records` (operator, live assignment) are
                  merged (#355); not deployed (M9, G-7, AP-R). Admin keeps `/audit` simulated until a deployed contract exists.

CF-05  Release catalog read for the owner
Service:          release-service
Current behavior: owner can withdraw and change policy but cannot list products/components/releases/policies.
Admin requirement: render the release history to choose what to withdraw. Until then `/releases` (P8-S4) only
                  explains the service; withdraw and minimum-version stay unoffered until their contracts, authority
                  and step-up are separately verified.
Classification:   🔴 OPEN
V1 or V2:         V2 (A16/A15) or a scoped V1 addition if the owner authorizes.
Recommended checkpoint: owner decision; default V2.
F0 status (`0044b20`): ANSWERED IN DEVELOPMENT ONLY. REL-01 to REL-03 (`release-service/src/admin/read.controller.ts:66-96`,
                  merged #358); Release is not in production (MOVE V3).

CF-06  Operator-facing service health
Service:          all / observability
Current behavior: /health and /ready probes only.
Admin requirement: an authenticated, aggregated, read-only health/status view. Until then `/services` (P8-S2) shows
                  the documented inventory with "Live health unavailable", and the probes are never called.
Classification:   🟡 (V2 A12). OPEN.
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
Admin requirement: operators performing organization create and future sensitive operations. Organization create is authorized
                  for assigned operators by Core (canCreateOrganization) but needs the organization.create step-up, which
                  operators cannot obtain: Admin shows it disabled for them (P3b-S1).
Classification:   🟡
V1 or V2:         V2 A4/A6.
Recommended checkpoint: Core V2 A4.

CF-09  Organization lifecycle
Service:          organization-service
Current behavior: ADR-0060 (lifecycle architecture) accepted; runtime deferred (Core docs/CORE-V3-ROADMAP.md:33). No status,
                  provisioning, readiness or activation field exists in any route or DTO.
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
Recommended checkpoint: with the Notifications page. P8-S3 (`/notifications`) shows the demo count only; OPEN.

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
                  P6-S0 (origin/main 750eb21) confirms it: block supersedes every unused code of both purposes
                  (operator-admin.service.ts:51) and unblock issues none, so an operator blocked before confirming can never
                  confirm, even after an unblock. No Core test covers that sequence.
Admin requirement: a way to obtain a new confirmation code (operator-requested and/or owner-triggered), with the same
                  enumeration and rate-limit care as request-code. Whether re-creating the same identifier is refused is
                  🟡 unverified.
Classification:   🔴 missing capability.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the A4-S3 HTTP integration and A7 operator administration (the A4-S3 mock prototype is built
without any reissue: it offers none and points to the company owner). P6-S4 (mock creation) offers none either: the
created operator's page says the code expires and cannot be resent, and that blocking cancels it for good.

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

CF-21  Owner enrollment routes: SDD versus source
Service:          auth-service (documentation and source)
Current behavior: recorded, not resolved here (origin/main 1ad43d2). docs/sdd/auth-service.md (factor section, ~1997–2001)
                  says first-factor enrollment uses POST /auth/admin/factors/* with "Bearer or the enrollmentToken". The source
                  takes the enrollment token only on POST /auth/admin/enroll/totp, enroll/totp/confirm, enroll/webauthn/options
                  and enroll/webauthn, as a body field (owner/owner.controller.ts:70–99, owner/dto.ts); the factors/* routes
                  require an owner session (@Actors('owner')) and, once a factor exists, step-up owner.factor.enroll.
Admin requirement: Core states which route family is the contract. Until then Admin follows the source: enrollment-token
                  calls go to enroll/*, never to factors/*; adding a factor from a session is a separate flow.
Classification:   🟡 documentation/source discrepancy.
V1 or V2:         V1 (documentation or source fix, Core owner's choice).
Recommended checkpoint: before the A4-S4 HTTP integration.

CF-22  Owner enrollment completion: SDD versus source
Service:          auth-service (documentation and source)
Current behavior: recorded, not resolved here (origin/main 1ad43d2). docs/sdd/auth-service.md (sign-in section, ~1934–1937)
                  says the mfa_required / enrollment_required flow "completes at POST /auth/admin/login/owner/verify". In the
                  source, login/owner/verify accepts only login_mfa challenge tokens; enrollment completes at
                  enroll/totp/confirm or enroll/webauthn, which consume the enrollment token and issue the first session
                  ({accessToken, refreshToken, expiresIn}) in the same transaction (owner/enrollment.service.ts:78–102).
Admin requirement: Core states the intended completion. Until then Admin follows the source: a confirmed enrollment establishes
                  the session directly and is followed by the usual identity/access resolution, with no further MFA challenge.
Classification:   🟡 documentation/source discrepancy.
V1 or V2:         V1 (documentation or source fix, Core owner's choice).
Recommended checkpoint: before the A4-S4 HTTP integration.

CF-23  Membership list returns raw contacts to every administrative reader
Service:          auth-service
Current behavior: (origin/main b91b7bf) membership.service.ts:87-97 returns each row's email and phone to the Company owner,
                  assigned operators and organization admins alike. ADR-0050 decision 11 (:200-201) describes administrative
                  reads as purpose-specific projections ("identifiers, state, timestamps"), never "everything about a user".
Admin requirement: Core states which projection each reader gets (for example masked contacts for operators). Until then Admin
                  shows the minimum (email, else phone, else a neutral reference), keeps contacts out of URLs, storage, logs,
                  titles and breadcrumbs (P5-S1).
Classification:   🟡 documentation/source tension (privacy minimization).
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the membership HTTP integration.

CF-24  Revoked memberships cannot be listed; no single-membership read
Service:          auth-service
Current behavior: (origin/main b91b7bf) ListMembershipsQuery accepts pending | active | rejected only; revoked rows exist but no
                  administrative route returns them, and there is no GET of one membership for administrators.
Admin requirement: a revoked filter (or an explicit decision that revoked history is audit-only), and optionally a detail read.
                  Until then Admin has no Revoked tab and resolves details from the three lists; an id in none is "not found".
Classification:   🟡 contract addition.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S3 (revoke).

CF-25  Membership list has no pagination
Service:          auth-service
Current behavior: (origin/main b91b7bf) every row of one status is returned in one answer, oldest request first.
Admin requirement: cursor pagination (and ideally server-side search) before large Organizations; Admin searches, filters and
                  sorts in the browser over the loaded rows.
Classification:   🟡 scalability; contract addition.
V1 or V2:         V2 unless Organizations grow large earlier.
Recommended checkpoint: before production use with large Organizations.

CF-26  Approve, reject and revoke carry no step-up
Service:          auth-service
Current behavior: (origin/main b91b7bf) approve, reject and revoke take the bearer only; the admin-role and suspension routes
                  require a factor step-up.
Admin requirement: Core confirms this is intended (residual risk: a stolen operator session can revoke members). Admin will
                  confirm each decision in a dialog but cannot add authority.
Classification:   🟡 security review item.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S2/S3.

CF-27  Assigned operators can revoke an organization admin's membership without step-up
Service:          auth-service
Current behavior: (origin/main b91b7bf) membership.service.ts revoke: an owner or an operator assigned to the Platform may revoke
                  any active membership, an organization admin's included (only an organization admin is barred from
                  revoking another admin); the admin role is cleared in the same statement. No step-up is required, while
                  granting or removing the role alone requires the owner's factor step-up (organization.admin.grant|revoke).
Admin requirement: Core confirms the intended authority. Residual risk: a stolen operator session can remove an Organization's
                  administrators (and members) with the bearer alone, a stronger effect than the step-up-protected role
                  change. Admin follows the source (P5-S3a): operators may revoke admins' memberships, the confirmation says
                  the administrative authority goes too; Admin cannot add authority.
Classification:   🟡 security review item.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the membership HTTP integration.

CF-28  No owner read of a member account's state
Service:          auth-service
Current behavior: (origin/main b91b7bf) POST /auth/admin/members/:id/suspend|restore act on the whole account, but no owner read
                  returns whether an account is suspended (the membership list projection has no isActive), which
                  Organizations of the Company it belongs to, or whether it is eligible.
Admin requirement: an owner read of a member account, e.g. GET /auth/admin/members/:id → { id, suspended, suspendedAt, reason?,
                  eligible, organizationsInCompany: count }, or the account state on owner membership rows. Until then Admin
                  offers no suspend or restore (P5-S4 deferred; a read-only card explains it).
Classification:   🔴 missing contract (blocks P5-S4).
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S4.

CF-29  Eligibility is known only after the step-up
Service:          auth-service
Current behavior: (origin/main b91b7bf) an ineligible target (no active membership in this Company, a membership under another
                  Company, not a member) is a 404 returned after the owner has verified (the step-up is rolled back, not
                  spent).
Admin requirement: an eligibility answer before verification (part of CF-28's read), or confirmation that the post-verification
                  404 is intended.
Classification:   🟡 contract addition / UX.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S4.

CF-30  No list of suspended accounts
Service:          auth-service
Current behavior: (origin/main b91b7bf) nothing lists suspended member accounts for the owner; a restore needs the person's id
                  from some membership page.
Admin requirement: an owner list of the Company's suspended member accounts (id, suspendedAt, reason code), so a suspension
                  is never forgotten.
Classification:   🟡 contract addition.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S4.

CF-31  Throttle and repeat semantics of suspend / restore
Service:          auth-service
Current behavior: (origin/main b91b7bf) no throttle bucket is on record for these routes; a repeat of the current state answers
                  200 changed: false and spends the owner's step-up.
Admin requirement: Core confirms the bucket (or its absence) and whether a no-op should spend the step-up.
Classification:   🟡 documentation / security review item.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before P5-S4.

CF-32  Operator creation: recovery after a lost answer
Service:          auth-service
Current behavior: (origin/main 750eb21) POST /auth/admin/operators has no idempotency key; a retry after a lost answer gets
                  409 account_already_exists, which proves the operator exists but returns no id, and no read can find it
                  (CF-03).
Admin requirement: an Idempotency-Key (replaying the first answer), or the operator directory, so a lost creation can be
                  reconciled without guessing.
Classification:   🔴 missing capability.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the operator-creation HTTP adapter. P6-S4 (2026-10-24) is a demo mock only: it never
resends, reads the DEMO directory again and searches for the contact, and states that Core cannot do this; production
does not offer creation. Needed: an idempotent create (an Idempotency-Key replaying the first answer) or an
owner-authorized lookup by contact.

CF-33  Operator creation: duplicate-contact disclosure
Service:          auth-service
Current behavior: (origin/main 750eb21) email and phone are unique across every account kind; creating an operator with a
                  member's (or the owner's) contact answers 409 account_already_exists, telling the owner that an account
                  with that contact exists. The step-up is not spent.
Admin requirement: Core states whether this disclosure to the owner is intended; Admin will word the refusal neutrally either
                  way.
Classification:   🟡 security review item.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the operator-creation HTTP adapter. P6-S4 (2026-10-24, mock) says only "already used by a
Nawara account", never the account kind, and adds no lookup of its own.

CF-34  Documented-only operator endpoints
Service:          auth-service (documentation versus source)
Current behavior: (origin/main 750eb21) ADR-0012, the SDD and the TDD describe GET /auth/admin/operators, GET …/operators/:id,
                  PATCH …/operators/:id/contact, and owner-only schedule and time-off routes; none is implemented (the
                  operator_schedule and operator_time_off tables exist and the login availability check reads them).
Admin requirement: Core marks them planned or withdrawn; Admin builds none of them until they exist.
Classification:   🟡 documentation.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: with CF-03.

CF-35  Operator block / unblock: authoritative account-state reconciliation
Service:          auth-service
Current behavior: (origin/main 750eb21) POST /auth/admin/operators/:id/block|unblock answer 204 with no body; no owner
                  read returns an operator's isActive (CF-03). After a lost answer Admin cannot tell whether the account
                  is blocked; a repeat is harmless for the account but writes another audit record.
Admin requirement: the resulting state in the answer ({ id, isActive }) or an owner read of it, so a lost answer can be
                  reconciled without a blind repeat. The same holds after a creation (P6-S4): Admin cannot read whether
                  the new operator has confirmed their contact, or is blocked, from Core.
Classification:   🟡 contract addition.
V1 or V2:         to decide by the Core owner.
Recommended checkpoint: before the operator administration HTTP adapter.

CF-36  Owner read of Organization subscriptions                         PROPOSED (P7-0, 2026-10-24)
Service:          billing-service
Current behavior: (per §5) human routes exist only for an invoice's payer; no owner or staff read of subscriptions.
Admin requirement: a Company- and Platform-scoped, paginated owner read of each Organization's subscription (state, end,
                  grace end), so `/licenses` (P7-S1) and `/licenses/platforms/:platformId` (P7-S2), demo mocks today,
                  can bind an HTTP adapter. P7-S2 filters and searches a whole Platform in the browser: the Core read
                  needs its own state filter, name search and pagination before real volumes.
Classification:   🟡 planned capability (V2 A10).
Recommended checkpoint: before any P7 HTTP adapter.

CF-37  Owner read of entitlement state                                     PROPOSED (P7-0)
Service:          billing-service
Current behavior: (per §6) entitlement is readable only by service token, per Organization ({ valid, expiresAt }).
Admin requirement: the same facts for the owner, including whether an Organization is entitled through its grace period
                  (shown as its own row on the Organization detail and column in `/licenses/platforms/:platformId`, P7-S2).
Classification:   🟡 contract addition.
Recommended checkpoint: with CF-36.

CF-38  Owner read of the plan catalog                                      PROPOSED (P7-0)
Service:          billing-service
Current behavior: Billing owns catalog and prices; no owner read.
Admin requirement: a read of plans (and prices, if the owner may see them) so plans are never invented in Admin.
Classification:   🟡 planned capability (V2 A10).
Recommended checkpoint: before P7-S4.
F0 status (`0044b20`): PARTLY ANSWERED IN DEVELOPMENT. `GET /billing/admin/platforms/:platformId/products` (Platform owner; S3g,
                  #372) reads the **personal-product** catalog; no Organization-plan catalog read exists; catalog VALUES are
                  OPEN in Core (OD-05, catalog gate); Billing is not deployed.

CF-39  Personal Premium aggregate per Platform                             PROPOSED (P7-0)
Service:          billing-service
Current behavior: Personal Premium is a per-person subscription; no aggregate read.
Admin requirement: a count per product/Platform with no personal data, and a decision on what the owner may see.
Classification:   🟡 contract addition / privacy decision.
Recommended checkpoint: before P7-S4.

CF-40  Owner reads of billing and payment facts                            PROPOSED (P7-0)
Service:          billing-service, payment-service
Current behavior: payer-only invoice and payment routes; settlement is Payment's only; no refund or dispute contract.
Admin requirement: separate owner reads of invoices, payment attempts, verified settlement, refunds and disputes, never
                  merged, so P7-S3 (`/billing` payment follow-ups, demo mock today) can move off its mock and no
                  attempt is shown as revenue. P7-S3 needs at least each open attempt's Organization and state.
Classification:   🟡 planned capability (V2 A10/A11).
Recommended checkpoint: before P7-S3's HTTP adapter.
F0 status (`0044b20`): PARTLY ANSWERED IN DEVELOPMENT. Owner reads exist for disputes (PAY-09), reconciliation items (PAY-12),
                  signed balances (R6H-12), refund cases by id (BIL-25), reconciliation cases (BIL-33) and losses (BIL-34),
                  all refused in production. **Still missing:** owner reads of invoices, payments, attempts and purchases
                  (CF-66) and a refund-case list (CF-65).

CF-41  Owner subscription commands                                         PROPOSED (P7-0)
Service:          billing-service
Current behavior: staff commercial mutations are excluded from V1 (ADR-0050 D12).
Admin requirement: create / renew / extend / end an Organization subscription, owner only, with a purpose-bound step-up
                  and an idempotency key (a lost answer must be replayable, unlike CF-32).
Classification:   🔴 missing capability (V2 A10 with A6).
Recommended checkpoint: before P7-S4 (blocked until then).

CF-42  Whether licenses or seats exist                                     PROPOSED (P7-0)
Service:          billing-service (architecture decision, ADR-0044)
Current behavior: no License entity; an Organization is entitled or not.
Admin requirement: Core states whether seat allocation and consumption will exist; Admin shows none until then.
Classification:   🟡 architectural decision.
Recommended checkpoint: before P7-S4.

CF-45  Safe browser projection of audit change fields                     PROPOSED (P8-0, 2026-10-24)
Service:          audit-service
Current behavior: (per §5 Audit) owner records carry `changes`, `actor`, `subject`, `resource`; no documented rule
                  for which fields may reach a browser.
Admin requirement: a stated projection (contacts and secrets redacted or absent) before Admin renders any change detail;
                  until then the activity browser (P8-S1, simulated) shows no change field, and an HTTP adapter would
                  show none either.
Classification:   🟡 contract clarification.
Recommended checkpoint: before the owner audit HTTP adapter (A9).

CF-47  Exact audit query time-window rules                                 PROPOSED (P8-0)
Service:          audit-service
Current behavior: (per §5 Audit) `from`/`to` UTC, at most 31 days, `limit` ≤ 100, opaque cursor.
Admin requirement: verified bounds (inclusive / exclusive), the 31-day measure, cursor stability when records arrive,
                  and the error for an oversized window, so the browser can present them in the owner's time zone.
Classification:   🟡 contract verification.
Recommended checkpoint: before the owner audit HTTP adapter (A9).

CF-44  Inbox content safety                                                PROPOSED (P8-0)
Service:          notification-service
Current behavior: delivers notifications to people, including sign-in, verification and confirmation codes; no human
                  read exists.
Admin requirement: a person's inbox read never returns codes, challenges, recovery secrets or token-bearing links, so
                  Admin can list messages without exposing secrets.
Classification:   🟡 contract decision.
Recommended checkpoint: with CF-48.

CF-48  Personal inbox read, read state and retention                       PROPOSED (P8-S3, 2026-10-24)
Service:          notification-service
Current behavior: (per §5) service-token send / status / cancel only.
Admin requirement: for the signed-in owner or operator only (bearer-scoped, no identity parameter): an unread count,
                  then a paginated list of their own messages, with stated delivery semantics (which channels count),
                  read-state rules (what marks a message read, whether it syncs across devices) and retention (how long
                  history is kept, what zero unread means). Until then `/notifications` shows a demo count only.
Classification:   🟡 planned capability (V2 A8).
Recommended checkpoint: before any notification HTTP adapter.

CF-49  Owner read and edit of the Company profile                         PROPOSED (P9-0, 2026-10-24)
Service:          organization-service (Auth is authoritative today)
Current behavior: (per §5) no human route lists or reads Companies (CF-02 covers hierarchy reads); no Company edit
                  route is documented.
Admin requirement: the owner reads their own Company's profile (name and any other identity fields Core defines) and,
                  if Core decides it is editable, changes it with stated authority, step-up and idempotency. Until then
                  `/settings/company` (P9-S3, built 2026-10-25) shows the demo name read only in demo builds, "not
                  available" in production, and offers no edit.
Classification:   🔴 undefined.
Recommended checkpoint: Core V2 A5.

CF-50  A person's notification preferences                                 PROPOSED (P9-0)
Service:          notification-service
Current behavior: (per §5) service-token send / status / cancel only; no human route.
Admin requirement: for the signed-in owner or operator only: which channels and kinds they receive, and which they may
                  opt out of (sign-in and security codes presumably never). Until then Admin offers no notification
                  preference.
Classification:   🟡 planned capability (V2 A8); with CF-14, CF-48.
Recommended checkpoint: before any notification preference UI.

CF-51  A person's own sessions                                             PROPOSED (P9-0)
Service:          auth-service
Current behavior: `POST /auth/logout` ends the presented session; block and suspend end an account's sessions (§5); no
                  route lists the signed-in person's sessions or ends another one of theirs.
Admin requirement: the signed-in owner or operator lists their own sessions (no tokens, no raw addresses) and ends one
                  or all others. Until then Settings says signing out ends this session only, removing a factor
                  (P9-S4d) says it ends no session, and changing the password (P9-S4e) says the other sessions end the
                  next time they contact Nawara Core, which Admin cannot check.
Classification:   🔴 undefined.
Recommended checkpoint: Core V2 A4.

CF-52  Operator policy configuration                                       PROPOSED (P9-0)
Service:          auth-service (with V2 A6 authorization)
Current behavior: operator sessions end at the shift ceiling (`session_ceiling_reached`, §4); whether the shift or the
                  working-code rules are configurable, and by whom, is not documented; no operator capability sets.
Admin requirement: a stated answer: fixed by Core, or configurable by the Company owner through a defined contract.
                  Until then Admin shows no operator policy setting.
Classification:   🔴 undefined / 🟡 V2 A6.
Recommended checkpoint: Core V2 A6.

CF-53  Display name for Admin identities                                   PROPOSED (P9-0)
Service:          auth-service
Current behavior: (per §7) `GET /auth/me` returns email and phone only; the UI falls back to the email.
Admin requirement: whether owners and operators have a display name, who may set it, and its limits. Until then
                  `/settings/account` (P9-S2) shows the contact only and offers no name edit.
Classification:   🔴 undefined.
Recommended checkpoint: Core V2 A4.

CF-54  Owner read of the secret key's status                               PROPOSED (P9-S4-0, 2026-10-25)
Service:          auth-service
Current behavior: (verified `304064f`) `owner.secretKeyHash` / `secretKeyIssuedAt` exist, but no route reads them; a
                  bootstrapped owner has no key until the first rotation (ADR-0016).
Admin requirement: the owner sees whether a key exists and when it was issued, so Settings can say whether recovery is
                  possible and tell whether a rotation whose answer was lost committed. Never the key itself.
                  Insufficient alone (P9-S4c): it would settle the outcome, but a lost key still cannot be recovered;
                  only a new rotation (or CF-60) gives the owner a working key again.
Classification:   🔴 undefined.
Recommended checkpoint: before P9-S4c's HTTP adapter.

CF-55  Alerts for owner credential changes (or corrected documentation)     PROPOSED (P9-S4-0)
Service:          auth-service
Current behavior: rotation, password change and factor add / remove write the local and central audit only; no event
                  is emitted. Since P9-S4b to P9-S4e Admin offers adding and removing a factor, creating a secret key and changing
                  the password (mock-first): a stolen session plus one factor could replace the owner's key or
                  password, or remove their other factors, unnoticed. `docs/sdd/auth-service.md` and `docs/add/auth-service.md` say rotation publishes
                  `admin.secret_key_rotated` (ADR-0010).
Admin requirement: the owner is told of every credential change on their account (a stolen session plus a factor
                  otherwise goes unnoticed), or the documents are corrected to the source.
Classification:   🟡 documentation drift / security decision.
Recommended checkpoint: Core V2 A4 (with A8 delivery).

CF-56  Factor labels                                                        PROPOSED (P9-S4-0)
Service:          auth-service
Current behavior: `GET /auth/admin/factors` returns id, type, confirmed, createdAt, lastUsedAt; no name.
Admin requirement: an owner-set label per factor, so removing one (P9-S4d) names the device it belongs to. Until then
                  P9-S4d tells factors apart by type, position and dates only.
Classification:   🔴 undefined.
Recommended checkpoint: before P9-S4d.

CF-57  A path for a forgotten owner password                                PROPOSED (P9-S4-0)
Service:          auth-service
Current behavior: sign-in and recovery both start with the password; `password/change` needs a live session.
Admin requirement: a stated, safe path for an owner who forgets their password (or an explicit decision that there is
                  none beyond an operational procedure). P9-S4e says Admin cannot reset a forgotten password.
Classification:   🔴 undefined.
Recommended checkpoint: before P9-S4e.

CF-58  Read of a pending recovery request                                   PROPOSED (P9-S4-0)
Service:          auth-service
Current behavior: `recovery/cancel` (owner) answers `204` whether or not a request is pending; nothing reads one.
Admin requirement: the owner sees whether a recovery is pending and its `availableAt`, so a cancel is not blind.
Classification:   🔴 undefined.
Recommended checkpoint: before any recovery action in Settings.

CF-59  Declared response schemas for the owner security routes              PROPOSED (P9-S4-0)
Service:          auth-service
Current behavior: the owner routes declare no OpenAPI response schema; shapes are known from the source only.
Admin requirement: declared schemas at `/auth/docs` for `factors*`, `step-up*`, `secret-key/rotate`, `password/change`,
                  `recovery/*`, verified before any HTTP adapter. For `secret-key/rotate` (P9-S4c) precisely: the key's
                  alphabet and separator, `issuedAt`'s format, its error codes (is there a `429` and its limit), when
                  the step-up is spent, and which statuses guarantee that nothing was committed. For `DELETE factors/:id` (P9-S4d):
                  any throttle, and whether an already removed factor always answers `404`. For `password/change`
                  (P9-S4e): how "characters" are counted (Admin assumes Unicode code points, bytes as UTF-8), whether
                  the new password may equal the old one, any throttle, and which statuses guarantee nothing changed
                  (Admin trusts only `400 validation_error`).
Classification:   🟡 documentation.
Recommended checkpoint: before the auth HTTP adapter (A4).

CF-60  Two-phase secret-key rotation                                        PROPOSED (P9-S4c, 2026-10-25)
Service:          auth-service
Current behavior: (verified `304064f`) `secret-key/rotate` replaces the key at once and returns the new one once; a
                  lost answer, a closed tab or an unsaved key leaves the owner without a known working key, and the
                  previous one is already dead.
Admin requirement: stage a new key (returned once) while the current one stays valid, and activate it only when the
                  owner proves possession (for example a group, or a hash of the key); an unactivated staged key
                  expires. A lost answer then changes nothing the owner relied on.
Classification:   🔴 undefined (security design).
Recommended checkpoint: before P9-S4c's HTTP adapter; Core V2 A4.

CF-61  Secret-key rotation while a recovery is pending                      PROPOSED (P9-S4c, 2026-10-25)
Service:          auth-service
Current behavior: unknown from the documents read in P9-S4-0: whether rotating cancels a pending recovery started with
                  the previous key, or lets it complete.
Admin requirement: a documented rule (preferably: a rotation by a live owner session cancels any pending recovery and
                  says so), so Settings can explain what creating a key does to a recovery in progress (CF-58).
Classification:   🔴 undefined (documentation / security decision).
Recommended checkpoint: before any recovery action in Settings, and before P9-S4c's HTTP adapter.

CF-62  Factor-removal proof and unfinished-setup semantics                PROPOSED (P9-S4d, 2026-10-25)
Service:          auth-service
Current behavior: (verified `304064f`) `DELETE factors/:id` needs an `owner.factor.remove` step-up proved by a factor
                  and refuses the last confirmed factor (`409 factor_required`). Not stated in the documents read in
                  P9-S4-0: whether the factor being removed may itself prove that step-up (a TOTP step-up does not say
                  which authenticator produced the code), and whether `DELETE` accepts an unconfirmed (unfinished)
                  TOTP setup.
Admin requirement: a documented rule for both. Admin meanwhile offers confirmed factors only, accepts any authenticator
                  code (the one being removed included) without claiming Core can tell, and says an unfinished setup
                  is replaced by the next one. Possible improvements, if decided: record the proving factor on the
                  step-up and refuse self-proof for removal; allow (or explicitly refuse) deleting an unfinished setup.
Classification:   🔴 undefined (documentation / security decision).
Recommended checkpoint: before P9-S4d's HTTP adapter.

CF-63  Reconciling an uncertain password change                          PROPOSED (P9-S4e, 2026-10-25)
Service:          auth-service
Current behavior: (verified `304064f`) `password/change` answers `204` with no body, and no route reads whether or when
                  the owner's password last changed. After a lost answer or a `5xx`, Admin cannot tell which password
                  is in force; the current session stays signed in either way.
Admin requirement: an authoritative, correlation-safe way to settle the outcome without exposing the password: for
                  example a `passwordChangedAt` on the owner's own read, or an idempotency key whose replay returns the
                  original outcome. Admin meanwhile shows "unknown" and offers a completely new attempt.
Classification:   🔴 undefined.
Recommended checkpoint: before P9-S4e's HTTP adapter.

CF-64  Stronger password-change authorization and security-change notification   PROPOSED (P9-S4e, 2026-10-25)
Service:          auth-service (with A8 delivery)
Current behavior: (verified `304064f`) `password/change` asks for an `owner.password.change` step-up proved by a factor
                  but not for the current password, and emits no event (CF-55): a stolen session plus one factor can
                  change the password, ending the owner's other sessions and blocking sign-in and recovery for them.
Admin requirement: a decided policy: require the current password (or a recent full authentication) for a change, and
                  notify the owner through an out-of-band channel of every credential change. Admin meanwhile states
                  that the current password is not asked for.
Classification:   🔴 undefined (security decision).
Recommended checkpoint: before P9-S4e's HTTP adapter; Core V2 A4.

CF-65 to CF-73 (F0, Owner decision D-R0-5, 2026-10-30) are Admin-tracked Core prerequisites. Recording them here does not
mean Core has authorized, designed or implemented any of them.

CF-65  Owner refund-case list                                             PROPOSED (F0, 2026-10-30)
Service:          billing-service
Current behavior: (verified `0044b20`) refund cases can be opened, read, authorized and cancelled by id only
                  (`billing-service/src/refunds/refund-case.controller.ts:66-128`, BIL-23 to BIL-25); no list.
Admin requirement: a Company-scoped, paginated owner list of refund cases (state, Platform, newest first), so a case is
                  found without already knowing its id.
Classification:   🟡 contract addition (S6a scope).
Recommended checkpoint: before any refund HTTP adapter (roadmap F5).

CF-66  Owner discovery of payments, purchases and invoices                 PROPOSED (F0)
Service:          billing-service, payment-service
Current behavior: opening a refund case needs a `paymentId` (`refund-case.controller.ts:66-87`), but invoices are listed
                  only for their payer or producer (`billing-service/src/invoices/invoices.controller.ts:77-90`) and no
                  owner read lists payments or purchases; whether an owner bearer may read `GET /payment/payments/:id`
                  is not established (the user path appears payer-scoped; UNVERIFIED).
Admin requirement: owner reads, Company- and Platform-scoped, of payments with their finality and of personal purchases,
                  kept separate (never merged into revenue). Extends CF-40.
Classification:   🟡 contract addition (S3/S4 scope).
Recommended checkpoint: before roadmap F5's HTTP adapter.

CF-67  Owner fraud-hold list                                               PROPOSED (F0)
Service:          billing-service
Current behavior: (verified `0044b20`) place, release and read by id only (`billing-service/src/fraud-holds/fraud-hold.controller.ts:24-62`).
Admin requirement: an owner list of holds (active, released, expired) with their 14-day deadlines.
Classification:   🟡 contract addition (S6e-H scope).
Recommended checkpoint: before roadmap F10's HTTP adapter.

CF-68  Owner recovery-obligation list                                      PROPOSED (F0)
Service:          billing-service
Current behavior: (verified `0044b20`) `GET /billing/admin/recovery-obligations/:id` only (`recovery.controller.ts:149`);
                  some obligations surface through reconciliation cases, not all.
Admin requirement: an owner list of recovery obligations and surpluses (outstanding, settled, written off).
Classification:   🟡 contract addition (S6f scope).
Recommended checkpoint: before roadmap F8's HTTP adapter.

CF-69  Owner late-settlement list                                          PROPOSED (F0)
Service:          billing-service
Current behavior: (verified `0044b20`) `GET /billing/admin/late-settlements/:id` and its application only
                  (`late-settlement.controller.ts:105-119`); an unapplied late settlement is a reconciliation case.
Admin requirement: an owner list of late assisted settlements and their L-4 state, or a documented statement that the
                  reconciliation-case list is the only discovery path.
Classification:   🟡 contract addition or documentation (S6g scope).
Recommended checkpoint: before roadmap F9's HTTP adapter.

CF-70  Owner read and list of assistance requests and disputes            PROPOSED (F0)
Service:          billing-service
Current behavior: (verified `0044b20`) the owner can correct a request (BIL-19) and resolve an assistance dispute (BIL-22)
                  by id, but the request read is for its beneficiary or an administrator of its Organization only
                  (`billing-service/src/assistance/assistance.controller.ts:181`); no owner read or list.
Admin requirement: owner reads of the requests, obligations and disputes the owner is asked to correct or resolve.
Classification:   🟡 contract addition (S5c scope).
Recommended checkpoint: before roadmap F11's HTTP adapter.

CF-71  Human path for File evidence                                        PROPOSED (F0)
Service:          file-service (with billing-service and payment-service)
Current behavior: (verified `0044b20`) evidence grants are service-token only: "No human, public or grantee route"
                  (`file-service/src/grants/grant.controller.ts:41-42`); fraud holds (1 to 5 grants), dispute evidence
                  (PAY-10) and an external surplus repayment (BIL-30 Path B) each require a grant.
Admin requirement: a way for the owner, with their own bearer, to upload a file and grant it as evidence of one case,
                  without any service token in the browser (ADR-0050).
Classification:   🔴 undefined (a Core design decision; File production enablement is M8 / DG-2).
Recommended checkpoint: before roadmap F6 evidence, F8 Path B and F10.

CF-72  Reads of fee caps, delegations and proposals                       PROPOSED (F0)
Service:          billing-service
Current behavior: (verified `0044b20`) fee caps (PUT), delegations (create, revoke) and proposal decisions are owner
                  commands; proposals and withdrawals are operator commands (`billing-service/src/fees/fees.controller.ts:40-149`);
                  no read of any of them.
Admin requirement: owner and delegated-operator reads of the current caps, delegations and pending proposals.
Classification:   🟡 contract addition (S3f scope).
Recommended checkpoint: before roadmap F12's HTTP adapter.

CF-73  Core roadmap's Admin section is out of date                         PROPOSED (F0)
Service:          documentation (`nawara-core/docs/CORE-ROADMAP.md`)
Current behavior: (verified `0044b20`) `docs/CORE-ROADMAP.md:686` still says billing-service and payment-service offer
                  "service-token APIs only; no human administration API", which the S3–S6 Owner routes contradict.
Admin requirement: Core's Admin section states the development-only Owner and operator financial routes and their
                  production refusal, so both repositories describe the same contract.
Classification:   🟡 documentation correction (Core-owned; Admin changes nothing in Core).
Recommended checkpoint: next Core documentation task.

CF-74 to CF-76 (F1-S0, 2026-10-30) are open Core questions raised by the F1 design (`design/f1-financial-authorization.md`
§15). Recording them is not an approved Core implementation request.

CF-74  Repeat semantics of receipt consumers without Idempotency-Key      OPEN (F1-S0, 2026-10-30)
Service:          billing-service
Current behavior: (verified `0044b20`) fraud-hold placement and release (`billing-service/src/fraud-holds/fraud-hold.controller.ts:24-56`),
                  the external surplus repayment (`recovery.controller.ts:163-181`) and the recovery write-off
                  (`reconciliation.controller.ts:89-104`) take no `Idempotency-Key`; each documents `503 …_authorization_unresolved
                  (repeat the same request)`, but not what a byte-identical repeat answers after a transport loss when the
                  first request already committed.
Admin requirement: a stated replay contract for these routes. Until then an uncertain outcome on them stays blocked: no
                  automatic and no unverified manual resubmission. A read that shows no applied result does not, by itself,
                  authorize a repeat.
Classification:   🔴 undefined (contract clarification).
Recommended checkpoint: before any Admin consumer of these routes (roadmap F8, F10).

CF-75  Owner-facing read of a receipt's state                              OPEN (F1-S0)
Service:          auth-service
Current behavior: (verified `0044b20`) the receipt lookup (AUTH-03, `POST /auth/service/authorization-receipts/consumptions/lookup`)
                  is service-token only (`auth-service/src/receipts/authorization-receipt.controller.ts:52-66`); an owner cannot
                  ask whether a receipt they obtained is issued, consumed, voided or expired.
Admin requirement: after a lost page or answer, the owner can tell whether an authorization was spent, without the secret.
Classification:   🟡 contract addition.
Recommended checkpoint: before the first receipt-consuming Admin workflow (roadmap F5).

CF-76  Same-key replay order for service-verified step-up commands        OPEN (F1-S0)
Service:          organization-service, release-service, billing-service (assistance)
Current behavior: (verified `0044b20`) these commands verify and consume the `x-step-up-token` through
                  `POST /auth/step-up/verify`; whether a same-`Idempotency-Key` repeat after a lost answer replays the stored
                  outcome **before** the (already consumed) step-up is checked is not documented.
Admin requirement: a stated rule. Until then Admin never resends a service-verified command after a lost answer (its
                  existing behaviour) and reconciles by reading.
Classification:   🔴 undefined (contract clarification).
Recommended checkpoint: before the first HTTP adapter of these commands.

CF-77 (Assistance A3, 2026-10-30) is an open Core question found while modelling the Assistance read contracts
(`src/app/features/assistance/domain/assistance-read.model.ts`). Recording it is not an approved Core implementation request.

CF-77  End of results in the reconciliation-case list (BIL-33)            OPEN (A3, 2026-10-30)
Service:          billing-service
Current behavior: (verified `0044b20`) `GET /billing/admin/reconciliation-cases?status=&type=&after=&limit=`
                  (`billing-service/src/reconciliation/reconciliation.controller.ts:28-42`) answers `{ items }` only. The
                  service selects `ORDER BY c.id LIMIT $limit` after the `after` id, THEN drops each row whose Platform the
                  owner may not see (`platformVisible`, `reconciliation.service.ts:323-336`, `:470-472`). So a page can hold
                  fewer than `limit` items, or none at all, while more cases follow; and when every row of a page is
                  dropped the client has no last id to continue from. ADR-0056 §6 (`docs/adr/0056-core-architecture-and-api-conventions.md:106-110`)
                  requires `{ items, nextCursor }` with `nextCursor: null` only at the end; Billing's own helper follows it
                  (`billing-service/src/common/pagination.ts:5-13`); this route does not.
Admin requirement: a continuation contract for this list: a `nextCursor` (or the last scanned id) that is `null` only when no
                  further case exists, so a short or empty page is never read as the end. Until then Admin cannot infer
                  completion from a page's length or emptiness, and a real list built on BIL-33 (late-settlement and
                  recovery discovery, CF-68, CF-69) could silently omit cases.
Classification:   🔴 undefined (contract clarification; the route is development and simulation only).
Recommended checkpoint: before any Admin HTTP adapter that pages BIL-33 (Assistance; roadmap F8, F9).

Residual risk recorded with P6-S3: block and unblock require no step-up (Core's deliberate choice for an emergency
control), so a stolen owner session can block every operator or unblock one. Admin adds no verification Core does not ask
for; this is for the Core owner's security review, not an Admin change.
```

## 10. Undefined architectural decisions (Core side)

- Whether "License" becomes a Core term or remains Billing Subscription/Entitlement (V2 A10).
- Operator capability sets / fine-grained permissions (V2 A6).
- Organization lifecycle runtime (ADR-0060 accepted as architecture; implementation deferred, CF-09).
- Whether operator administration is ever publicly browser-reachable (stage-10 study: open deployment/security choice).
- Browser session model for administrative clients (CF-01).
- **Added at F0 (`0044b20`), open in Core, not Admin's to decide:** DG-4 (Billing for the pilot) and A11 MOVE V3 (Payment);
  catalog values OD-05; BIL-12 (a member's personal subscriptions); EVT-05 / EVT-06 (`billing.*` events); Q8 (proof of receipt
  non-consumption); the partial-chargeback policy; V-4 (lifecycle effective state), V-5 runtime, OD-R6a; C-3 / C-6 (S7); C-5
  (operator Organization creation); PR #319 reconciliation; legal remedies (BIL-35); a human File evidence path (CF-71).
  Sources: Core `docs/architecture/core-v2-s6-financial-certification.md:181-194`, `core-v2-s-execution-roadmap.md:442-462`.

## 11. Core V2 S-track alignment (F0, Core `0044b20`)

Recorded 2026-10-30 under the Owner's F0 authorization (documentation only). It reconciles this file with Core `main` =
`0044b20cc7278c1d23d71ee1a39c3d8ab9118db9` and Admin `cf4b1a9`. Evidence and method:
[`review/r0-core-alignment/`](review/r0-core-alignment/README.md) (the master roadmap, the route inventories and the scripts).
Paths below are relative to `nawara-core/` unless marked `admin:`. **Nothing in this section is deployment or operational
evidence.**

### 11.1 Baseline verification

| Check | Result |
|---|---|
| Repository | `https://github.com/nawara-solutions/nawara-core` |
| `main` | `0044b20` (merge of PR #409, 2026-10-30T21:14:38+01:00); `git ls-remote` at 2026-10-30T20:30:48Z: no later merge |
| PR #409 | included (it is the tip); #405–#408 merged before it |
| Unmerged | Dependabot PRs #197–#203, #297, #368 and PR #319 (on hold) are not in `main`; whether each is open is **unverified** (the GitHub API was not available to this session for Core) |
| Method | a fresh read-only clone (no existing worktree, no branch switched, nothing written to Core) |
| Not accessed | production, Nawara Lab 01, deployed infrastructure |

### 11.2 Contract states from F0

| State | Meaning | Admin may |
|---|---|---|
| 🟢 EXISTING / CONFIRMED | in Core source; production presence as Core documents it (never verified by Admin) | integrate (HTTP after D-A4) |
| **🟡 DEV-ONLY** (new) | implemented and merged in Core for **development and simulation**; the production build mounts no route, or the service is not deployed | mock-first UI; an HTTP adapter **only** against a local Core with the simulation provider; production builds bind the `Unavailable…` adapter |
| 🟡 PLANNED V2 / MOCKED | in the accepted direction, no route | mock behind a gateway |
| 🔴 UNDEFINED | no contract | placeholder + Core follow-up |

### 11.3 Production-refused modules

Source-derived route inventory: **208** controller handlers under `apps/*/src` (auth 64, billing 64, payment 28, organization 17,
file 17, release 8, audit 7, notification 3), reproducible with `admin:docs/review/r0-core-alignment/tools/routes.py`. The
original route appendix was not available: the count agrees, the identity of the two sets is unproven. By decorator heuristic
(the service still decides authority per request): 104 human bearer, 6 any bearer, 17 service-or-human, 56 service token only,
8 simulation harness, 17 public, pre-authentication or webhook.

**56 handlers are in modules that mount nothing in production** (no flag enables them):

| Module | Handlers | Production gate |
|---|---|---|
| Billing `CheckoutModule` | 1 | `apps/billing-service/src/checkout/checkout.module.ts:17` |
| Billing `AssistanceModule` (incl. restrictions) | 12 | `apps/billing-service/src/assistance/assistance.module.ts:27` |
| Billing `RefundModule` (refund cases + fraud holds) | 7 | `apps/billing-service/src/refunds/refund.module.ts:33`, `:41` |
| Billing `RecoveryModule` | 5 | `apps/billing-service/src/recovery/recovery.module.ts:21` |
| Billing `LateSettlementModule` | 4 | `apps/billing-service/src/late-settlements/late-settlement.module.ts:21` |
| Billing `ReconciliationModule` | 5 | `apps/billing-service/src/reconciliation/reconciliation.module.ts:20` |
| Payment `RefundsModule` | 3 | `apps/payment-service/src/refunds/refunds.module.ts:23` (also needs refunds configured) |
| Payment `DisputesModule` | 6 | `apps/payment-service/src/disputes/disputes.module.ts:21` |
| Payment `ReconciliationModule` | 5 | `apps/payment-service/src/reconciliation/reconciliation.module.ts:17` |
| Payment `SimulationModule` | 8 | `apps/payment-service/src/app.module.ts:57-58` (simulation enabled **and** not production) |

Billing's `PlatformsModule` (Platform commercial configuration, fees, Owner catalog; 14 handlers) **is** mounted in every
environment (`apps/billing-service/src/platforms/platforms.module.ts:21`), but Billing is not deployed: 🟡 DEV-ONLY as well.

### 11.4 The three step-up transports

> **Errata (F1-S0, 2026-10-30):** the table below is the F0 record, kept as written. Two of its transport cells are wrong:
> receipt issuance takes the step-up as **`stepUpToken` in the JSON body**, not the `x-step-up-token` header (E-1), and Audit
> legal holds take **`stepUpToken` in the JSON body**, not the header (E-2). Receipts may also need to stay in memory for one
> intent (E-3), and issuance, consumption and the financial outcome are three separate results (E-4). See
> [§11.12](#1112-errata-f1-s0-2026-10-30).

All three start at `POST /auth/admin/step-up` (owner only; Core's operator step-up does not exist, CF-08). Purposes and their
allowed factors: `apps/auth-service/src/owner/step-up.service.ts:23-100`.

| Transport | Sent to | Consumed by | Purposes at `0044b20` | Admin at `cf4b1a9` |
|---|---|---|---|---|
| **T1 Auth-local** | the Auth route itself, header `x-step-up-token` | Auth | `platform_assignment.grant/.revoke`, `operator.create`, `owner.secret_key.rotate`, `owner.factor.enroll/.remove`, `owner.password.change`, `join_code.create/.revoke`, `organization.admin.grant/.revoke`, `admin_invitation.create/.revoke`, `account.suspend/.restore`, `hierarchy.reference.repair` | modelled: `StepUpGateway` / `StepUpPurpose` (`admin:src/app/core/auth/step-up.gateway.ts:21-48`), mock only |
| **T2 service-verified** | another service, header `x-step-up-token` | that service, through `POST /auth/step-up/verify` with the **owner's own bearer** (single use, session- and purpose-bound) | `platform.create`, `organization.create` (Organization); `release.withdraw`, `compatibility_policy.change` (Release); `audit.legal_hold.place/.release` (Audit); `billing.assistance.correct`, `billing.assistance.dispute.resolve` (Billing) | `platform.create` and `organization.create` are used (P4-S1, P3b-S1) through the same gateway; transports are **not** distinguished |
| **T3 receipt-bound** | Auth: `POST /auth/admin/authorization-receipts` (`x-step-up-token`, `Idempotency-Key`, a binding); then the secret as `receiptSecret` to Billing or Payment | Auth consumes the **receipt** at the service's request (`/auth/service/authorization-receipts/*`, service tokens); `/auth/step-up/verify` **refuses** these purposes without consuming them | `refund.authorize`, `payment.dispute.decide`, `billing.fraud_hold.place/.release`, `billing.recovery_surplus.record_external`, `billing.late_settlement.apply`, `payment.provider_fact.associate`, `billing.recovery.write_off` (all factor-only) → receipt operations `refund`, `dispute_decision`, `fraud_hold_place`, `fraud_hold_release`, `recovery_surplus_external`, `late_settlement_apply`, `provider_fact_associate`, `recovery_write_off` (`apps/auth-service/src/receipts/receipt-binding.ts:158-172`) | **not modelled** |

Receipt facts: lifetime 10 minutes (`apps/auth-service/src/receipts/authorization-receipt.service.ts:14-15`); the secret appears in
the issuance response only; a lost-response replay voids an issued receipt (`409 receipt_issued_response_lost`); an unknown
outcome is replayed with the same key (`503 receipt_outcome_unknown`)
(`apps/auth-service/src/receipts/authorization-receipt.controller.ts:31-40`). Step-up token lifetime: `STEP_UP_TTL_SEC`, default
300 seconds (`apps/auth-service/src/config/app-config.ts:260`). Factor-only purposes never accept the secret key.

### 11.5 S3–S6 financial capability register

S3 Billing, S4 Payment, S5 assistance and cash obligations, S6 refunds, disputes, recovery, reconciliation and losses
(`docs/architecture/core-v2-s-execution-roadmap.md:290-405`; register ids from `docs/architecture/core-v2-d-a2-contract-register.md:98-190`).
**Every row is 🟡 DEV-ONLY.** "By id" means the resource is read or changed by its id with no owner list.

| Capability | Core routes (register id) | Caller | Step-up | Human discovery | Admin today | Follow-up |
|---|---|---|---|---|---|---|
| Platform commercial configuration | `POST/GET /billing/admin/platforms/:platformId` (BIL-01) | Platform owner (live platform-access) | — | yes (per Platform) | none | — |
| Personal-product catalog | `GET/POST …/platforms/:platformId/products`, `…/products/:productId/prices`, `…/archive`, `…/prices/:priceId/retire` (BIL-02/03) | Platform owner | — | yes | `/licenses` (mock, different scope) | catalog values OD-05 OPEN |
| Fee caps, delegations, decisions | `PUT …/fee-caps`, `POST …/fee-delegations[/:delegationId/revoke]`, `POST /billing/admin/fee-proposals/:id/approve\|reject` (BIL-04/05/07) | owner | — | **no reads** | none | CF-72 |
| Fee proposals | `POST /billing/platforms/:platformId/fee-proposals[/:id/withdraw]` (BIL-06) | **operator** with a delegation | — | no reads | none | CF-72 |
| Organization subscription / entitlement | BIL-09 / BIL-11 (service token) | service | — | **none for humans** | `/licenses` mock | CF-36, CF-37, CF-41 |
| Payments, finality, purchases | PAY-01..06 (service / payer) | service, payer | — | **none for the owner** | `/billing` follow-ups mock | CF-66 (extends CF-40) |
| Assistance correction | `POST /billing/admin/assistance-requests/:id/corrections` (BIL-19) | owner | **T2** `billing.assistance.correct` | by id; **no owner read** | none | CF-70 |
| Assistance dispute resolution | `POST /billing/admin/assistance-disputes/:id/resolution` (BIL-22) | owner | **T2** `billing.assistance.dispute.resolve` | by id; no owner read | none | CF-70 |
| Restrictions (T1, T2, T3; D6 not enforced) | `GET /billing/organizations/:organizationId/restrictions` (BIL-26) | service, or a human the service accepts (Platform owner, Organization actor) | — | per Organization | none | — |
| Refund cases | `POST /billing/admin/refund-cases`, `GET …/:id`, `POST …/:id/authorizations`, `POST …/:id/cancel` (BIL-23/24/25) | owner | **T3** `refund` | by id | none | CF-65, CF-66 |
| Payment disputes | `GET /payment/admin/disputes[/:id]`, `POST …/:id/evidence`, `POST …/:id/decision` (PAY-09/10/11) | owner | **T3** `dispute_decision` | list | none | CF-71 (evidence) |
| Fraud holds | `POST /billing/admin/fraud-holds`, `POST …/:id/release`, `GET …/:id` (BIL-27) | owner | **T3** `fraud_hold_place` / `_release` + 1–5 File grants | by id | none | CF-67, CF-71 |
| Recovery obligation (owner read) | `GET /billing/admin/recovery-obligations/:id` (BIL-28) | owner | — | by id | none | CF-68 |
| Surplus external repayment (Path B) | `POST /billing/admin/recovery-surpluses/:id/resolution` (BIL-30) | owner | **T3** `recovery_surplus_external` + File evidence | by id | none | CF-68, CF-71 |
| Late assisted settlement (L-4) | `GET /billing/admin/late-settlements/:id`, `POST …/:id/application` (BIL-32) | owner | **T3** `late_settlement_apply` | by id (via reconciliation cases) | none | CF-69 |
| Reconciliation cases | `GET /billing/admin/reconciliation-cases[/:id]`, `POST …/:id/acknowledgement` (BIL-33) | owner | — | list | none | — |
| Reconciliation items, unmatched facts | `GET /payment/admin/reconciliation-items` (PAY-12) | owner | — | list | none | — |
| Provider-fact association | `POST /payment/admin/provider-facts/:id/associations` (PAY-13) | owner | **T3** `provider_fact_associate` | from PAY-12 | none | — |
| Signed balances | `GET /payment/admin/balances`, `GET /payment/admin/payments/:paymentId/balance` (R6H-12) | owner | — | list (per currency) | none | — |
| `FinancialLoss`, recovery write-off | `GET /billing/admin/financial-losses`, `POST /billing/admin/recovery-obligations/:id/write-off` (BIL-34) | owner | **T3** `recovery_write_off` | list | none | — |
| Legal remedies | none (BIL-35 OPEN) | — | — | — | none | Core decision |

**Not Admin actions** (product or Organization surfaces): assistance requests, decline, cash collection, settlement, beneficiary
disputes, cash return and confirmation, dispute responses (BIL-13–18, 20, 21); the Organization's recovery settlement and
surplus confirmation (BIL-29, BIL-31: an Organization administrator, "never the beneficiary or the Owner"); late-settlement
attestation; direct checkout (BIL-10, member). **Never callable from Admin:** `/payment/simulation/*`, `/payment/webhooks/*`,
`/payment/reconciliation/items`, `/payment/payments/:paymentId/{captures/:factId,dispute-exposure}`, `/payment/disputes/losses`.

**Invariants Admin must preserve** (register §3, `docs/architecture/core-v2-d-a2-contract-register.md:66-90`): explicit, immutable
routing (I-1); a recovery settlement never touches a subscription or purchase (I-2); grace exactly 24 h / none (I-3); personal and
recovery invoices never change `subscription` (I-4); full-purchase refunds only, one reversal per purchase (I-5); immutable provider
facts (I-6); late settlement L-1–L-6 (I-7); a surplus is owed to the school, never revenue, loss or access, never re-opens T3
(I-8); `FinancialLoss` only from evidence or an owner write-off (I-9); no second checkout under uncertainty (I-10); restrictions
block **new** requests only (I-11); `settleBy = cashCollectedAt + 72h` (I-12); no trust-based cash settlement (I-13); simulation
only (I-14); no new refund case while a dispute is open, a completed case refuses all (I-16); a provisional dispute never
cancels Premium (I-17); operators never approve fees (I-18); one currency per Platform (I-19); Payment never calls Billing (I-20).
Balances are signed and never clamped; an unanswered authorization stays an open case (Q8, fail-closed); a write-off is
accounting only and T3 stays (`docs/architecture/core-v2-s6-financial-certification.md:116-122`).

### 11.6 ORG-00: hierarchy authority dependency

Register entry ORG-00 (`docs/architecture/core-v2-d-a2-contract-register.md:298-306`): **no Organization route in Core V2**; human
hierarchy reads are deferred until authority activation; organization-service stays non-authoritative; G6 and F7 unchanged. S8
(Organization authority-dependent changes) is conditional on PR #319's reconciliation, C-5 and A5.4-G1, with RED items blocked
until F7 (`docs/architecture/core-v2-s-execution-roadmap.md:416-424`). Organization's hierarchy reads remain service-token only
(`hierarchy.read`). Consequence: Admin's Platform and Organization directories, the Company Overview counts and the Platform
dashboard stay **provisional mocks for all of Core V2** (CF-02, CF-11); the only human hierarchy read is one Organization through
Auth (`GET /auth/admin/organizations/:id`). Organization writes (`/organization/admin/*`) exist but are not authoritative before
the cutover.

### 11.7 D-A4: browser-session dependency

Unchanged at `0044b20`: refresh tokens rotate with family revocation and are **returned in the body**; cookie sessions are
**absent**; CORS is `credentials: false` (`docs/architecture/core-v2-a4-authentication.md:27-41`; `libs/service-kit/src/bootstrap.ts:50`);
cookie sessions and a backend-for-frontend are placed in Core **A16** (`core-v2-a4-authentication.md:111`). D-A4 (memory for
development → a token-handler BFF permitted by ADR-0050 D13, **or** Core cookie mode) still blocks every HTTP adapter
(`admin:docs/ROADMAP.md` D-A4). A BFF would have to forward `x-step-up-token`, `Idempotency-Key` and receipt bodies unchanged,
never log them and hold no authority. The financial adapters do not change this decision: their routes are refused in
production anyway.

### 11.8 Owner and operator authority (financial and new routes)

From each route's guard at `0044b20`; Core decides per request, Admin's capability model stays UX only
(`admin:src/app/core/access/capability-policy.ts`, which grants operators nothing).

- **Owner only:** everything in §11.5 except fee proposals, plus legal holds, the Company audit timeline and Release administration.
  Members and operators are refused on every owner financial route; cross-Company and cross-Platform reads are the collapsed `404`
  (`docs/architecture/core-v2-s6-financial-certification.md:135-136`).
- **Operator:** fee proposals and their withdrawal (with an owner delegation); `GET /audit/operator/platforms/:platformId/records`
  (assigned Platform, live); Organization metadata edit (unchanged). An assigned operator is authorized to create an Organization
  but cannot obtain the `organization.create` step-up (CF-08, C-5).
- **Neither (Organization administrators, product apps):** recovery settlement, surplus confirmation and every assistance action
  except the owner's correction and dispute resolution.

### 11.9 Current Admin feature and mock coverage

At `cf4b1a9`: 25 gateways, 21 mock adapter files, **no HTTP adapter**, 143 spec files; capability policy: owner 22 capabilities,
operator none. Against `0044b20`:

| Admin area (route) | Gateway(s) | Core state at `0044b20` | Note |
|---|---|---|---|
| Sign-in, enrollment, working code (`/login/*`) | `AuthGateway` | 🟢 (production presence documentary) | mock prototype; HTTP after D-A4 |
| Overview (`/overview`) | `CompanyOverviewGateway`, `CommercialSummaryGateway` | 🔴 aggregates (CF-11–13) | mock |
| Platforms (`/platforms`, `/platforms/:platformId`) | `PlatformDirectoryGateway`, `PlatformCommandGateway`, `PlatformDashboardGateway`, `PlatformCommercialGateway` | writes 🟢; list 🔴 (ORG-00); commercial 🟡 DEV-ONLY in part (BIL-01) | mock |
| Organizations and members | `OrganizationGateway`, `OrganizationCommandGateway`, `OrganizationCommercialGateway`, `MembershipGateway`, `AdminInvitationGateway` | 🟢 except list (ORG-00); commercial 🔴 (CF-36/37) | mock |
| Operators (`/operators`) | `OperatorDirectoryGateway`, `OperatorAssignmentGateway`, `OperatorAccountGateway` | 🟢 commands; directory 🔴 (CF-03) | mock |
| Licenses (`/licenses`) | `LicensesGateway` | 🔴 human read (CF-36/37) | mock; must not offer activate / renew |
| Billing (`/billing`) | `BillingGateway` | 🟡 DEV-ONLY in part (§11.5); invoices/payments 🔴 (CF-66) | mock; its doc comment predates S3–S6 |
| Audit (`/audit`) | `ActivityGateway` | 🟡 DEV-ONLY (AUD-03/04) | simulated, labelled "not Core audit evidence" |
| Releases (`/releases`) | `ReleaseInformationGateway` | 🟡 DEV-ONLY (REL-01..03) | information page only |
| Services (`/services`) | `ServiceInventoryGateway` | 🔴 (CF-06) | mock |
| Notifications (`/notifications`) | `NotificationSummaryGateway` | 🔴 (NOT-00; CF-14, CF-48) | mock |
| Settings and security (`/settings/*`) | `AccountSecurityGateway`, `CompanySettingsGateway`, `StepUpGateway` | 🟢 owner security; Company profile 🔴 (CF-49) | mock |
| Finance workflows of §11.5 | none | 🟡 DEV-ONLY | **not built**; planned slices F1–F12 are **not authorized** (`admin:docs/ROADMAP.md`) |

### 11.10 Certification and deployment restrictions

| Stage | Verdict at `0044b20` | Source |
|---|---|---|
| S1 event security | CONDITIONAL PASS (development); operational acceptance NOT STARTED; C-4, AP-R, NP-K, G-7 open; OD-BRK-2b-L real-systemd half BLOCKED (hardware maintenance) | `docs/architecture/core-v2-s1-event-security.md:8` |
| S2 foundations | CONDITIONAL PASS (development); R-6a OPEN (OD-R6a); Audit Organization scope rows blocked until F7; operational NOT STARTED | `docs/architecture/core-v2-s2-independent-foundations.md:8` |
| S3 Billing | CONDITIONAL PASS (development and simulation); OD-05, BIL-12, EVT-05, invoice legal content, DG-4 open | `docs/architecture/core-v2-s3-billing.md:8`, `:44-54` |
| S4 Payment | CONDITIONAL PASS (development and simulation); Organization-payer grant inactive; real providers deferred; MOVE V3 | `docs/architecture/core-v2-s4-payment.md:8`, `:42-49` |
| S5 assistance | S5a–S5d CONDITIONAL PASS; **S5 not certified** (S5e, D6 deferred: V-4, OD-R6a) | `docs/architecture/core-v2-s5-assistance-and-cash-obligations.md:8`, `:61` |
| S6 financial | CONDITIONAL PASS (simulation); one medium defect corrected in the certification PR; Q8, partial chargebacks, V-4, V-5, OD-R6a, EVT-05/06, production activation open; one unexplained `401` recorded as a residual | `docs/architecture/core-v2-s6-financial-certification.md:10`, `:181-194`, `:239-241` |
| S-INT, Final Core Validation | not run; Final Core Validation absolutely last | `docs/architecture/core-v2-s-execution-roadmap.md:426-440` |

**No S-stage deploys** (merges build images only; deployments are separate, digest-based and owner-approved:
`core-v2-s-execution-roadmap.md:84-87`). A10 Billing stays DECISION REQUIRED (DG-4) and A11 Payment and Release production stay
MOVE V3 (`docs/CORE-ROADMAP.md`, disposition table). ADRs 0035, 0036, 0044 Part B, 0045, 0057 §13, 0067, 0068, 0069 remain
Proposed. Certification here is repository, CI and local evidence, never production evidence. **Admin therefore claims no
production readiness for any 🟡 DEV-ONLY capability**; at most, "mock-complete" and, later, "verified against a local
simulation Core".

### 11.11 Unresolved contract ambiguities (F0)

1. Whether an owner bearer may read `GET /payment/payments/:id` (the `ServiceOrUserGuard` user path appears payer-scoped):
   **unverified** (CF-66).
2. Which human actors `GET /billing/organizations/:organizationId/restrictions` admits beyond the Platform owner and the
   Organization actor: decided per request inside the service; not enumerated.
3. Admin's existing T2 uses (`platform.create`, `organization.create`) are modelled on the same gateway as T1; the transport split
   is a design item (roadmap F1), not a contract ambiguity in Core.
4. The source-derived inventory and the original 208-route appendix: same count, identity unproven.
5. Whether the production Auth image serves every Auth route listed here: unknown (documented image drift; production not
   accessed).
6. Contract-register route labels (`docs/architecture/core-v2-d-a2-contract-register.md` §4) differ from merged routes in places
   (for example BIL-02 `POST /billing/admin/products` vs the merged `POST /billing/admin/platforms/:platformId/products`;
   BIL-32's proposed reconciliation-case path vs the merged `/billing/admin/late-settlements/:id/application`). **The merged source
   is authoritative**; §11.5 uses it.

### 11.12 Errata (F1-S0, 2026-10-30)

Found while designing F1 ([`design/f1-financial-authorization.md`](design/f1-financial-authorization.md)) by re-reading Core at the
same revision, `0044b20`. The F0 text above is kept unchanged and marked; these entries are current.

| Id | F0 statement | Source at `0044b20` | Correction |
|---|---|---|---|
| E-1 | §11.4 T3: receipt issuance sends the step-up as header `x-step-up-token` | `POST /auth/admin/authorization-receipts` reads `{ stepUpToken, binding }` from the **JSON body**, with the `Idempotency-Key` header (`apps/auth-service/src/receipts/dto.ts:109-114`; `apps/auth-service/src/receipts/authorization-receipt.controller.ts:44-50`) | receipt issuance: **body** `stepUpToken` |
| E-2 | §11.4 T2: services, including Audit, take header `x-step-up-token` | Audit legal holds read **body** `stepUpToken` (`apps/audit-service/src/legal-hold/legal-hold.service.ts:52-60`, `:83-89`; a UUID, `:175-178`). Organization (`apps/organization-service/src/admin/admin.controller.ts:22`, `:91`, `:149`), Release (`apps/release-service/src/admin/admin.controller.ts:9`, `:88`, `:114`) and Billing assistance (`apps/billing-service/src/assistance/assistance.controller.ts:377`, `:413`, `:439`) read the **header** | delivery is per consumer: header for Organization, Release, Billing assistance; body for Audit legal holds. The two are **not interchangeable** |
| E-3 | §8: a receipt secret is "never … queued for retry"; F0 roadmap §9.3 implies one use | every receipt consumer documents `503 …_authorization_unresolved (repeat the same request)`; Billing's refund relay: "a retry with the same key resumes the same relay (the replay fingerprint never covers the secret)" (`apps/billing-service/src/refunds/refund-authorization.service.ts:28-36`) | the secret may have to stay **in memory** for the life of **one** financial intent so the identical repeat is possible. Never persisted, logged, put in a URL or reused for another intent. A wrapper that redacts the secret from strings and JSON is **defence in depth only**, not complete protection: a future implementation must restrict access to the secret, prevent persistence and logging, and test both |
| E-4 | (implicit) a receipt marks an authorized operation | issuance (`authorization-receipt.service.ts:105-163`), consumption by the consumer (AUTH-02, service-token only) and the consumer's financial result are separate; Core's answers distinguish them (`503 refund_payment_unavailable`: the relay **is recorded**; `…_authorization_unresolved`: repeat) | Admin keeps three separate outcomes: **receipt issued**, **receipt consumed**, **financial command completed**. An issued receipt never shows an operation as done |
| E-5 | (new safety rule) | the routes without `Idempotency-Key` (CF-74) | an uncertain outcome on a no-key route stays **blocked** from automatic and unverified manual resubmission until CF-74 is answered; a read showing no applied result does not by itself authorize a repeat |

Nothing here changes a production statement: every receipt-consuming route is still refused in production (§11.3), and Auth's
S2 receipt code is not deployed (§11.10).
