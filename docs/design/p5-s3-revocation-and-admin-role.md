# P5-S3 — Membership revocation and the organization-admin role (design specification)

- **Status:** design approved by the owner (2026-10-24, all seven decisions in §11). **P5-S3a (revocation) implemented**
  as a development-only mock prototype on `main` `afbf3fc`; **P5-S3b (the organization-admin role) not implemented**.
  Production binds the unavailable adapter.
- **Why this file exists:** the design canvas (9 artboards) has already become unavailable; this text is the durable
  record and prevails.
- **Contract source:** the P5-S0 read-only Core verification (nawara-core `origin/main` `b91b7bf`): `CORE-INTEGRATION.md`
  §5 and the P5-S0 session's source excerpts of `apps/auth-service/src/membership/membership.service.ts` (`revoke`
  `:148-192`, `setAdmin` `:194-218`), `membership/organization.controller.ts:94-120`, `owner/step-up.service.ts`
  (`STEP_UP_METHODS`). No new Core access for this design.

## 1. Three separate actions

| | Revoke membership | Make organization admin | Remove organization-admin role |
|---|---|---|---|
| Route | `POST /auth/organizations/:organizationId/memberships/:membershipId/revoke` | `POST …/memberships/:membershipId/admin` | `DELETE …/memberships/:membershipId/admin` |
| Body / headers | none | `x-step-up-token` (required) | `x-step-up-token` (required) |
| Success | `200 { id, status: 'revoked' }` | `204` | `204` |
| Who (Core) | owner, assigned operator, organization admin (not of another admin) | Company owner only | Company owner only |
| Step-up | none (CF-26) | `organization.admin.grant`, TOTP or WebAuthn only | `organization.admin.revoke`, TOTP or WebAuthn only |
| Precondition | `status = active` | `active` and not admin | `active` and admin |
| Changes | `status → revoked`, `revokedAt`, `revokedBy`, **`isOrganizationAdmin → false`** in the same statement | `isOrganizationAdmin → true` | `isOrganizationAdmin → false` |
| Admin | **P5-S3a, built (mock)** | P5-S3b, not built | P5-S3b, not built |
| Never changes | the user, sessions, other memberships | status, audience, anything else | status, audience, anything else |
| Audit (Core) | `membership.revoked` (metadata `authority`, `wasAdmin`), central `membership.revoked`, outbox event | `organization.admin.granted`, central `membership.admin_granted` | `organization.admin.revoked`, central `membership.admin_revoked` |

### Order and refusals (source)

- **Revoke:** throttle `membership_op_actor` (every attempt) → row locked by id **and** URL Organization (none: `404`)
  → authority (`404`) → own membership (`404`) → an organization admin revoking another admin (`404`) → not active:
  `409 membership_not_active` → conditional update (0 rows: `409`). Already revoked, pending or rejected: `409`.
- **Admin role:** throttle → authority must be `owner` (operators and org admins: `404`, not `403`) → step-up consumed
  (missing / wrong purpose / spent / secret key: `403 step_up_required`) → conditional update `status='active' AND
  isOrganizationAdmin <> target` → no row: **`404`, rolled back, the step-up is not spent**. So unknown id, another
  Organization's, not active, **already admin (grant) or not admin (remove)** are all the same `404`. No row lock; no
  self rule (owners are never members); **no last-admin rule**.
- **Not verified / not represented:** whether a revoked person can join the same Organization again; delivery of the
  `membership.revoked` event; that an admin made while `REQUIRE_CONTACT_VERIFICATION` is on and their contact is
  unverified has no effective authority (`organizationAuthority` requires a verified contact then) — grant itself does
  not check it.

### Corrections to the task baseline

- Self-revocation is known: refused as the collapsed `404`. Assigned operators may revoke organization admins (only an
  organization admin is barred from revoking another admin).
- A repeated grant/remove is a `404`, not a `409`; a repeated revoke is `409 membership_not_active`.

## 2. Authorization matrix

