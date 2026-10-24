# P6-S2 — Give and remove Platform access

- **Status:** design approved 2026-10-24 (decisions D1–D5 below); **implemented** 2026-10-24 as a development-only mock
  prototype. No Core HTTP integration.
- **Baselines:** Admin `main` `8a9ed51` (P6-S1, PR #30). Core contract from the P6-S0 read-only verification at
  `origin/main` `750eb21` (`docs/CORE-INTEGRATION.md` §5); Core was not read again for P6-S2.
- **Canvas:** https://claude.ai/artifact/YCAVa135od9t4FFYtgM3F1 (9 artboards; private, may expire). This text prevails.
  Artboard 3 shows a three-factor chooser; per D1 the built dialog asks for the authenticator code only.
- Overall P6 design: [`p6-operators-and-access.md`](p6-operators-and-access.md).

## 1. Owner decisions (approved)

- **D1** Reuse the existing authenticator-code step-up UI. No passkey or secret-key chooser in this slice: a shared
  factor selector for every eligible step-up is a separate work item. The abstract contract does not narrow Core's
  factors (TOTP, passkey, secret key), and the dialog says Core accepts the other two.
- **D2** Warnings (the operator's only Platform; no other operator listed for the Platform) are information only; Core
  has no such rule and nothing is blocked.
- **D3** The signed-in operator's Platform list is not refreshed in this slice: **P6-S2b**.
- **D4** Grant records `operator.assigned` (existing); removal adds `operator.unassigned`.
- **D5** One action and one dialog for both directions, with distinct consequences, roles and step-up purposes.

## 2. Core contract (verified, P6-S0) → Admin

| Core | Admin | Admin failure |
|---|---|---|
| `POST /auth/admin/operators/:id/platform-assignments` `{platformId}`, `X-Step-Up-Token` (`platform_assignment.grant`) → `201` the record | `OperatorAssignmentGateway.grant(operator, platformId, {stepUpToken})` → `PlatformAssignment` | — |
| `409 assignment_conflict` (an active record exists) | | `conflict` → reconcile |
| `DELETE …/platform-assignments/:platformId`, `X-Step-Up-Token` (`platform_assignment.revoke`) → `204` | `revoke(operator, platformId, {stepUpToken})` | — |
| `404` collapsed (unknown / foreign operator or Platform; nothing active to remove) | | `refused` → reconcile |
| `403 step_up_required` (missing, used, expired, other purpose, other user) | | `verificationRefused` → stays in verification |
| `403 forbidden` (not an owner), `401` | | `refused` (never offered to them) |
| `503 hierarchy_unavailable` (**grant only**, before anything is written) | | `unavailable` → reconcile |
| network loss / unknown | | `outcomeUnknown` → reconcile, never resent |
| `429` (coarse per-IP throttle; **exact answer unverified**) | `rate_limited` with no detail | `rateLimited` |

No idempotency key is sent (Core has none here). Behaviour branches on status and `code` only.

## 3. Authorization and security invariants

- **Owner only**, enforced in four places: capability `operator.platformAccess.change` (UX), `PlatformAccessAction`
  context (`null` for anyone else), the mock (`403 forbidden` for an operator, even on their own record; `401` without
  a session), and **inside the commands** (`grantPlatformAssignment` / `revokePlatformAssignment` refuse a non-owner).
- Company isolation: the operator and (for a grant) the Platform must be the owner's Company's; otherwise one collapsed
  `404`. Organization memberships and the organization-admin flag never confer or change Platform authority.
- Step-up: purpose-bound (`platform_assignment.grant` vs `.revoke`; one is never accepted for the other), user-bound,
  single-use, live; **checked** before the change and **spent only when the change commits**. A `404`, a `409` or a
  `503` leaves it unspent. The demo binds grants to the user, not to Core's session family (an existing mock limit).
- Never replayed: a lost answer, a conflict or a refusal reloads the history; "Try again" always starts a new
  verification and only appears once the reload shows the old state (or after a rate limit or a refused code).
- One change at a time per page: the run is single-flight; every access control is `aria-disabled` with the reason
  while a verification is checked or a change is sent.

## 4. As built

- **Commands** (`demo/world/commands/operator.commands.ts`): grant appends exactly ONE active record (UUID-shaped id from
  the world's sequence, `assignedBy` the owner, `assignedAt` now) and one `operator.assigned` activity; an active
  record → `409 assignment_conflict`. Revoke marks exactly the current active record (`revokedAt` ≥ `assignedAt`,
  `revokedBy` the owner) and records one `operator.unassigned`; none active → `404`. History is append-only; at most one
  active record per operator and Platform; no other table changes (operator accounts, memberships, subscriptions,
  commercial records). Blocked or unconfirmed operators may be granted, as in Core.
- **Mock** (`MockOperatorAssignmentGateway`), in Core's order: session → owner guard → [grant: hierarchy] → operator
  (and Platform) in the Company → step-up check → command → spend. Scenarios (`OPERATOR_ASSIGNMENT_DEMO_SCENARIO`):
  `normal`, `changedElsewhere`, `outcomeUnknown`, `hierarchyUnavailable`, `unavailable`, `rateLimited`.
- **Facade:** `OperatorDetailFacade` refreshes the account and the history in place on `ScopeContext.revision`, counts
  history answers (`historySequence`) and answers `isAssigned(platform)`.
- **Action:** `PlatformAccessAction` (detail route): one `ActionRun`; success → `organizationsChanged()` (operator
  directory, Platform directory, dashboards and Overview recount; this history reloads in place), a toast naming the
  Platform only, focus on "Current Platform access". The "no other operator listed" count comes from the provisional
  directory (CF-03); when it cannot be read, no warning is claimed.
- **Dialog** (`PlatformAccessDialog`): grant is a `dialog` (focus on the selected choice; a radio group of the
  Company's Platforms, assigned ones disabled "Already assigned"); removal is an `alertdialog` with focus on Cancel and
  what changes and does not (no block, no sign-out, history kept). Then the code, pending (cannot be closed), result.
- **Page:** "Give access to a Platform…" (disabled with the reason when every Platform is assigned) and "Remove access…"
  on each active row; the record moves to "Removed access" after a removal.

## 5. Effective authority and the stale operator list (P6-S2b)

- After a removal, the canonical checks (`grantsOf`, `platformViewerOf`, every mock that uses them) deny the operator's
  next protected request on that Platform at once; nothing signs them out.
- A signed-in operator's Platform list (`Actor.platformAssignments`, fixed at sign-in) may stay stale in another
  session until they sign in again: known, accepted for P6-S2 (D3). **P6-S2b** re-reads `GET /auth/grants` after a
  Platform refusal, on returning to the tab and from "Try again"; no polling, no sign-out. The authorization checks are
  not weakened to hide it.

## 6. Tests and acceptance (P6-S2)

- Commands: one record per grant, one marked per removal, re-grant after removal, `409`, repeated removal `404`,
  non-owner `403`, foreign operator / Platform `404`, one active per pair through any sequence, untouched tables,
  activity, grants and counts follow.
- Mock: Core's order; each of the three factors accepted for both purposes; other purpose / other user / expired / no
  token refused and nothing spent; `409` and `404` leave the step-up unspent; two concurrent grants → one success, one
  `409`; operator `403`; scenarios.
- Pages: grant by keyboard-reachable radio group; disabled "Give access" with its reason; alertdialog focus on Cancel;
  both warnings, never blocking; refused code stays in verification; Cancel sends nothing; lost answer, `409`, `404`,
  `503` reconcile and never resend; throttling offers a new verification; operator never offered or able to open it.
- Browser: EN / FR / AR, RTL, light / dark / system, 1440 / 1024 / 834 / 390 / 320, keyboard, focus, counts refresh,
  removal activity, a removed operator signing in again has no access.

## 7. Open items

- **P6-S2b** signed-in operator Platform-list refresh.
- **Shared step-up factor selector** (passkey and secret key) for every eligible purpose.
- **CF-03** production operator directory (also the source of the "no other listed operator" warning).
- Exact `429` answer for these routes unverified; `503 hierarchy_unavailable` verified for grant only.
