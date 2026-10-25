# P9-S4 — Owner account security

- **Status:** P9-S4-0 read-only Core verification complete (2026-10-25). **P9-S4a implemented** 2026-10-25: the
  owner's read-only Security overview (`/settings/security`, §9; PR #45, merged). **P9-S4b implemented** 2026-10-25 as
  a mock-first prototype: adding an authenticator app (`/settings/security/add-authenticator`, §10; PR #46, merged).
  **P9-S4c implemented** 2026-10-25 as a mock-first prototype: creating a new secret key
  (`/settings/security/secret-key`, §11). Production binds the unavailable adapters and real Auth integration is NOT
  done. **P9-S4d and P9-S4e are planned, each separately authorized**; nothing here changes a password or a recovery,
  or removes a factor.
- **Baseline:** Core `origin/main` `304064f` (equal to the remote; read with `git show`, nothing checked out); Admin
  `main` `bb4c968`. Parent design: [`p9-settings-architecture.md`](p9-settings-architecture.md).
- **Canvas:** https://claude.ai/artifact/N9MpMwvtasDCwZ76puVPtz (private, may expire). S4b design canvas (three
  artboards, approved with the refinements in §10): https://claude.ai/artifact/Hq8PCY1XBUnuXsJpFfLzuV. This text
  prevails.
- **Sources read (Core, `apps/auth-service/`):** `src/owner/{owner.controller, dto, factor.service, enrollment.service,
  step-up.service, secret-key.service, recovery.service, webauthn.service}.ts`, `src/auth/auth.guard.ts`,
  `src/tokens/refresh-token.service.ts`, `src/crypto/password.ts`, `src/config/app-config.ts`, `src/errors.ts`;
  tests `test/{step-up, owner-auth, recovery, secrets, audit-actions}.e2e-spec.ts`; docs `docs/sdd/auth-service.md`,
  `docs/add/auth-service.md`, ADR-0010, ADR-0016, ADR-0025. No credential, environment secret, key or production
  record was read; no endpoint was called.
- **S4c design canvas** (six artboards, approved with the safeguards in §11):
  https://claude.ai/artifact/Hp428HCUtBR2TRhQrNATgq (private, may expire). This text prevails.

## 1. What Core supports (verified) versus what Admin implements

| Capability | Core (verified, `304064f`) | Admin |
|---|---|---|
| List the owner's factors | ✅ `GET /auth/admin/factors` | ✅ **P9-S4a**, read only (demo mock; production "not available") |
| Add an authenticator app | ✅ `POST factors/totp`, `factors/totp/confirm` + step-up | ✅ **P9-S4b**, mock-first (§10; production "not available") |
| Add a passkey | ✅ `POST factors/webauthn/options`, `factors/webauthn` + step-up; origin-bound | ⏳ later (needs a WebAuthn registration client, the real origin) |
| Remove a factor | ✅ `DELETE factors/:id` + step-up; never the last confirmed one | ⏳ P9-S4d |
| Rotate the secret key | ✅ `POST secret-key/rotate` + step-up; returned once | ✅ **P9-S4c**, mock-first, "Create a new secret key" (§11; production "not available") |
| Change the password | ✅ `POST password/change` + step-up; other sessions end | ⏳ P9-S4e |
| Step-up for these | ✅ `POST step-up`, `step-up/webauthn-options`; four `owner.*` purposes, factor only | existing `StepUpGateway` (TOTP only in dialogs); purposes added with S4b–S4e |
| Recovery | ✅ `recovery/start`, `complete` (public), `cancel` (owner) | sign-in shows it deferred; no Settings action |
| Secret-key status, factor names, pending-recovery read, sessions list, change alerts | ❌ none | not shown (CF-54 to CF-59, CF-51) |

## 2. Verified contract matrix

All routes under `/auth/admin`, `@Actors('owner')`: a live owner session (the guard reloads the user and the session on
every request); anyone else `403 forbidden`, no session `401 unauthenticated`. Every refusal carries a stable `code`.

