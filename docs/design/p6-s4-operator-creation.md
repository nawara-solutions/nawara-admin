# P6-S4 — Create an operator and confirm their contact

- **Status:** design approved 2026-10-24 (decisions D1–D8); **implemented** 2026-10-24 as a development-only mock
  prototype. No Core HTTP integration; production does not offer it.
- **Baselines:** Admin `main` `579c539` (P6-S3, PR #33). Core contract from P6-S0 at `origin/main` `750eb21`; Core was
  not read again.
- **Canvas:** https://claude.ai/artifact/5ZmmnGF6d95DMs7qaH3pKk (11 artboards; private, may expire). This text prevails.
- Overall P6 design: [`p6-operators-and-access.md`](p6-operators-and-access.md). Contact confirmation itself is the A4-S3
  journey, unchanged.

## 1. Owner decisions (approved)

- **D1** An operator the owner created is resolved from the canonical demo world at demo sign-in and confirmation (the
  sign-in mock previously knew only its static fixtures).
- **D2** Every new operator starts with **zero** Platform assignments; access is given afterwards, as its own verified
  change (P6-S2). The creation never assigns.
- **D3** The temporary confirmation code stays in `DemoAuthState` and is shown only where the demo sign-in page already
  lists the demo confirmation code. Never in the world, a URL, storage, a log, a toast or the activity.
- **D4** One Company-level `operator.created` activity, subject the new operator's id, no contact.
- **D5** A lost answer is reconciled against the demo directory; the creation is never resent automatically.
- **D6** The existing `OperatorAccountGateway` gains `create`.
- **D7** The existing authenticator-code step-up UI (no shared factor chooser in this slice).
- **D8** After success, the new operator's page opens with the next steps: confirmation, then Platform access.

## 2. Core contract (verified, P6-S0) → Admin

| Core | Admin | Failure |
|---|---|---|
| `POST /auth/admin/operators` `{email}` or `{phone}` (exactly one), `X-Step-Up-Token` (`operator.create`) → `201 {id, email, phone, isActive}` | `OperatorAccountGateway.create(contact, { stepUpToken })` | — |
| `400` (malformed, or not exactly one) | | `validation` → the form |
| `403 forbidden` (not the owner) | | `refused` (never offered) |
| `403 step_up_required` | | `verificationRefused` → verify again |
| `409 account_already_exists` (any account kind: member, owner, operator) | | the form, neutral copy |
| `500`, network loss | | `outcomeUnknown` → reload the demo directory |
| `503` | | `unavailable` → explicit retry (verifies again) |

Core normalizes the contact (email lower-cased, phone without formatting), keeps one email and one phone unique across
every account, issues a one-time confirmation code to the contact (8 h by default, never reissued: CF-16), creates no
assignment, and accepts TOTP, a passkey or the secret key for the step-up. **No idempotency key** and **no owner read**
of operators (CF-03, CF-32): Admin cannot reconcile a lost creation with Core.

## 3. Lifecycle

```text
          create (owner, step-up)                 confirm (204)
 (none) ─────────────────────────▶ awaitingConfirmation ─────────────▶ canSignIn
                                       │ block                           │ block ▲ unblock
                                       ▼                                 ▼       │
                                  blocked, code cancelled for good     blocked ──┘
                                       │ unblock (confirms nothing, issues nothing: CF-16)
                                       ▼
                                  awaitingConfirmation with no live code (no recovery in Admin or Core)
```

Platform access is a separate axis: a confirmed operator with no assignment signs in to "No administrative access".

## 4. Security and consistency

- **Owner only**, in four places: capability `operator.create`, the action context, the mock (`401` without a session,
  `403` for anyone but the owner), and inside `createOperator` (`403` for an operator, an anonymous caller or an owner
  of another Company).
- **Step-up:** purpose `operator.create` (TOTP, WebAuthn, secret key in `DEMO_STEP_UP_METHODS`); the mock CHECKS it,
  commits, and only then spends it. `400`, `409`, the audit-failure `500` and `503` leave it unspent (Admin forgets it
  all the same: a retry verifies again). A spent grant is refused.
- **Uniqueness:** `createOperator` compares normalized `contactKey`s (`email:` / `phone:` values, never labels) against
  the world's operators and members AND a snapshot of every sign-in fixture's contact (`DEMO_SIGN_IN_CONTACT_KEYS`:
  owner and scenario owners, member, every operator account), passed in by the mock so the command stays pure. A
  conflict is exactly `409 account_already_exists`; the copy says "already used by a Nawara account", never which kind
  (CF-33).
- **World versus sign-in state:** the command writes one `operator` identity, one profile (unconfirmed, not blocked) and
  one activity. The mock then calls `DemoAuthState.issueConfirmationCode(id)`; attempts live there, the code value is the
  fixed demo code.
- **Sign-in:** `MockAuthGateway.operator()` looks up the fixtures first, then the world's operators that no fixture signs
  in as; a created operator signs in under its world id with the normal scenario. Any other identifier finds nothing.
  Confirmation writes `contactConfirmedAt` to the world (as for staff). Unconfirmed: no working code.
- **Block:** `endOperatorSignIn` now also clears codes keyed by the operator's own id, so blocking a created operator
  cancels their working and confirmation codes and ends their session; unblock restores neither and confirms nothing.
- **Privacy:** contacts appear in the dialog and the operator's page only; toasts, URLs (ids only), navigation state (id
  only), activity and logs never carry them.