| Actor | Revoke member | Revoke an org admin's membership | Make admin | Remove admin role |
|---|---|---|---|---|
| Company owner | ✅ no step-up | ✅ (role cleared too) | ✅ step-up | ✅ step-up |
| Operator assigned to the Platform | ✅ | ✅ (Core allows) | ❌ `404`; Admin hides | ❌ `404`; Admin hides |
| Operator not assigned / other Platform / blocked | ❌ `404` | ❌ | ❌ | ❌ |
| Organization admin (product apps, not an Admin actor) | ✅ non-admins | ❌ `404` | ❌ | ❌ |
| The member themself | ❌ `404` | ❌ | ❌ | ❌ |

## 3. State model

```text
membership.status   pending ─approve▶ active ─revoke▶ revoked (no administrative restore today; not listable)
                       └──reject▶ rejected
admin role          (active only)  member ⇄ organization admin   (owner + step-up each way)
                    revoke from admin → revoked, role false (one statement)
```

Grant/remove never changes `status`; revoke never leaves `isOrganizationAdmin = true`.

## 4. Frontend contract and responsibilities

| Layer | Change |
|---|---|
| `MembershipGateway` | + `revoke(org, id): Observable<{ id; status: 'revoked' }>`; + `setOrganizationAdmin(org, id, admin: boolean, { stepUpToken }): Observable<void>` |
| `StepUpPurpose` (`core/auth/step-up.gateway.ts`) | + `organization.admin.grant`, `organization.admin.revoke` |
| `DEMO_STEP_UP_METHODS` (`auth.mock-state.ts`) | + both purposes: `['totp', 'webauthn']` |
| Demo commands (`membership.commands.ts`) | + `revokeMembership`, + `setOrganizationAdmin` (§5) |
| `MockMembershipGateway` | revoke: session → throttle → command; admin: session → throttle → owner authority (`404`) → `checkStepUp` (`403`) → command (`404`, step-up unspent) → `consumeStepUp`. Scenarios: `normal | decidedElsewhere | outcomeUnknown | rateLimited | unavailable` reused (`decidedElsewhere` = a competing revoke or role change) |
| `MembershipRevokeAction` | `ActionRun`, no step-up, owner + assigned operator; reload on `409`/`404`/unknown |
| `OrganizationAdminRoleAction` | `ActionRun` with step-up (purpose from the input's direction), owner only (`context()` null for operators) |
| Shared | one membership action at a time on the page: Approve/Reject/Revoke/role controls all wait on any pending run (`MembershipActions.sending`) |
| `OrganizationMembersFacade` | `whereabouts` gains `isOrganizationAdmin`; `adminCount()` of the loaded Active list (last-admin note) |
| UI | Active rows: "Actions" menu (`nwMenuTriggerFor`); detail page: "Manage membership" card; three dialogs (or one with a mode) |

## 5. Demo commands and invariants

- `revokeMembership(world, { organizationId, membershipId, actor, actorUserId, now })`: Core's order (§1). Result:
  exactly one record → `status: 'revoked'`, `revokedAt`, `isOrganizationAdmin: false`; activity `membership.revoked`.
- `setOrganizationAdmin(world, { organizationId, membershipId, actor, admin, now })`: the Company owner only
  (`platformViewerOf === 'owner'`), else `404`; then the record of that Organization with `status === 'active'` and
  `isOrganizationAdmin !== admin`, else `404`; result: only `isOrganizationAdmin` flips; activity
  `organization.admin.granted` / `organization.admin.revoked`.
- Invariants (tested): one record changes; no table but `memberships`, `activity`, `sequence` changes (people,
  identities, assignments, subscriptions, payments, invitations untouched — a consumed admin invitation stays
  consumed); revoke: that Organization's active count −1, pending unchanged, Platform and Company totals −1; role
  changes: no count changes; other Organizations unchanged; the audience is never read.

## 6. UX

- **Active rows:** an "Actions" menu button named "Actions for {identity}". Owner: "Make organization admin…" or
  "Remove admin role…", "View membership", separator, "Revoke membership…" (danger). Operator: "View membership",
  "Revoke membership…", and the note "Changing the role alone is for the Company owner". Requests/Rejected rows keep
  P5-S2's controls; no Revoked tab.
- **Authority line (Active tab):** owner: "…revoke memberships and change the organization-admin role"; operator:
  "…revoke memberships. Only the Company owner can change the organization-admin role."
- **Detail page:** "Manage membership" card with two sections (role, membership), each with its own explanation.
- **Revoke** (`alertdialog`, focus on Cancel): "{identity} loses access to {Organization}." For an admin: "They also lose
  the organization-admin role." "Not affected: their Nawara account and sign-in; their memberships in other
  organizations; subscriptions and payments (nothing is cancelled or refunded); not an account suspension." Note:
  "Nawara Admin has no way to restore a revoked membership today, and revoked memberships are not listed." (Not called
  permanent: future policies may change.) Button "Revoke membership". No verification step.
- **As built (P5-S3a):** Active rows have a direct "Revoke…" control (the "Actions" menu comes with P5-S3b, when a
  row has more than one action); for an organization admin the dialog opens with a warning that the administrative
  authority goes too, and for an operator adds that only the Company owner can make someone an organization admin.
- **Make admin** (`dialog`, focus on Continue): "{identity} gains administrative authority in {Organization} only: its
  memberships, join codes and admin invitations." "Their membership and audience stay as they are. No Company or
  Platform access, no other organization. No subscription or payment change." Unverified contact: a warning that the
  role may not take effect where verified contacts are required. Then verification.
- **Remove admin role** (`alertdialog`, focus on Cancel): "{identity} stays an active member of {Organization} but no
  longer administers it." When they are the only admin in the loaded Active list: "No other organization admin is
  listed. {Organization} will have no organization admin until you make someone one." (informational; Core allows it).
- **Verification:** the existing step-up step (purpose line, 6-digit code, passkey alternative; "Your secret key is not
  accepted for this change"), button "Verify and make admin" / "Verify and remove role".
- **After success:** toast with the Organization only ("Membership revoked in {Organization}.", "Organization-admin
  role granted in {Organization}.", "…removed…"). List: the row leaves Active (revoke) or its badge changes (role);
  focus returns to the row's Actions button, or after a revoke to the next row's, else the count. Detail page: role
  change stays (badge updates, focus to the facts heading); **revoke navigates back to the members list** (the
  revoked membership is no longer listable and would read "not found"), focus on the count.
- **Responsive / RTL / themes / i18n:** as P5-S1/S2: cards below 40rem with a full-width 44 px "Actions" button;
  dialogs become sheets; EN/FR/AR for every string; machine values untranslated.

## 7. Failure handling (status and Core `code` only)

| Answer | Revoke | Make / remove admin |
|---|---|---|
| success | `200`: toast, refresh | `204`: toast, refresh |
| `409 membership_not_active` | "No longer active; nothing changed by your request" + reload | — |
| `404` | "No longer available to you" + reload | "The role was not changed: the membership may no longer be active, or its role was already changed. Your verification was not used up." + reload, then show the current status and role |
| `403 step_up_required` / wrong code | — | stay in verification: "Verification refused", verify again (existing `verificationRefused`) |
| `429` / `503` | nothing applied: Try again | nothing applied: Try again (verifies again) |
| no answer | "Couldn't confirm": Check status (reload, show where it is); Try again only if still active | same; Try again only if the role is still the old one (a new verification) |

After a revocation's reload, a membership absent from every list is described as "no longer listed as active: it may
have been revoked, possibly by your request", never as proven: revoked memberships cannot be listed (CF-24).

Never an automatic retry, no idempotency key (Core has none). The dialog's status line waits for a list answer newer
than the failure (`loadSequence`).

## 8. Files (P5-S3a as built; P5-S3b anticipated)

P5-S3a new: `application/membership-revoke.action.ts`, `application/membership-action-support.ts` (the
`MembershipActionLock`, shared context and Platform guard), `components/revoke-membership-dialog/*`,
`pages/membership-revocation.spec.ts`, this file. P5-S3b anticipated: `organization-admin-role.action.ts`,
`components/membership-actions-menu/*`, `components/organization-admin-role-dialog/*` (+ specs).

Changed in P5-S3a: `demo/world/commands/membership.commands.ts` (+ spec), `demo/world/records.ts`,
`membership.gateway.ts`, `membership.mock.ts` (+ spec), `membership-decision.model.ts`, `membership-decision.action.ts`
(the shared lock), `organizations.routes.ts`, `member-list.*`, `organization-members.page.*`, `membership-detail.page.*`,
the activity feeds and models, `i18n/*`, `testing/members-testing.ts`, docs. P5-S3b will also change:
`core/auth/step-up.gateway.ts`, `core/auth/auth.mock-state.ts`; `demo/world/commands/membership.commands.ts`
(+ spec), `demo/world/records.ts` (activity actions); `membership.gateway.ts`, `membership.mock.ts` (+ spec);
`membership-decision.model.ts` → shared membership-action model; `organization-members.facade.ts`;
`membership-decision.action.ts` (shared single-flight); `organizations.routes.ts`; `member-list.*`,
`organization-members.page.*`, `membership-detail.page.*`; the three activity feeds and models; `i18n/{en,fr,ar}.json`;
`tools/check-production-bundle.mjs`; `docs/CORE-INTEGRATION.md` (revoke and role facts, §7 rows, CF updates),
`docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/design/p5-users-and-memberships.md`, `CLAUDE.md`.

## 9. Tests and browser acceptance

- Commands: revoke an active member and an active admin (role cleared); `409` for revoked/pending/rejected and a repeat;
  `404` for unknown, another Organization's, an unassigned operator, one's own; owner and assigned operator succeed;
  grant/remove flip only the flag; `404` for operator, not active, already in the target state; counts move only on
  revoke (Organization, Platform, Company); no other table changes; audience never read.
- Gateway: order (throttle first); `403` without, with a wrong-purpose, a spent or a secret-key step-up; the step-up is
  not spent by a `404`; single use; scenarios.
- Actions/pages: owner sees role items, operator does not (and `context()` is null for the role action); one action at
  a time across all membership controls; double clicks; outcome unknown → reload, no resend; `409`/`404` reconcile;
  revoked rows leave Active and their detail URL reads not found; badges and the admins filter update; no Revoked tab;
  last-admin note; focus management; production: unavailable adapter offers nothing.
- Browser: owner EN light 1440 (menu by keyboard, grant with verification, remove last admin, revoke from list and
  detail), operator dark 834 (revoke an admin's membership; no role items), FR system, AR RTL 390 and 320 (sheets),
  no overflow, no contacts in URLs/storage/toasts/console; dashboard/overview counts after a revoke.

## 10. Risks and unresolved Core facts

- **No step-up on revoke (CF-26):** a stolen operator session can revoke members and organization admins.
- **Collapsed `404` on the role:** Admin cannot tell "already admin" from "gone"; reconcile by reload.
- **Revoked is invisible and not restorable today:** no list, no restore, no history in Admin (CF-24); re-join
  semantics unverified.
- **Effective admin authority** depends on contact verification when Core requires it; grant does not check.
- **Shared throttle:** decisions, revoke and role changes share 120 per 15 minutes per actor.
- **No last-admin protection** in Core: an Organization can be left without an admin (Admin warns only).
- **Event delivery:** `membership.revoked` is emitted to the outbox; whether the person is notified is unverified.

## 11. Owner decisions (approved 2026-10-24)

1. Operators may revoke organization admins' memberships (Core allows). *Recommended: yes, with the "also removes the
   admin role" line.* Alternative: hide Revoke on admin rows for operators.
2. Remove the last listed admin: warn, never block. *Recommended.*
3. After revoking from the detail page: return to the list. *Recommended.* Alternative: a terminal "Revoked" page from
   the action's result (not re-readable).
4. Make admin on an unverified contact: allow with a warning. *Recommended.* Alternative: disable.
5. One membership action at a time per page, across decisions, revoke and role. *Recommended.*
6. Record `membership.revoked`, `organization.admin.granted`, `organization.admin.revoked` in the activity feeds.
   *Recommended.*
7. Split: **P5-S3a** revoke (no step-up, owner + operator) and **P5-S3b** the admin role (owner + step-up). *Recommended*
   (two smaller PRs; S3b reuses S3a's menu and reconciliation). Alternative: one PR.