| Capability | Route | Request | Response | Step-up | Errors (`code`) | Effects, audit | Retry, risk |
|---|---|---|---|---|---|---|---|
| List factors | `GET factors` | — | `[{id, type: totp\|webauthn, confirmed, createdAt, lastUsedAt\|null}]` | none | 401, 403 | read only; no audit. No label. A pending TOTP has `confirmed: false` | safe to re-read: the reconciliation source |
| Add TOTP: begin | `POST factors/totp` | — | `{factorId, secret, otpauthUri}` | none | 429 `rate_limited` (10/hour) | an UNCONFIRMED factor; replaces an earlier unconfirmed TOTP | the secret is shown once; a second begin voids the first |
| Add TOTP: confirm | `POST factors/totp/confirm` | `{factorId: uuid, code: 6 digits}` | 200, empty | `owner.factor.enroll` (totp, webauthn); always required for a signed-in owner | 400 `validation_error`, 400 `verification_failed`, 403 `step_up_required`, 429 | confirmed; audit `owner.factor.enrolled` + central `owner.factor_enrolled`; no session change; no alert event | a wrong code rolls back: the step-up is not spent; lost answer: re-list |
| Add passkey | `POST factors/webauthn/options`, `POST factors/webauthn` | `{challengeId, response}` | `{challengeId, options}`; 200 empty | `owner.factor.enroll` | 400 `verification_failed`, 409 `factor_already_registered`, 403, 429 | UV required, attestation none, resident key preferred; challenge 600 s, session-bound | only on the configured origin (prod `admin.nawara-solutions.com`, RP `nawara-solutions.com`) |
| Remove factor | `DELETE factors/:id` | — | 204 | `owner.factor.remove`, factor only, header required | 400 (bad uuid), 403 `step_up_required`, 404 `not_found`, 409 `factor_required` | revoked; pending enrollment tokens killed; audit local + central; sessions untouched; no alert | a refusal rolls back. Core keeps ≥ 1 confirmed factor, not ≥ 1 usable one |
| Step-up | `POST step-up`, `POST step-up/webauthn-options` | `{purpose, method: secret_key\|totp\|webauthn, code?\|secretKey?\|challengeId+assertion?}` | `{stepUpToken, expiresAt}` | — | 400 `step_up_unsupported`, 401 `verification_failed` (audited), 400 `factor_unavailable`, 429 (10 / 5 min per owner, 30 / 5 min per IP) | single use, this session and purpose; TTL 300 s default (≤ 900) | never stored; a retry verifies again |
| Rotate secret key | `POST secret-key/rotate` | — | `{secretKey: 13 groups of 4, issuedAt}` | `owner.secret_key.rotate`, factor only | 403, 401 | the old key dies at once; audit local + central; no alert event; no session change | **not idempotent**; a lost answer leaves no usable key, and nothing reads whether one exists |
| Change password | `POST password/change` | `{newPassword: 10–72 chars, ≤ 72 bytes, no NUL}` | 204 | `owner.password.change`, factor only. **No current password** | 400 `validation_error` (before the step-up is spent), 403 | every OTHER session ends at its next request; audit local + central; no alert | forgetting the new password also blocks recovery |
| Recovery | `POST recovery/start`, `complete` (public); `recovery/cancel` (owner) | `{email\|phone, password, secretKey}`; `{recoveryToken, secretKey}` | 202 `{recoveryToken, availableAt}`; 200 `{status: enrollment_required, enrollmentToken}`; 204 | — | 401 `recovery_failed`, 403 `recovery_not_available`, 429 | cool-down 24 h default; complete revokes every factor and session and spends the key; start and complete emit alert events | a sign-in flow; cancel is blind (no read of a pending request) |

