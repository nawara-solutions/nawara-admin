# P3b-S3 — Organization admin invitations (design specification)

- **Status:** implemented as a development-only mock prototype (2026-10-23); production binds the unavailable adapter.
- **Why this file exists:** the claude.ai design canvases are private and have become unavailable before; this text is the
  durable record of the approved design (six artboards: invitations card; create + verify; code once / copied / copy
  failed / close without copying; revoke and refusals; mobile 390 Arabic RTL; operator without invitations).
- **Contract:** source-verified in P3b-S3-0 against Nawara Core `origin/main` `dd07f2a`
  ([`CORE-INTEGRATION.md`](../CORE-INTEGRATION.md) §5). Everything below marked *mock* is Admin's simulation, not Core.

## 1. Verified Core contract (summary)

| | Create | List | Revoke |
|---|---|---|---|
| Route | `POST /auth/organizations/:organizationId/admin-invitations` | `GET …/admin-invitations` | `POST …/admin-invitations/:invitationId/revoke` |
| Body | `invitationType` (required, `^(?!admin$)[a-z][a-z0-9_-]{0,31}$`), `expiresInMinutes` (optional JSON integer), `inviteeContact` (optional string ≤ 254); unknown fields rejected | — | none |
| Success | `201` `{ id, invitationType, expiresAt, createdAt, contactBound, code }` | `200` rows `{ id, invitationType, contactBound, expiresAt, createdBy, createdAt, consumedAt, revokedAt, status }`, newest first, no pagination | `204` |
| Owner step-up | `admin_invitation.create` (TOTP or WebAuthn, never the secret key) | none | `admin_invitation.revoke` (factor only) |
| Who | owner of the Company (step-up) or an organization admin (no step-up); operators and strangers: collapsed `404 not_found` | same | same |
| Idempotency | none | — | none (a repeat is `404`) |

- **Expiry** is a duration: the server computes `expiresAt` from `expiresInMinutes` inside a configured range (default 15
  minutes to 7 days, default 24 hours); outside it: `400 validation_error`.
- **Contact**: with `@` an email (trimmed, lowercased, format not checked); otherwise a phone (spaces, `(`, `)`, `-`
  stripped; `^\+?[0-9]{8,15}$`). Only an HMAC is stored; Core returns `contactBound` only, never the contact.
- **Code**: 12 Crockford characters (60 bits), shown `XXXX-XXXX-XXXX`, no prefix; returned once; only its HMAC is stored.
- **Status** (derived): `consumed`, then `revoked`, then `expired`, then `active`.
- **Revoke** updates an unconsumed, unrevoked invitation of that Organization — **expired ones included**. Anything else
  (used, revoked, unknown, another Organization) is `404`; the transaction rolls back and the step-up is not spent.
  Revocation never touches memberships: an admin who already joined keeps their access.
- **Step-up consumption** happens inside the command's transaction after authority: refusals before it (body, throttle,
  authority) and after it (a rare `409 conflict` code collision, a revoke `404`) leave the grant unspent.
- **Throttle**: create and revoke share `invitation_manage_actor` (default 20 per hour per actor); every attempt counts;
  `429 rate_limited`, no `Retry-After` observed.
- **Audit names**: `admin_invitation.created`, `admin_invitation.revoked` (central audit). No event carries the code;
  nothing delivers invitations.

## 2. Owner decisions (2026-10-23)

| | Decision |
|---|---|
| D-A | `invitationType` is a free-text field validated against Core's exact pattern; no Admin taxonomy or per-Platform audience. The hint explains it is the audience label the product app expects, not a role picked here. |
| D-B | The demo code has Core's exact format (`XXXX-XXXX-XXXX`, Crockford); the mock is marked only by the "simulated" badge. |
| D-C | Revoke is offered on **active** invitations only; the domain model and mock still revoke an expired, unused invitation, as Core does. |
| D-D | "You" only when `createdBy` is the session's own user id; anything else is the neutral "someone else" (Admin cannot reliably tell an organization admin from any other creator). |
| D-E | Durations: 1 hour, 24 hours (default), 3 days, 7 days; a deployment's narrower range is handled by its `400`. |

## 3. Visibility and isolation

- Owner only (`platform.access.view`). The card is not rendered for operators, the invitations facade's Organization id
  is `null` for them, and the gateway is never called (a spec spies on it).
