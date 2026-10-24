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
- **Superseded for P7 (owner decisions D1–D9, 2026-10-24):** no license wizard is built. Admin shows Organization subscriptions
  and their entitlement read only (P7-S1, `/licenses`; P7-S2, `/licenses/platforms/:platformId` and the Organization
  detail's Subscription section; demo mocks), and says plainly that plans, seat allocation, subscription
  changes and revenue are not available. Proposed follow-ups CF-36 to CF-42 (§9); none is an existing endpoint.

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
| Owner step-up | Auth | 🟢 Prod | `POST /auth/admin/step-up`, `x-step-up-token` | `StepUpGateway` (P4-S1): simulated mock in demo builds (opaque in-memory grant, single use, purpose- and user-bound, expiring, never Core evidence), unavailable otherwise; purposes limited to documented ones in use: `platform.create` (P4-S1), `organization.create` (P3b-S1). Both accept TOTP, WebAuthn and secret key (`auth-service/src/owner/step-up.service.ts:23-56`); the demo simulates TOTP only |
| Operator step-up | Auth | 🟡 | ADR-0042 A.1 accepted, not built | Hide/disable sensitive ops for operators |
| Secret key rotate / password change | Auth | 🟢 Prod | `secret-key/rotate`, `password/change` | HTTP (A7) |
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
| Audit — platform-level / operator reads | Audit | 🔴 | ADR-0050 D6 excludes | Placeholder; **CF-04** |
| Files | File | 🟡 | V2 A9; V1 service-token only | Mock (A12) |
| Notifications | Notification | 🟡 | V2 A8; V1 service-token only | Mock (A12) |
| Billing administration | Billing | 🟡 | V2 A10; V1 payer/service only | Mock (A11) |
| Payments administration | Payment | 🟡 | V2 A11; V1 payer/Billing only | Mock (A11); **P7-S3**: owner-only read-only `/billing` payment follow-ups (`BillingGateway`, mock in demo builds, unavailable otherwise): Organization, Platform, failed / awaiting action only; no amount, invoice, settlement, refund or operation (CF-40 proposed) |
| License / entitlement | Billing (decided) | 🟡 contract TBD | ADR-0038/0044; roadmap "Licenses" | **P7-S1**: owner-only read-only `/licenses` overview (`LicensesGateway`, mock in demo builds, unavailable otherwise): subscription states, entitlement (active or grace), per-Platform distribution, declared Personal Premium; **P7-S2**: one Platform's Organization subscriptions (`LicensesGateway.platform`) and the Organization detail's entitlement row (`OrganizationCommercialGateway.load`); no wizard, no command (CF-36 to CF-42 proposed) |
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
| Access & security: owner account security | Auth | 🟢 Prod (page not built) | `GET /auth/admin/factors`, factor add/remove, `secret-key/rotate`, `password/change` (owner only) | Overview row only, action disabled; no score or rating is computed |
| Access & security: operator assignments vs unique operators | Auth | 🔴 | assignments readable only per operator (`GET /auth/admin/operators/:id/platform-assignments`); no operator directory (CF-03) | Mock; assignments and unique operators kept as separate figures |
| Attention: access assignments to review | Auth | 🔴 | none (CF-13) | Not shown: removed in P2.5 (no defined source), no replacement |
| Commercial: active licenses, expiring soon (+ attention item) | Billing | 🟡 | no `License` entity; entitlement read is service-token only, per organization, `{ valid, expiresAt }`; no staff API; not in production | Separate `CommercialSummaryGateway`, mock in demo builds; "license" is a view-model term (§6) |
| Commercial: payment issues | Payment / Billing | 🟡 | payer-only human routes; no staff API; not in production | Same gateway, mock |
| Services & health (Auth, Organization, Release, Billing, Payment, File, Notification, Audit) | all / observability | 🟡 (CF-06, V2 A12) | each service: unauthenticated `/health` → `{status:'ok'}`, `/ready` → `ready \| unavailable` (service kit); no aggregation, no "delayed" state, not an operator API; billing, payment, file, notification, release not in production | Separate `ServiceHealthGateway`, mock in demo builds; the card says "Illustrative statuses of Nawara Core services, not live health" beside the "n of 8 operational" count; never presented as live health, readiness or deployment |
| Platform dashboard (`/platforms/:platformId`): figures, newest Organizations, attention, activity | Organization / Auth / Audit | 🔴 | no human route lists or aggregates a Platform's Organizations, memberships or signals (CF-02, CF-03, CF-11, CF-13); no platform-level or operator audit read (CF-04) | `PlatformDashboardGateway`, mock in demo builds; "unavailable" otherwise |
| Platform dashboard, commercial (owner): Organization subscriptions, Personal Premium, payment issues, assisted-payments policy (read only) | Billing / Payment | 🟡 | no staff/owner read route before Core V2 A10/A11; rules from the Core V2 architecture (24-hour grace, Personal Premium without grace, Platform-controlled assisted payments) | `PlatformCommercialGateway`, mock in demo builds; operators never ask |
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