**Drift and uncertainty.** The SDD and ADD say rotation publishes `admin.secret_key_rotated`; the source emits no event
for rotation, password change or factor changes (audit only). The SDD says the key is stored as SHA-256; the source
uses HMAC-SHA-256 with a pepper (no Admin impact). The SDD's `factors/*` with an enrollment token is CF-21. Response
bodies have no declared OpenAPI schema (shapes from the source). A bootstrapped owner has no secret key until the first
rotation (ADR-0016), and no read tells. TTLs and throttles are deployment configuration (defaults shown).

## 3. Risks

| Risk | Severity | Mitigation (Core stays the authority) |
|---|---|---|
| No secret key ever issued → no recovery path, and no read tells | high | say recovery needs a key; offer rotation early (S4c); CF-54 |
| A rotation answer lost, or the tab closed before saving | high | copy-and-confirm, memory only, cleared on navigation and sign-out; never resent; generate again |
| Removing a factor leaves only an unusable one | high | destructive confirmation naming type, added, last used; warn below two; Core refuses the last (409) |
| Password change without the current password; a forgotten password blocks recovery | medium | enter twice, show the policy, say other sessions end; CF-57 |
| No alert for key, password or factor changes | medium | CF-55 |
| Rate limits (step-up, enrollment) | medium | `429` → wait, never retry automatically |
| A one-time secret in storage, a URL, a log or a toast | high | memory only; specs spy on storage and the router; production unavailable |
| Demo security mistaken for real protection | medium | "Demo data" on every demo view; production "not available" |

## 4. Admin compatibility

- **Reuse:** `ActionRun`; `StepUpGateway.obtain(purpose, proof)` and its mock; `FactorProof` (totp | passkey) fits the
  factor-only purposes; `action-failure` mapping by code; the copy-once pattern of admin invitation codes; `uqr`.
- **Extend:** `StepUpPurpose` and `DEMO_STEP_UP_METHODS` gain the four `owner.*` purposes (factor only) with S4b–S4e;
  `DemoAuthState` holds the owner's simulated factors (done in S4a, §9).
- **New:** `AccountSecurityGateway` (S4a: `load()`; S4b: `beginTotp()`, `confirmTotp()`; later commands, each in its
  slice); the shared `nw-totp-setup` extracted from the sign-in enrollment page (S4b).
- **Missing:** WebAuthn registration (`WebAuthnClient` only asserts); a shared factor chooser.

## 5. Order (each separately authorized)

1. **S4a** ✅ read-only overview (§9).
2. **S4b** ✅ add an authenticator app (§10).
3. **S4c** ✅ create a new secret key, the first or a replacement (§11).
4. **S4d** remove a factor.
5. **S4e** change the password.
6. Later: passkey registration; a shared factor chooser; a blind "cancel a pending recovery" if decided.

All mock-first; production binds the unavailable adapter until the auth HTTP adapter exists (A4) and the session model is
decided (D-A4, CF-01).

## 6. Acceptance (each slice)

Unit: mock semantics per code; purposes and allowed methods; step-up spent once and not on refusal; the last-factor
`409`; a key shown once then cleared; no secret in storage, URL, history or log; no automatic resend; operators refused.
Browser: keyboard and focus through confirm → verify → result; screen-reader names; copy-and-confirm; RTL; dark; 320 px;
owner and operator direct URLs.

## 7. Proposed Core follow-ups (CORE-INTEGRATION §9)

CF-54 secret-key status read · CF-55 alerts for credential changes (or corrected docs) · CF-56 factor labels · CF-57
forgotten-password path · CF-58 pending-recovery read · CF-59 declared OpenAPI response schemas · CF-60 two-phase
secret-key rotation (P9-S4c) · CF-61 rotation while a recovery is pending (P9-S4c). Related, open: CF-21, CF-51,
CF-01 / D-A4, CF-07.

## 8. Owner decisions before S4b–S4e

Slice order; production unavailable until A4; `/settings/security` owner only (operators: `/forbidden`, decided in
S4a); secret-key confirmation (checkbox or typing the last group); factor removal (warn or refuse below two); password
change (twice; keep or end this session); a blind recovery cancel; passkeys and a factor chooser inside S4 or separate.

