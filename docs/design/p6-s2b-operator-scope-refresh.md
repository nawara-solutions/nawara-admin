# P6-S2b — Signed-in operator Platform-list refresh

- **Status:** design approved 2026-10-24; **implemented** 2026-10-24 (development-only mock prototype; no Core HTTP
  integration).
- **Baselines:** Admin `main` `a890ab6` (P6-S2, PR #31). Core facts from P6-S0 at `origin/main` `750eb21`.
- Overall P6 design: [`p6-operators-and-access.md`](p6-operators-and-access.md); access changes:
  [`p6-s2-platform-access.md`](p6-s2-platform-access.md).

## 1. What it fixes, and what it does not replace

A signed-in operator's Platform list (`OperatorActor.platformAssignments`, read from `GET /auth/grants` at sign-in)
drove the switcher, the sidebar, breadcrumbs and every platform-scope access state, and never changed during the
session. After an owner removed or gave an assignment, the operator's list stayed stale until a new sign-in.

**Refreshing the displayed list does not replace server-side authorization.** Core re-checks the active assignment on
every protected request (and the demo mocks do, live from the world); a refused request stays refused. The refresh only
makes Admin show what Core already enforces.

## 2. Core contract used (verified, P6-S0)

- `GET /auth/grants`, any signed-in identity (`@Actors()`), `200 { userId, kind, companyId, platformAssignments,
  organizationAdminMemberships }`; for an operator, `platformAssignments` = the platformIds of their ACTIVE assignments,
  read live (`grants.service.ts`). Admin's `Grants` model keeps `companyId` and `platformAssignments` only.
- `401 unauthenticated` when the account is inactive (blocked) or the session (refresh family) is no longer active
  (`auth.guard.ts`). Removing an assignment ends no session.
- Not verified: the exact `429` answer of this route (only the coarse per-IP throttle applies).

## 3. Architecture

- **`AuthSession`**: `epoch` (increments on every sign-in and sign-out, never on a refresh) and
  `refreshGrants(epoch, userId, platformAssignments)`: replaces a signed-in OPERATOR's list for the same user and the
  same session only, and only when the set differs (order-insensitive). An owner's session, the user and the kind never
  change; nobody is signed out.
- **`OperatorGrantsRefresh`** (`core/auth/`, provided by the shell route beside `ScopeContext`, using the shell's
  `AuthGateway`): the ONE refresh algorithm for every trigger.
  - Operators only; never polls.
  - One request at a time. A trigger during a request is absorbed; a refusal or a retry during one queues exactly one
    follow-up (the answer in flight may predate the change that caused it).
  - Requests are numbered and tied to the session epoch and user: an older answer, or one for a session that ended or
    was replaced, changes nothing. A slow answer cannot restore a Platform a newer answer removed.
  - A genuine `401`: the local session ends (`AuthSession.signOut`; every scope that follows the actor clears) and the
    sign-in page opens with the existing neutral reason `session-expired` ("Your session has ended. Sign in again to
    continue.", EN/FR/AR). Only from `/auth/grants`; a Platform-level `404` never ends a session.
  - A transient failure (network, `429`, `503`, unexpected): the session and the last known list stay (never an empty
    list); the refusal that asked stays in effect; a retry is offered on that page.
- **`ScopeContext`** owns the triggers that need the URL or the scope: `platformRefused(platformId)` (only for a Platform
  the operator's list still shows), the Platform switch (each change of the URL's Platform, not the first one after
  sign-in), and `reload()` ("Try again" on the operator's Platforms) refreshing grants first. `reportsRefusal(scope,
  platformId)` passes a read's `404`/`403` on unchanged after reporting it.
- **Refusal reporting points:** the Organization directory facade, the Organization detail facade and the Platform
  dashboard facade (their reads of a Platform).
- **`GrantsRefreshNotice`** (`layout/`): on the three "not accessible" states, for the Platform whose page asked only:
  "Your access may have changed. Your Platform list has been refreshed." (`role="status"`), or "Your Platform list could
  not be refreshed right now." with "Try again" (a grants read, nothing else). It never names the Platform, an
  administrator or a time.
- **Demo mock:** `MockAuthGateway.grants()` answers from the world at each call and, like Core's guard, `401` for an
  operator the owner blocked (whose sessions Core revoked); the simulated session ends with it.

## 4. Triggers

| Trigger | Where | Notice |
|---|---|---|
| A protected Platform read refused (`404`/`403`) for a listed Platform | `reportsRefusal` in the three facades → `ScopeContext.platformRefused` | yes (refreshed / unavailable) |
| Return to the tab (`visibilitychange` → visible) | `OperatorGrantsRefresh` | no |
| Platform switch (switcher, link, address) | `ScopeContext` | no |
| "Try again" on the operator's Platforms; the notice's "Try again" | `ScopeContext.reload`, `GrantsRefreshNotice` | yes (notice retry) |

After a refresh the existing behaviour applies unchanged: a Platform still listed stays selected; one that is gone
shows the established "Platform not found or not accessible" state; with no Platform left, home is the established
no-access page. Nothing is re-sent or re-navigated automatically.

## 5. Tests and acceptance

- `AuthSession.refreshGrants`: set comparison, same actor object for identical grants, owner / other user / ended or
  replaced session untouched.
- `OperatorGrantsRefresh` (controlled gateway): removal and addition, identical grants, owner and signed-out never ask,
  overlapping triggers (one request, one follow-up), session replaced or ended during a request, genuine `401` (session
  ended, sign-in with the reason, follow-up dropped), network / `429` / `503` (session and list kept, notice and retry),
  silent triggers tell nothing, tab return, no polling.
- Integration over a controlled demo world (the owner's change applied before the operator's next request, no
  multi-tab behaviour): a removed Platform refused then dropped from the list with the notice and the refusal standing
  (no resend, no re-navigation); a given Platform appearing on tab return; one refresh per switch, none for the first
  Platform or a query change; "Try again"; the last Platform gone → home is no-access; a blocked operator's `401`;
  a transient failure then a retry; an owner never refreshing; authority unchanged after the refresh.
- Browser (development server; the owner's change made through Angular's development-mode debug handle to the demo
  world): EN/FR/AR, RTL, light/dark/system, 1440/834/390/320 — refusal → notice and sidebar update, tab return restores
  a given Platform, a block ends the session with the sign-in reason, owner and operator sign-in regressions.

## 6. Limitations

- The demo holds one session per tab, so two people are never signed in at once; the stale state is produced by the
  specs' controlled world, or by the development-mode debug handle in the browser.
- Reporting covers the three platform-scope reads; a refusal elsewhere (an action's `404`) refreshes on the next trigger.
- No HTTP adapter: the real `GET /auth/grants` call, its `401` mapping and the `429` answer belong to the auth HTTP
  adapter (A4 integration).