## 5. As built

- **Command** `createOperator` (+ `contactKey`, `worldContactKeys`, `createdOperatorId`: UUID-shaped, from the world's
  sequence, never a seed id).
- **Mock** `MockOperatorAccountGateway.create`, reusing `OPERATOR_ACCOUNT_DEMO_SCENARIO`: `normal`; `outcomeUnknown`
  (commits, code issued, answer lost); `auditFailure` (`500`, nothing committed or spent); `unavailable` (`503`).
  Production binds `UnavailableOperatorAccountGateway`, so the directory never offers the action.
- **Action** `OperatorCreateAction` on the directory route: one `ActionRun` with step-up; on success the views reload,
  a contact-free toast, and the new operator's page with navigation state `createdOperatorId`. After `outcomeUnknown` it
  reads the directory again and searches for the normalized contact: **found** → "An operator with this contact now
  exists" (without claiming the lost request created it) and "Open the operator"; **not found** → still uncertain,
  explicit "Try again" (verifies again); **unchecked** → "Check again".
- **Dialog** `OperatorCreateDialog`: email / phone radios (switching clears the value), sign-in-compatible validation
  with field errors, facts (verification next, confirmation, no Platform, recorded), demo chip; verification with the
  normalized contact named; pending cannot be dismissed; one creation however often it is pressed.
- **Detail page:** "Operator created. Next steps" (code sent by Core, confirmation at sign-in, give Platform access; the
  code expires and cannot be resent; demo note) shown only when opened with that state; "Contact to confirm" badge;
  "No current Platform access".
- **Company Overview:** "Operator created", labelled "Company".
- **Production check:** created-operator id prefix added to the markers.

## 6. Tests and acceptance

- Command: one unconfirmed operator, zero assignments, no membership; one Company-level activity without contact;
  normalization; `400` shapes and kind mismatches; distinct UUID ids; `403` for operators, anonymous and a foreign
  owner; `409` for operator, member, reserved fixture and earlier-created contacts.
- Mock: step-up single use and purpose/user bound, spent only on commit; `409` across every account kind with the
  step-up unspent; `500` / `503` commit nothing; lost answer commits once and a resend is `409`; unavailable adapter.
- Sign-in: created operator unconfirmed → no working code; wrong confirmation code counted; confirmation writes the
  world; working-code sign-in; grants empty; formatted phone; arbitrary contacts never authenticate; blocked before
  confirmation → code cancelled for good, unblock confirms nothing; blocked after confirmation → unused working code
  cancelled and still invalid after unblock, a new one works; block ends the session.
- Pages: offered to the owner only, not without the mock; validation and focus; normalized creation, navigation and
  next steps; phone; one call under repeated presses; wrong code sends nothing; duplicate form; lost answer found /
  not found; `503` retry.
- Browser (development server): see the PR report.

## 7. Limitations and follow-ups

- **CF-03** no owner directory or read: production cannot show, find or reconcile a created operator, so it does not
  offer creation.
- **CF-16** confirmation-code resend / recovery: an expired, exhausted or block-cancelled code strands the operator.
- **CF-32** lost-create reconciliation: an idempotent create (replaying the first answer) or an authorized lookup by
  contact is needed before an HTTP adapter.
- **CF-33** duplicate-contact disclosure to the owner (Admin's copy is neutral).
- **CF-35** authoritative account-state answers.
- Shared step-up factor chooser (passkey, secret key): a separate work item.