## 9. P9-S4a implementation (2026-10-25)

- **Route:** `/settings/security` (title `titles.settingsSecurity`, parent crumb "Settings"), the owner only: the new
  capability `account.security.view` guards the route (an operator, assigned or not, gets `/forbidden`; signed out,
  the shell's session guard); the hub shows "Security" in its Account section to the owner only; the facade calls no
  gateway for anyone else; the mock refuses anyone but an owner (`403`; no session `401`). No identity parameter: the
  gateway reads the signed-in owner's own factors, as Core's bearer-scoped route does.
- **Data provenance:** `AccountSecurityGateway.load()` → `{ factors: [{ id, type, confirmed, createdAt, lastUsedAt }] }`,
  Core's factor list shape. Demo builds bind `MockAccountSecurityGateway`, reading `DemoAuthState.ownerFactors` (never
  the demo world), extended minimally: the fixture owners' confirmed factors as their sign-in already implies (the demo
  owner offers TOTP and passkey, so one of each), with `createdAt` and `lastUsedAt` `null` (they predate the demo; no
  time is invented); a sign-in or a step-up sets the proving factor's `lastUsedAt`; first-factor enrollment records its
  begin and confirm times, and a begun setup is an unconfirmed factor (one at most, like Core). No seed, code, name, key
  or grant is stored there. Every other build binds `UnavailableAccountSecurityGateway`: "Security is not available".
- **Shown:** the confirmed count; each factor's type (authenticator app, passkey), "Confirmed" or "Setup not finished"
  (with a note that an unfinished setup cannot be used), "Added" only when known, "Last used" or "No use recorded";
  how factors protect sign-in and sensitive actions, that the last confirmed factor cannot be removed under Core's
  current rules; that a confirmed factor does not guarantee recovery, that a secret key may exist but Admin cannot
  check, and what recovery involves (password, secret key, a waiting period, a new factor; it ends every factor and
  session); and what is not available on this page (factors, the key, the password, recovery). No button, link, form or
  disabled control; no promise of recovery or lockout prevention.
- **Entry points:** the hub's Account section (owner); the Company Overview's "Account security" link (formerly a
  disabled, unbuilt destination).
- **States:** loading, ready, empty (no factor recorded), not in this build, error with "Try again", forbidden.
- **Tests:** `account-security.routes.spec.ts`; `account-security.mock.spec.ts` (owner's fixture factors with no time,
  only Core's fields, no secret, a copy, every operator `403`, no session `401`, another owner's isolation, error
  scenario, sign-in and step-up last use, unfinished setup kept once, enrollment times);
  `account-security.page.spec.ts` (factors and states, unfinished distinguished, guidance without promises, no control,
  no secret or request, operator refused without a gateway call, production not available, empty, Try again, Arabic
  RTL); `access-summary.spec.ts` (the Overview link); hub, routes and capability specs updated; the demo-binding fixtures
  gained the one `accountSecurity: []` line their type requires.

## 10. P9-S4b implementation (2026-10-25)

Mock-first: demo builds bind the mocks over `DemoAuthState`; every other build binds the unavailable adapters, so the
page says "Adding an authenticator is not available" and no setup begins. **Real Auth integration is not done** (no
HTTP adapter; A4, D-A4, CF-01). Core was not read again: the contract is §2's (Core `304064f`).

**Owner decisions:** D1 a dedicated page `/settings/security/add-authenticator`; D2 the new app's code before "confirm
it's you"; D3 reuse a grant only after a definite refusal, while Core's rollback applies and it is still valid; D4
authenticator-code step-up only (no passkey alternative is offered); D5 Cancel discards the local setup and deletes no
Core enrollment; D6 no maximum number of authenticators; D7 on success back to Security, the list reloaded, a notice;
D8 a shared TOTP setup component.

