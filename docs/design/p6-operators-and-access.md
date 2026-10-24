# P6 — Platform operators and access management

- **Status:** P6-0 design (2026-10-24) · P6-S0 Core verification (2026-10-24, read only) · **P6-S1 implemented** (read
  only, development-only mock prototype). P6-S2 to P6-S4 not started; each needs its own authorization.
- **Core baseline:** `origin/main` **`750eb21`** (2026-10-24), read only in P6-S0. Every Core fact below is from that
  commit unless marked otherwise.
- **Canvas:** https://claude.ai/artifact/CdL19bNnRfdK2m4gciikVh (7 artboards: Main, Detail, Grant, Remove, MobileEn,
  MobileAr, Denied; private, may expire). This text prevails.

## 1. What Core provides (P6-S0)

| Capability | Core | Admin |
|---|---|---|
| Operator directory, one operator's account (contact, blocked, confirmed) | 🔴 none; `GET /auth/admin/operators[/:id]` are in ADR-0012, the SDD and the TDD only (CF-03, CF-34) | P6-S1: provisional mock; production "not available" |
| One operator's assignment history | 🟢 `GET /auth/admin/operators/:id/platform-assignments`, owner only; `200` every record oldest first (`id, platformId, assignedBy, assignedAt, revokedAt, revokedBy, active`); collapsed `404` | P6-S1: gateway in Core's shape; mock; no HTTP adapter authorized |
| Grant a Platform | 🟢 `POST …/platform-assignments` `{platformId}`, step-up `platform_assignment.grant`; `201` the new record; `409 assignment_conflict`; `404`; `503 hierarchy_unavailable` | P6-S2 |
| Remove a Platform | 🟢 `DELETE …/platform-assignments/:platformId`, step-up `platform_assignment.revoke`; `204`; `404` when not active | P6-S2 |
| Block / unblock | 🟢 `POST …/operators/:id/block|unblock`, owner, **no step-up**, `204`, repeatable; block ends every session and cancels every unused code; assignments kept | P6-S3 |
| Create an operator | 🟢 `POST /auth/admin/operators` `{email}` or `{phone}`, step-up `operator.create`; `201 {id, email, phone, isActive}`; `409 account_already_exists` | P6-S4 (CF-16, CF-32, CF-33) |
| Resend a confirmation code | 🔴 none (CF-16) | never offered |
| Operator step-up | 🔴 not built (CF-08) | operators change nothing here |

- Grant, remove and create accept **TOTP, a passkey or the secret key**; block needs no step-up. A step-up is spent only
  when the change commits.
- An operator is one `user` (kind `operator`, no password) with one `operator` row: one Company, one email or one phone
  (unique across every account kind). Never a member, never an Organization admin; the owner is never an operator.
- Platform authority is checked live on every request: a removal stops the next request on that Platform but ends no
  session; a block ends every session.
- No last-operator rule, no self-assignment (operators get `403`), no idempotency keys, only the coarse per-IP throttle
  and the step-up buckets.

## 2. Authorization

| Actor | Directory / details | Grant · remove · create · block |
|---|---|---|
| Company owner | ✅ (provisional read) | ✅ (later slices; step-up except block) |
| Platform operator | ❌ no destination; a direct URL lands on the forbidden page; nothing is requested | ❌ (Core `403`) |
| Organization admin or member | not Admin actors | — |

Operator authority comes only from active assignment records, never from memberships or the Organization-admin flag.

## 3. P6-S1 as built

- **Routes:** `/operators` and `/operators/:operatorId` (company scope), guarded by `company.operators.view` (owner); the
  sidebar's "Operators & access" is now a link for the owner only. Breadcrumb "Company › Operators & access › Operator".
- **Gateways:** `OperatorDirectoryGateway` (`list(company)`, `load(company, id)`), PROVISIONAL; `OperatorAssignmentGateway`
  (`history(id)`), Core's verified read. Mock adapters in demo builds (owner only: `403` for an operator, `401` without a
  session, collapsed `404` for an unknown or foreign operator); `unavailable` adapters in every other build.
