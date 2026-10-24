# P5-S4 — Member account suspension and restoration (design and feasibility)

- **Status: DEFERRED / BLOCKED BY CORE** (owner decision, 2026-10-24). Account-wide suspend and restore are **not
  implemented**; Option L (§4) was **rejected**. The only change shipped is a read-only "Nawara account" card on a
  membership's details (§7a). §5, §6 and §10 describe what to build once Core unblocks it (CF-28).
- **Baseline:** Admin `main` `163cb9d` (P5-S3b merged, PR #28).
- **Contract source:** the P5-S0 session's source excerpts of nawara-core `origin/main` `b91b7bf`:
  `apps/auth-service/src/members/member-security.controller.ts` (`:1-60`), `member-security.service.ts` (`:1-114`),
  `owner/step-up.service.ts` (`STEP_UP_METHODS`). No new Core access.
- **Canvas:** 6 artboards (private, may expire; artboard 1 is the deferred card, 2–5 the rejected Option L, 6 the
  operator). This text prevails.

## 1. Verified contract

| Fact | Value | Source |
|---|---|---|
| Suspend | `POST /auth/admin/members/:id/suspend`, body `{ reason }` | controller `:33-45` |
| Restore | `POST /auth/admin/members/:id/restore`, no body | controller `:47-59` |
| `:id` | the member's **user id** (`ParseUUIDPipe`; malformed: `400`) — the `userId` of a membership row | controller |
| Reason | closed enum `compromised_account | security_incident | policy_violation` (`@IsIn`; free text refused, `400`) | controller `:9-13`, service `:12` |
| Success | `200 { id, suspended, changed }`, `Cache-Control: no-store`; `changed: false` = already in that state, nothing written | controller `:15-19`, service `:73` |
| Who | `@Actors('owner')`: operators and members are refused by the guard with **`403`** (not a collapsed `404`) | controller `:21-23, 36, 50` |
| Step-up | header `x-step-up-token`; purposes **`account.suspend` / `account.restore`**; **TOTP or WebAuthn only** (never the secret key); consumed in the transaction | controller `:38, 52`; `STEP_UP_METHODS`; service `:71` |
| Order | the owner's Company (none: `404`) → step-up consumed (`403`) → target row locked `FOR UPDATE` → eligibility (else `404`, **rolled back: the step-up is not spent**) → if already in the state: `200 changed:false` (**the step-up IS spent**, the transaction commits) → set `isActive`, on suspend revoke every refresh-token family → audit `account.disabled|enabled` (metadata `reason`), central audit (`organizationId: null`) | service `:64-95` |
| Eligibility | `kind = member`; **at least one ACTIVE membership in an Organization of the owner's Company**; **no ACTIVE or PENDING membership in another Company** (suspension is global, so one Company must not deny access under another) | service `:97-113` |
| Ineligible | unknown id, not a member, the owner, another Company's member, a shared identity: all the same `404`; a denied record is kept locally, never shown | service `:42, 90-93` |
| Effects | suspend: the identity is disabled and every session family revoked; access tokens stop on the next request (Core reloads user and session on every request, `CORE-INTEGRATION.md` §2). Restore: re-enables; **sessions are not recreated**. Memberships, admin roles, subscriptions untouched | controller `:39, 53`; service |

**Not available / unverified:** any owner read of an account's state (`isActive`/suspended): the membership list
projection has no such field (`membership.service.ts:90-91`); any read of the person's other memberships or a member
lookup (CF-03); a throttle bucket for these routes (none on record); whether a revoked or rejected membership elsewhere
counts (only active/pending elsewhere refuse); notification of the person.

**Corrections to earlier Admin notes:** the purposes are `account.suspend` / `account.restore` (Admin's §5 note said
"factor step-up" without names); non-owners get `403`, not `404`; repeated operations are `200 changed:false`, not
errors; restore has no reason.

## 2. Account versus membership

| | Organization membership | Nawara account (Auth user) |
|---|---|---|
| Scope | one Organization | the person, everywhere |
| Admin can read | yes: rows of one Organization (status, role, contacts) | **no state at all** |
| Actions built | approve, reject, revoke, admin role (P5-S2/S3) | none |
| Effect of the action | access to that Organization | sign-in and every session; every Organization |
| Who (Core) | owner, assigned operator (admin role: owner) | owner only |

The same person can hold memberships in several Organizations of the Company (ADR-0030). Admin sees each only from
its own Organization's list and cannot join them (no lookup; joining rows by `userId` across lists would mean loading
every Organization's lists and assembling a person view Core deliberately does not offer — out of bounds, privacy).

## 3. Authorization and step-up matrix

| Actor | Suspend | Restore | Core answer otherwise |
|---|---|---|---|
| Company owner, eligible target | ✅ `account.suspend` (TOTP/passkey) | ✅ `account.restore` (TOTP/passkey) | — |
| Company owner, ineligible target (also in another Company, no active membership here, not a member) | ❌ | ❌ | `404`, step-up not spent |
| Assigned operator | ❌ | ❌ | `403` (guard) |
| Organization admin / member | ❌ | ❌ | `403` |
| Owner, wrong / missing / secret-key step-up | ❌ | ❌ | `403 step_up_required` |

## 4. Feasibility verdict: **defer the account actions** (approved 2026-10-24)

The contract can be called faithfully (the target id is a membership row's `userId`), but the UI cannot be faithful:

1. **No current state:** Admin cannot tell whether an account is suspended, so it cannot offer the right action,
   show a suspended badge, or let anyone find a suspended account to restore later.
2. **Unknown reach:** an account-wide action from one Organization's page cannot say which other Organizations it
   affects.
3. **Eligibility is invisible until tried:** a shared identity fails only after the owner has verified (`404`).
4. **Idempotent no-ops spend the verification** and say nothing about the past.

Recommended now: an informative "Nawara account" card on the membership page (artboard 1) stating that account
actions wait for Core, with no control that sends anything — or nothing at all (owner decision). Build the actions
when Core offers an owner read of the account (§9, CF-28).

**Option L (limited) — rejected by the owner, 2026-10-24; kept only as a record:** offer "Suspend account…" and "Restore account…" side by side on a membership's
page for the owner, with "State not shown", and report only what each answer proves (`suspended`, `changed`) for that
visit. Faithful to the contract, but the owner works blind; acceptable only as an emergency control.

## 5. When Core unblocks it (CF-28): routes, gateways, actions

- No new route: a section of `…/members/:membershipId` (owner only; operators see nothing actionable).
- `MemberAccountGateway` (new, Auth): `suspend(userId, reason, { stepUpToken })`, `restore(userId, { stepUpToken })`
  → `{ id, suspended, changed }`; unavailable adapter in production.
- `StepUpPurpose` + `account.suspend`, `account.restore`; demo methods `['totp', 'webauthn']`.
- `MemberAccountAction`: one `ActionRun` with step-up (purpose from the direction), owner-only `context()`, registered
  with `MembershipActionLock`; never resent; after a lost answer, "Suspend again" / "Restore again" is offered as a new
  operation (Core's idempotency makes a repeat safe; it spends a new verification).
- Dialog: `alertdialog` (focus on Cancel) for suspend with a required closed-reason radio group; `dialog` for restore;
  then the shared verification step.

## 6. Demo world integrity (when built; nothing of it exists today)

- `MemberIdentityRecord` gains `isActive` (default `true`); an account-level activity record (`account.disabled` /
  `account.enabled`, `organizationId: null`, no contact, reason code only).
- `setAccountActive(world, { actor, userId, active, now })`: the Company owner only; eligibility exactly as Core (an
  active membership in this Company, none active/pending in another — the demo has one Company, so the second rule is
  covered by a purpose-built test world); state-idempotent (`changed: false`); memberships, roles, counts, assignments,
  subscriptions, payments and invitations unchanged.
- Sessions: the demo has no member sessions; nothing is simulated beyond the record.

## 7a. As shipped (2026-10-24): the read-only "Nawara account" card

- On every membership's details (any status), after "Other memberships": title "Nawara account"; "Revoking this
  membership removes access to this organization only. Suspending or restoring the person's Nawara account would act
  on every organization and every session."; a note "Not available yet." with, for the owner, "Nawara Core does not
  yet let Admin see whether this account is suspended or which other organizations it belongs to, so account
  suspension and restoration are not offered here", and for an assigned operator "Account suspension and restoration
  are reserved for the Company owner, and are not available in Nawara Admin yet."
- No button, link or field; no state badge; nothing inferred from the membership's status; no other memberships; no
  new gateway, mock state or endpoint. EN/FR/AR (Arabic: "تعليق" for suspend, distinct from "سحب" and "إلغاء").

## 7. UX (when built)

- **Distinction everywhere:** "Nawara account" is its own card, separate from "Manage membership"; copy names the
  account, never the membership; the revoke dialog keeps saying it is not a suspension.
- **Suspend dialog:** "Suspend this Nawara account?"; "every session ends now; they cannot sign in until the account is
  restored"; "every organization of your Company they belong to, not only {Organization} (Admin cannot list them)";
  "memberships, roles, subscriptions and payments are not changed"; reason required (radio group, codes untranslated
  in the request, labels translated); "To remove access to {Organization} only, revoke the membership instead."
- **Restore dialog:** "Restore this Nawara account?"; "they can sign in again; ended sessions are not brought back".
- **Outcomes:** `changed: true` → toast without contact; `changed: false` → "already suspended / already active;
  nothing changed; your verification was used"; `404` → "can't be suspended from your Company… nothing changed; your
  verification was not used"; `403` → stay in verification; unknown → "couldn't confirm… Admin can't check the account's
  state", offer the action again (new verification).
- **Blocked states:** operator → informative card only; production → nothing; status unavailable → artboard 1.
- Keyboard: radio group with arrows, Cancel focused first; EN/FR/AR (Arabic "تعليق" for suspend, distinct from Cancel
  "إلغاء" and revoke "سحب"); RTL; sheets at narrow widths; 44 px targets; light/dark/system.

## 8. Security and privacy risks

- **Blind high-impact action** (Option L): suspending the wrong person ends all their sessions; the only guard is the
  confirmation and the owner's factor.
- **Idempotent no-op spends a verification** and hides history (no "since", no "by whom").
- **No operator path:** in an incident only the owner can act (by design, ADR-0050 D7).
- **Account reach is invisible:** other Organizations of the Company are affected without being named.
- **No list of suspended accounts:** a suspension can be forgotten; restore needs a membership page of that person.
- **Revoked/rejected memberships elsewhere** do not block eligibility (only active/pending do): a person can be
  suspended while having history under another Company — Core's rule, recorded.

## 9. Core follow-ups

- **CF-28 Owner read of a member account:** e.g. `GET /auth/admin/members/:id` → `{ id, suspended, suspendedAt,
  reason?, eligible, organizationsInCompany: count }`, or `isActive` on owner membership rows. Unblocks the UI.
- **CF-29 Eligibility preview:** say before step-up whether the account can be acted on (or document that the `404`
  after verification is intended).
- **CF-30 Suspended-accounts list** for the owner (restore without a membership page).
- **CF-31 Throttle and repeat semantics:** confirm the bucket, and whether a `changed: false` should spend the step-up.
- Records: correct `CORE-INTEGRATION.md` §5 (purposes, `403`, idempotency, eligibility).

## 10. Tests and browser acceptance (when built)

- Command: owner only; eligibility (active here, none active/pending elsewhere, member kind); idempotent `changed:
  false`; only `isActive` changes; nothing else; activity without contact.
- Gateway: `403` for operators; step-up purposes, factors (secret key refused), spent on success and on `changed:
  false`, not spent on `404`; reason validation (`400`).
- Pages: owner-only controls; reason required; account copy distinct from revoke; outcomes; single-flight; no resend.
- Browser: EN/FR/AR, RTL 390/320, keyboard (radio group, focus order), themes, no contacts or tokens in URL/storage/
  console/toasts; production: nothing offered.

## 11. Owner decisions (2026-10-24)

Approved: (1) defer the account actions until CF-28 — Option L rejected; (2) show the informative card; (5) record the
corrected facts and CF-28 to CF-31. Decisions 3 and 4 apply only to Option L and lapse with it.

The proposal as presented:

1. **Defer the account actions until CF-28** (recommended), or build **Option L** (limited, state unknown).
2. While deferred: show the informative "Nawara account" card (recommended) or nothing.
3. If Option L: allow "Restore" without knowing the state (recommended: yes, side by side with Suspend).
4. If Option L: offer "Suspend again" after a lost answer as a new verified operation (recommended), or only Close.
5. Record the corrected facts in CORE-INTEGRATION and file CF-28 to CF-31 (recommended, in the next authorized slice).
