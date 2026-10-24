# P6-S3 — Block and unblock an operator

- **Status:** design approved 2026-10-24 (decisions D1–D6); **implemented** 2026-10-24 as a development-only mock
  prototype. No Core HTTP integration.
- **Baselines:** Admin `main` `310138e` (P6-S2b, PR #32). Core contract from P6-S0 at `origin/main` `750eb21`; Core was
  not read again.
- **Canvas:** https://claude.ai/artifact/4W3BVwECUX2M9ZfGCvTPr2 (10 artboards; private, may expire). This text prevails.
- Overall P6 design: [`p6-operators-and-access.md`](p6-operators-and-access.md).

## 1. Owner decisions (approved)

- **D1** Unconfirmed operators may be blocked, with a prominent warning: blocking cancels the confirmation code and,
  until Core supports confirmation-code recovery (CF-16), unblocking gives no way to complete confirmation. No resend.
- **D2** After a lost or unconfirmed answer, an explicit, user-initiated repeat ("Block again" / "Unblock again", or "Try
  again" when the reload shows the old state), with the warning that the earlier request may have applied and that Core
  records every request. Never automatic.
- **D3** Company-level `operator.blocked` / `operator.unblocked` activity, with no Platform (`platformId: null`), in the
  Company Overview feed only.
- **D4** A protected read's genuine `401` triggers the P6-S2b grants refresh; the refresh's own `401` ends the session.
- **D5** All Platform assignments are kept on block, shown as ineffective while blocked; the owner may still remove them.
- **D6** Assignment-record counts are unchanged by a block; effective access is a separate fact (active account AND an
  active assignment).

## 2. Core contract (verified, P6-S0) → Admin

| Core | Admin | Failure |
|---|---|---|
| `POST /auth/admin/operators/:id/block` → `204` | `OperatorAccountGateway.block(operator)` | — |
| `POST /auth/admin/operators/:id/unblock` → `204` | `.unblock(operator)` | — |
| `403 forbidden` (not the owner) | | `refused` (never offered) |
| `404` collapsed (unknown / other Company) | | `refused` → reload ("no longer one of your operators") |
| `401` | | `refused`; session-ended path |
| `500` (an audit-write failure rolls back; Admin cannot tell it from another `500`) | | `outcomeUnknown` → reload; never "definitely failed" |
| `503`, network loss | | `unavailable` / `outcomeUnknown` → reload |

No body, no step-up, no idempotency key; a repeat answers `204` and writes another audit record. Block: inactive, every
session revoked, every unused code (working and confirmation) cancelled, assignments kept. Unblock: active; sessions and
codes are not restored; never confirms. A `204` carries no state, and **Core has no owner read of the account state**
(CF-03): the state Admin shows is the demo world's.

## 3. Security and consistency

- **Owner only**, in four places: capability `operator.account.block`, the action context, the mock (`403` for an
  operator, their own record included; `401` without a session), and inside `setOperatorBlocked` (`403`; `404`
  outside the Company).
- **Effective authority:** `platformViewerOf` now requires an ACTIVE account AND an active assignment (Core's
  `DENY_ACCOUNT_INACTIVE`); every demo mock that checks Platform access uses it. The owner is unaffected.
- **Codes:** the block mock calls `DemoAuthState.endOperatorSignIn(operator)`: the operator's live working code and
  confirmation code are deleted (sign-in state stays out of the world). Unblock restores nothing: a pre-block code is
  refused; a new working code works; a cancelled confirmation code stays cancelled.
- **Sessions:** the same call ends the simulated session if it is the operator's. A signed-in blocked operator's next
  protected read is refused (`401`); `reportsRefusal` now reports `401` too, so P6-S2b re-reads the grants, which answer
  `401` (the mock refuses a blocked operator), and only that ends the local session. A Platform `404` / `403`, a
  network failure or a `503` never ends a session.
- **No step-up:** Core asks none for this emergency control. **Residual risk:** a stolen owner session can block every
  operator, or unblock one. Admin adds no verification the contract does not require.

## 4. As built

- **Command** `setOperatorBlocked` (`blockOperator` / `unblockOperator`): only the target account's `blocked` flag
  changes (and only if it differs); every committed call records one Company-level activity (`subjectId`: the
  operator's id, never a contact), as Core audits every call; assignments, contacts, confirmation, memberships,
  organization-admin flags and commercial records untouched.
- **Activity model:** `ActivityRecord = PlatformActivityRecord | CompanyActivityRecord`; Platform and Organization feeds
  read Platform records only; the Company Overview shows Company-level ones labelled "Company".
- **Mock** `MockOperatorAccountGateway`; scenarios `normal`, `outcomeUnknown` (commits, answer lost), `auditFailure`
  (`500`, nothing committed), `unavailable` (`503`, nothing committed). Production binds the unavailable adapter.
- **Action** `OperatorBlockAction` (one `ActionRun`, no step-up): success reloads every view; failures that may hide a
  change reload the operator (in place) and wait for an answer newer than the failure.
- **Dialog** `OperatorBlockDialog`: block is an alertdialog with focus on Cancel; unblock a dialog with focus on its
  confirmation; the CF-16 warning for unconfirmed operators; the demo-state note; the Core-cannot-re-read note and the
  duplicate-audit warning after an uncertain outcome.
- **Page:** "Block account…" / "Unblock account…" in the Account card; a blocked banner; assignments under "Platform
  access (kept while blocked)" with "Inactive while blocked"; "Remove access…" kept; the directory row notes "Not
  effective while blocked".

## 5. Tests and acceptance

- Commands: block/unblock, repeats (no account change, one more activity), never confirms, owner-only (`403`),
  Company isolation (`404`), untouched tables, Company-level activity only in the Company feed, effective access versus
  record counts.
- Mock: no step-up; `403` / `401` / `404`; a pre-block working code refused after unblock and a new one accepted; the
  confirmation code cancelled for good; the operator's own session ended, no other; `500` and `503` commit nothing; a
  lost answer commits.
- Pages: alertdialog and focus; explanations; CF-16 warning only for unconfirmed operators; no resend anywhere; blocked
  state with kept, ineffective assignments and "Remove access…"; unblock; lost answer → demo state, Core note, explicit
  "Block again" (no automatic second call); `500` → "still not blocked", "Try again"; operators never offered.
- P6-S2b: blocked mid-session → grants `401` ends the session; a refused read after the block → `401` → grants `401` →
  sign-in; a Platform `404` alone keeps the session.
- Browser (development server): EN/FR/AR, RTL, light/dark/system, 1440/834/390/320, keyboard; a blocked operator's
  sign-in refused and an unblocked one signing in with a new code (same tab, sign-out in between); a signed-in operator
  blocked through the development-mode debug handle → session ended.

## 6. Limitations and follow-ups

- **Single-session demo:** one session per tab; the owner and the operator are never signed in together. The
  signed-in-operator case is exercised by specs and, in the browser, through Angular's development-mode debug handle.
- **CF-03** no owner read of the operator account state (the shown state is demo data).
- **CF-16** confirmation-code recovery and resend.
- **CF-35 (proposed)** an authoritative account-state answer or read for block / unblock, so a lost answer can be
  reconciled with Core.