- **Facades:** `OperatorDirectoryFacade` (owner-only load, totals, local search, URL filters `platform` / `state` / `sort`);
  `OperatorDetailFacade` (account first; the history is requested only once the account is shown, so a not-found
  operator reveals nothing; current and removed access apart).
- **Directory:** contact (LTR, isolated), active Platforms as pills, account state in words (demo), date added; totals
  (operators, active assignments, without access); provisional and read-only notes; loading, empty, no results, error
  with Try again, not available in this build, forbidden.
- **Details:** current Platform access (link to the Platform), removed access with given and removed dates, "given and
  removed by the Company owner"; the account (contact, demo state, added, what the state means); what Platform access
  means; the later changes listed as text only, no button. Not found, not available, error states.
- **Mutations:** none. No create, grant, remove, block, unblock or resend control exists.

### Demo world

- `OperatorProfileRecord` per operator identity (`email | phone`, `createdAt`, `contactConfirmedAt`, `blocked`). The
  sign-in fixtures read staff contacts and starting confirmation from the seed (`DEMO_OPERATOR_CONTACTS`,
  `DEMO_OPERATOR_CONFIRMED`); a successful contact confirmation in the sign-in flow commits `confirmOperatorContact` to
  the world. Working codes, confirmation codes and attempts stay in `DemoAuthState`.
- `PlatformAssignmentRecord` now has Core's history fields. Eight records, five active (School 3, Drive 2, four unique
  operators: every existing figure unchanged): the phone operator's Drive access was removed then given again; the
  unassigned and the blocked operators kept only removed records.
- A sixth operator, `operator.blocked@demo.nawara.invalid` (user id `…4e21`), blocked by the owner: listed in the sign-in
  hints; Core-like, no working code is issued or redeemed.

## 4. Mutation safety (later slices)

- One `ActionRun` per action, owner-only context; never resent automatically.
- Grant: `409 assignment_conflict` means already active; after a lost answer, reload the history and say what it shows.
- Remove: `404` is ambiguous (already removed, or unknown); reload the history.
- Block / unblock: repeatable, so "Try again" is safe; Admin cannot read the result (CF-03).
- Create: a lost answer cannot be reconciled (no idempotency key, no directory; CF-32).
- Warnings, never blocks, for the only listed operator of a Platform and an operator's only Platform (no Core rule).
- After a refusal on a Platform, refresh the operator's own `GET /auth/grants` so the switcher drops it.

## 5. Slices

1. **P6-S0** Core verification — done (read only).
2. **P6-S1** read-only directory and details — this slice.
3. **P6-S2** grant and remove Platform access (step-up, `platform_assignment.grant` / `.revoke`).
4. **P6-S3** block and unblock (no step-up, alert dialog).
5. **P6-S4** create an operator (`operator.create`; CF-16, CF-32, CF-33).

## 6. Risks and Core follow-ups

- **CF-03** no operator directory or account read: the directory is provisional; production shows "not available".
- **CF-16** no confirmation reissue; an operator blocked before confirming can never confirm.
- **CF-32** a lost create answer cannot be recovered. **CF-33** a duplicate contact discloses an existing account.
- **CF-34** documented-only contact, schedule and time-off endpoints.
- The secret key satisfies grant, remove and create; block has no step-up (Core's choices).
- An operator's Platform list in Admin is read at sign-in and may lag a removal until a refusal or a new sign-in.

## 7. Tests (P6-S1)

- Demo world: unique ids, one account per operator identity, fictional contacts, append-only history ordered and owned
  by the owner, one active record per operator and Platform, grants and counts from active records only.
- Auth mock: staff confirmation read from and written to the world; a blocked operator gets no code and cannot confirm.
- Mocks and unavailable adapters; query parsing, search, filters, sort; directory and detail pages (owner, operator
  denial without requests, not found without a history request, unavailable builds, empty, error); the shell route's
  guard; production route bindings; breadcrumb parent.
- Browser (development server): EN / FR / AR, RTL, light / dark / system, 1440 / 1024 / 834 / 390 / 320, keyboard,
  operator direct URLs, blocked sign-in, sign-in regressions, no contact in URLs or storage.