**Authorization.** New owner capability `account.factor.add`: the add route's own guard (operator → `/forbidden`; signed
out → the shell's session guard), the Security page's action (owner only), the facade (starts nothing for anyone else),
the mocks (`401` without a session, `403` to anyone but an owner). The grant is checked by the mock for the owner it was
issued to and the purpose `owner.factor.enroll` (TOTP or passkey proof, never the secret key), and spent only when the
factor is confirmed.

**Entry.** The Security page's factor card offers "Add an authenticator app" (a link) when a confirmed authenticator
exists. A passkey-only owner sees it disabled, described by the reason (S4b proves the step-up with an authenticator code
only; passkey proof needs the factor chooser, a separate future slice). The add page checks the list again before it
begins anything (a direct URL), and explains instead of beginning.

**State machine** (`AddAuthenticatorFacade`, page-scoped; not `ActionRun`, see ARCHITECTURE §12):

| State | Shows | Next |
|---|---|---|
| `idle` | nothing (before start; after destroy) | `checking` when the page is entered |
| `checking` | setup being prepared | `beginning` (a confirmed TOTP exists) · `noAuthenticator` · `beginFailed` · `refused` · `notInBuild` |
| `beginning` | setup being prepared | `setup` · `beginFailed` (`429` → rateLimited, else unavailable; manual "Try again" only) |
| `setup` | QR, key (copy on request), the NEW app's code | `validating` on Continue · `cancelled` |
| `validating` | (synchronous) the code's shape: six digits | `confirming` with a reusable grant · else `verifying` |
| `verifying` | "Confirm it's you" with an authenticator you already use | `confirming` with a grant · stays on `401` (proof refused) · `rateLimited` · `setup` (Back) |
| `confirming` | everything locked | `succeeded` · `codeRefused` · `verifying` (`403 step_up_required`, same new code) · `rateLimited` · `setup` (`503`, nothing applied) · `reconciling` (no answer) · `refused` (other `403`, `401`) |
| `codeRefused` | the code step with a refusal; whether the grant was kept | `confirming` directly while the grant is reusable; else `verifying` |
| `reconciling` | "Checking whether your authenticator was added" | confirmed → `succeeded`; unconfirmed → `notConfirmed`; missing → `replaced`; unreadable → `unknown` |
| `notConfirmed` | the code step: not added yet, still waiting for a code (never "failed") | `verifying` (the grant was dropped) |
| `replaced` | this setup no longer exists | `beginning` on "Start again" |
| `rateLimited` | too many attempts; nothing retried | `setup` on "Back to the code" |
| `unknown` | the outcome is unknown and the list unreadable | `reconciling` on "Check again" (never a resend) |
| `succeeded` / `cancelled` | back on Security (`replaceUrl`), a notice | — |
| `refused` / `notInBuild` / `noAuthenticator` | one message, "Back to Security" | — |

**Retry and reconciliation rules.** One request at a time; a second submit, proof, start or cancel while busy is
ignored. A confirmation is never resent automatically. `400 verification_failed` and `400 validation_error` are
definite refusals (Core rolls back; the grant is unspent): never treated as an unknown outcome. A `verification_failed`
is explained with one list read: still unconfirmed → a wrong code; missing → replaced (another tab began a newer setup);
confirmed → added (a duplicate). An unreadable list there keeps the definite refusal. The grant is reused only for the
same owner and session and with more than 15 s left (`GRANT_REUSE_MARGIN_MS`); after any other failure, a lost answer
included, it is dropped and the owner confirms again. `429` (begin and confirm share Core's 10-per-hour budget, step-ups
their own) stops; nothing retries by itself.

**Data ownership.**

| Item | Lives | Never |
|---|---|---|
| setup key, `otpauth` URI (and the QR drawn from it) | `AddAuthenticatorFacade` memory, while the page is open | `DemoWorld`, `DemoAuthState`, Settings state, storage, URL, history state, logs, toasts, activity, the factor list |
| the new app's code, the proof code | the field (cleared on every state change) and the one request; the new code also in the facade until sent or refused | kept after the flow |
| step-up grant | the facade, only between a definite refusal and the next confirmation | stored, logged, shown |
| factor metadata (`id, type, confirmed, createdAt, lastUsedAt`) | Core; demo: `DemoAuthState.ownerFactors` | `DemoWorld`; no secret beside it |
| the demo throttle | `DemoAuthState` (request times only) | — |