- The Organization comes from the detail page (already checked against the Platform in the URL). Before sending, the
  action re-checks that its Platform is still one of the actor's; the run's context is the owner and the Company, so a
  result for another actor (or after a sign-out) is dropped.

## 4. The card (artboard 1)

Organization details, left column, after Membership: "Organization admin invitations", the explanation that Nawara never
sends codes, **Create invitation**, and the list (newest first, no pagination): status badge (text + icon, never colour
alone), the type (`bdi`, LTR, not translated), "Only a specific person" / "Anyone with the code", "Created {date} · by
you / by someone else", and the status date (Expires / Used / Revoked / Expired). **Revoke** on active rows only, with an
accessible name that includes the type and creation date. States: loading, error with "Try again", empty, not in build.

## 5. Create (artboards 2, 3, 5)

1. Form: the Organization (read-only); **Invitation type** (required, Core's pattern, `admin` reserved); **Valid for**
   (1 h, 24 h default, 3 days, 7 days); **Who can use the code** (anyone / only this person + email or phone,
   normalized as Core). The contact is sent once and never shown again (not even on the code screen).
2. "Confirm it's you" for `admin_invitation.create` (simulated TOTP; the demo accepts `123456`).
3. Pending, locked (`nw-dialog` busy).
4. **Code once**: a warning ("Copy this code now. It is shown only once…"); the code in a read-only, monospace, LTR field
   (`translate="no"`, no autocomplete or spellcheck, selected on focus), never in a live region; **Copy code** (Clipboard
   API) with a polite "Copied" status, or on failure an alert and the code selected for manual copy; the facts
   (Organization, type, binding, expiry). The dialog is **guarded** until copied: Done, Escape, the backdrop or close ask
   "Close without copying the code?" (Back to the code / Close anyway).
5. When the dialog goes the code is gone (the run is reset). Closing an uncopied code without confirming (navigation
   away) leaves a warning toast — never the code. A create that completes after the dialog closed toasts that its code
   cannot be shown.

## 6. Lost answers (no idempotency)

- **Create**: nothing is retried. The dialog says an invitation may exist and its code can't be shown; "Check
  invitations" closes it, and the list reloads. Before sending, the action noted the listed ids and the time; after
  reload, any **new, active invitation created by you since then** is labelled "Possibly created by your previous
  attempt", with a note to revoke it if no code was received. Never presented as a proven match; never revoked
  automatically.
- **Revoke**: nothing is retried (a repeat would be `404` anyway). "Check status" reloads the list.
- **Try again** only where nothing was applied: create `409 conflict` and `503` (both verify again). A rate limit says
  "Try again later" without a countdown.

## 7. Revoke (artboard 4)

A destructive confirmation (`alertdialog`, focus on Cancel): the code stops working at once; anyone who already joined
keeps access; it can't be undone. Then "Confirm it's you" for `admin_invitation.revoke`, pending, and on `204` a toast,
the list reloaded and focus on the card heading. A `404` reads "can't be revoked: it may already be used or revoked, or
your access changed" and the list reloads.

## 8. Demo world (mock)

- `AdminInvitationRecord` holds Core's list fields plus `revokedBy`; **never a code or a contact**. Seven active
  invitations (unchanged counts) and, at École Horizon, one used, one revoked and one expired.
- `invitationStatusOf` (Core's precedence) and `activeAdminInvitationsOf` feed every count (Organization detail, Platform
  dashboard, Company Overview): "awaiting acceptance" means active.
- Commands `createAdminInvitation` / `revokeAdminInvitation` through `DemoWorld.commit`, with simulated
  `admin_invitation.created` / `.revoked` activity (replacing the earlier, misleading `admin_invitation.sent`).
- The mock gateway: Core's order, the shared throttle, the step-up checked before and spent only on commit (rolled back
  otherwise), factor binding (no secret key for invitation purposes), and scenarios `outcomeUnknown`, `collision`,
  `rateLimited`, `unavailable`. The code is generated per answer with `crypto.getRandomValues` and stored nowhere.

## 9. Not built

Organization-admin sign-in to Admin, invitation redemption, email/SMS delivery (Core has none), membership changes,
admin-rights removal, lifecycle, finance, an HTTP adapter, production invitation management, the passkey step-up path in
the dialogs (TOTP only; the gateway accepts both).