Disposal: success, cancel, a replaced setup, a session change (sign-out, another identity, or a new session of the same
owner), and the page's destruction (navigation away) clear the key, the codes and the grant; late answers are ignored.

**Demo semantics.** The setup key is the fixed fictional `DEMO_TOTP_SECRET`. The new app's code is
`DEMO_NEW_AUTHENTICATOR_CODE` (246810); the existing factor's step-up code stays `DEMO_TOTP_CODE` (123456), so the two
verifications are distinct: the existing factor's code is refused as the new app's. Scenarios: `confirmLost` (applied,
answer lost), `confirmUnavailable` (`503`), `error` (the list unreadable).

**Not done (out of scope):** factor removal (S4d), passkey registration, a shared step-up factor chooser (passkey or
secret key proof), secret-key generation or rotation (S4c), password change (S4e), recovery cancellation, real Core HTTP
integration, deleting an unfinished setup (no Core API). Adding a factor guarantees no recovery path: the notice says so.

**Tests.** `add-authenticator.facade.spec.ts` (every transition; grant validity, owner and session binding, expiry
margin; definite refusal vs unknown; never resent; duplicates; concurrent-tab replacement; cancel; sign-out, another
owner, the same owner's new session; destruction; `429`; production); `add-authenticator.page.spec.ts` (end to end with
the mocks; wrong code then right code with one proof; code format; passkey-only; operator; production adapters; cancel;
destruction; lost answer; throttled begin; no secret in storage, history, router URL or console; Arabic RTL);
`account-security.mock.spec.ts` (begin replaces only an unconfirmed TOTP; confirmed factors untouched; grant purpose,
owner, expiry and method; `400` rollback; `validation_error` first; throttle; lost and unavailable scenarios; no secret
with the records); `account-security.page.spec.ts` (the action, the passkey-only explanation, the notice);
`account-security.routes.spec.ts` (the add route's guard, title, breadcrumb; production adapters); `totp-setup.spec.ts`;
the sign-in `enroll.page.spec.ts` unchanged in behaviour (selectors follow the extracted component's BEM block).

## 11. P9-S4c implementation (2026-10-25)

Mock-first: demo builds bind the mocks over `DemoAuthState`; every other build binds the unavailable adapters, so the
page says "Creating a secret key is not available" and nothing is verified or sent. **Real Auth integration is not done**
(no HTTP adapter; A4, D-A4, CF-01). Core was not read again: the contract is §2's (Core `304064f`).

**Contract compatibility (verified in §2 unless marked).** Owner only ✅. Step-up `owner.secret_key.rotate`, factor only
(TOTP or passkey, never the secret key) ✅. The key is returned once, as `{secretKey: 13 groups of 4, issuedAt}` ✅. The
previous key dies at once on commit ✅. Not idempotent: every call makes another key ✅. Core keeps only a keyed hash, so
nothing can show the key again ✅. No read says whether a key exists (CF-54) ✅. The first key and a replacement are the
same route ✅. **Unresolved** (handled defensively, CF-59 / CF-61): a throttle on rotate (a `429` is still handled),
when the grant is spent (the design never reuses one), the key's alphabet and separator (any separator and case are
accepted; 13 × 4 letters or digits required), whether a `5xx` can follow a commit (treated as unknown), and what a
rotation does to a pending recovery.

**Owner decisions:** D1 a dedicated page `/settings/security/secret-key`; D2 one neutral action, "Create a new secret key",
whatever exists; D3 an acknowledgement checkbox before anything; D4/D11 (refined) the key **masked first**, with explicit
Reveal, Hide and Copy; D4 (refined) Done needs BOTH a randomly chosen group typed back while the key is hidden AND "I've
saved it"; D5 leave warnings in the app (an alertdialog) and from the browser (`beforeunload`, where supported); D6 Copy
only (no download or print); D7 authenticator-code step-up only (a passkey-only owner is told why); D8 any `5xx`, network
failure, unexpected status or a success without a usable key is unknown; D9 a grant is never reused and every new
attempt starts over; D10 a DEMO-only digest verifier in `DemoAuthState`; D12 CF-60 and CF-61 recorded.

**Authorization.** New owner capability `account.secret_key.rotate`: the route's own guard (operator, assigned or not →
`/forbidden`; signed out → the shell's session guard), the Security page's action (owner only), the facade (starts
nothing for anyone else), the mock (`401` without a session, `403` to anyone but an owner). The mock checks the grant for
the owner it was issued to, the purpose and the proving factor (a secret-key-proved grant is refused), and spends it only
with the change.

**Entry.** The Security page's "Secret key" card says recovery asks for it with the password, that Admin cannot check
whether one exists, and that a new key replaces any key; it offers "Create a new secret key" (a link) when a confirmed
authenticator exists, otherwise disabled with the reason. The page checks the factors again and creates nothing on entry.

**State machine** (`SecretKeyFacade`, page-scoped; not `ActionRun`: its "Try again" resends after an unknown outcome and
it reports a detached answer by toast after the page is left):

| State | Shows | Next |
|---|---|---|
| `idle` | nothing (before entry; after destroy) | `checking` on entry |
| `checking` | checking the account | `intro` (a confirmed authenticator) · `noAuthenticator` · `loadFailed` (manual Try again) · `refused` · `notInBuild` |
| `intro` | what the key is, the irreversible warning, recovery limits, the acknowledgement | `verifying` (acknowledged; Continue is unavailable and described until then) · `cancelled` |
| `verifying` | "Confirm it's you": an authenticator code; `busy` while checked; problem `proofRefused` / `expired` / `unavailable` | `creating` with a grant · stays on `401` · `rateLimited` · `intro` (Back) · `cancelled` |
| `creating` | locked; "don't leave"; after 10 s "still waiting" (never timed out or cancelled) | `shown` · `verifying` (`403 step_up_required`) · `rateLimited` (`429`) · `refused` (`401`, other `403`) · `unknown` (everything else) |
| `shown` | the key, masked; Reveal/Hide, Copy, the group check (only while hidden), "I've saved it" | `checked` (the group matched) · `abandoned` · dropped on a session change |
| `checked` | the group matched; Done once "I've saved it" is ticked | `done` · `abandoned` |
| `rateLimited` | too many attempts; nothing changed or retried | `verifying` (owner's choice) |
| `unknown` | `noAnswer`: "The request may have created a new secret key. Your previous key may no longer work, and Admin cannot retrieve the new one." `incomplete`: a key was created but cannot be shown | `intro` on "Create another key" (a new flow) |
| `done` / `cancelled` / `abandoned` | Security (`replaceUrl`) with a notice: saved / nothing changed / not confirmed as saved, or may have been created | — |
| `refused` / `notInBuild` / `noAuthenticator` / `loadFailed` | one message, "Back to Security" | — |

**Rules.** Nothing is sent before the acknowledgement and the code; each rotation follows one explicit "Create new key"
with the grant obtained for it, which is never kept. One request at a time; a second submit, Back, Cancel or proceed while
busy is ignored. Definite: `401`, `403` (`step_up_required`, `forbidden`) and `429`. Uncertain: no answer, a network
error, any `5xx`, any other status, and a `200` without 13 groups of 4. A rotation is never resent; "Create another key"
starts a completely new flow (warning, acknowledgement, a new grant). The factor list, the session and `DemoAuthState`
are never read to guess an outcome. Late answers (another run, a dropped flow, another session) are ignored. Code and
group fields always show their cleared value after a state change (a value reset together with a fast Enter cannot
leave a refused code in the field).

**The local check.** The group (chosen with `crypto.getRandomValues`) is typed while the key is hidden and compared in
the page only; it is never sent. It shows the owner has a copy now, not that it is stored durably; the page says so.

**Leaving.** While `creating`, `shown` or `checked`: an in-app navigation opens "Leave without saving your new key?"
(an alertdialog, focus on "Stay"); "Leave anyway" drops the key and Security says it may be lost. Closing or reloading
the tab triggers the browser's own `beforeunload` prompt where the browser shows one; a browser or system shutdown
cannot be prevented and nothing is kept to recover from it. A session change (sign-out, another identity, the same owner
signing in again) drops the flow at once and nothing is asked.

**Data ownership.**

| Item | Lives | Never |
|---|---|---|
| the new key | `SecretKeyFacade` memory from the answer until Done, leaving or a session change; the DOM only while revealed | `DemoWorld`, `DemoAuthState`, Settings state, storage, URL, history state, logs, analytics, toasts, notices, activity, production fixtures, test screenshots or reports |
| `issuedAt` | the facade, shown on the key step | kept after the flow |
| the code and the grant | the field (cleared on every state change) and the one request | stored, reused, logged or shown |
| the check group and typed value | the page, compared locally | sent anywhere |
| the simulated verifier | `DemoAuthState`: a DEMO-only SHA-256 digest of the normalised key and `issuedAt`, per owner (Core keeps an HMAC with a pepper; this is not production-grade key protection) | the key; any gateway or read model |
| clipboard | only after Copy, with a warning to clear it and its history | written by Admin otherwise |

Disposal: Done, Leave anyway, a session change and the page's destruction set the key to `null` and bump the run;
JavaScript strings cannot be wiped, so Admin drops every reference and copies the key nowhere else.

**Demo semantics.** Each call makes a random fictional key (13 groups of 4 from a 32-character alphabet, joined by
`-`); its digest replaces the owner's verifier, so the previous key stops matching. Fixture owners have no key. Scenarios:
`rotateLost` (committed, the answer lost), `rotateServerError` (committed, `500`), `rotateIncomplete` (committed, `200`
without a key), `rotateRateLimited` (`429`, nothing changed).

**Not done (out of scope):** factor removal (S4d), password change (S4e), passkey proof (the factor chooser), recovery
start or cancel, a key-status read, export, download or print, real Core HTTP integration. Creating a key guarantees no
recovery: every message says recovery also needs the password and follows Core's recovery rules.

**Tests.** `secret-key.facade.spec.ts` (every transition; acknowledgement; purpose and proof; one rotation per action;
duplicate submissions; definite refusals; all uncertain outcomes including 500/502/503/504 and incomplete successes;
never resent; no grant reuse; the local check; Done's two conditions; copy; leaving; destruction; sign-out, another
owner, the same owner's new session; a grant arriving after a session change; eligibility; production);
`secret-key.page.spec.ts` (end to end with the mocks; masked first; reveal, hide, LTR groups read letter by letter;
check only while hidden; Done hints; the refused-code race; copy; passkey-only; operator; production; lost, 500,
incomplete, throttled; the slow notice; the leave dialog and `beforeunload`; session change; destruction; no key in
storage, history, URL, console, notices or the demo world; Arabic RTL); `account-security.mock.spec.ts` (creation,
replacement and the old key's invalidation, the digest only, grant purpose/owner/factor/expiry, spent once, operators,
uncertain scenarios commit, `429` changes nothing, no read-back); `account-security.page.spec.ts` (the card, the
passkey-only reason, the notices); `account-security.routes.spec.ts` (guard, title, breadcrumb, leave guard, production
adapters); `capability-policy.spec.ts`.

**Limitations.** The uncertain scenarios and the passkey-only owner are unit-tested only (demo builds use `normal`; no
fixture owner is passkey-only); demo state is per tab, so two tabs cannot race. No screen reader was run (names, roles
and live regions are asserted). The notice after "Leave anyway" shows only when Security is the destination (the
facade lives with the Security routes). Browser automation never captured a revealed key: every capture asserts it is
masked.
