# P9-S4 — Owner account security

- **Status:** P9-S4-0 read-only Core verification complete (2026-10-25). **P9-S4a implemented** 2026-10-25: the
  owner's read-only Security overview (`/settings/security`, §9). **P9-S4b to P9-S4e are planned, each separately
  authorized**; nothing here changes a factor, a key, a password or a recovery.
- **Baseline:** Core `origin/main` `304064f` (equal to the remote; read with `git show`, nothing checked out); Admin
  `main` `bb4c968`. Parent design: [`p9-settings-architecture.md`](p9-settings-architecture.md).
- **Canvas:** https://claude.ai/artifact/N9MpMwvtasDCwZ76puVPtz (private, may expire). This text prevails.
- **Sources read (Core, `apps/auth-service/`):** `src/owner/{owner.controller, dto, factor.service, enrollment.service,
  step-up.service, secret-key.service, recovery.service, webauthn.service}.ts`, `src/auth/auth.guard.ts`,
  `src/tokens/refresh-token.service.ts`, `src/crypto/password.ts`, `src/config/app-config.ts`, `src/errors.ts`;
  tests `test/{step-up, owner-auth, recovery, secrets, audit-actions}.e2e-spec.ts`; docs `docs/sdd/auth-service.md`,
  `docs/add/auth-service.md`, ADR-0010, ADR-0016, ADR-0025. No credential, environment secret, key or production
  record was read; no endpoint was called.

## 1. What Core supports (verified) versus what Admin implements

| Capability | Core (verified, `304064f`) | Admin |
|---|---|---|
| List the owner's factors | ✅ `GET /auth/admin/factors` | ✅ **P9-S4a**, read only (demo mock; production "not available") |
| Add an authenticator app | ✅ `POST factors/totp`, `factors/totp/confirm` + step-up | ⏳ P9-S4b |
| Add a passkey | ✅ `POST factors/webauthn/options`, `factors/webauthn` + step-up; origin-bound | ⏳ later (needs a WebAuthn registration client, the real origin) |
| Remove a factor | ✅ `DELETE factors/:id` + step-up; never the last confirmed one | ⏳ P9-S4d |
| Rotate the secret key | ✅ `POST secret-key/rotate` + step-up; returned once | ⏳ P9-S4c |
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
- **New:** `AccountSecurityGateway` (S4a: `load()`; later list-changing commands, each in its slice); a TOTP setup
  component extracted from the sign-in enrollment page.
- **Missing:** WebAuthn registration (`WebAuthnClient` only asserts); a shared factor chooser.

## 5. Order (each separately authorized)

1. **S4a** ✅ read-only overview (§9).
2. **S4b** add an authenticator app.
3. **S4c** generate / rotate the secret key.
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
forgotten-password path · CF-58 pending-recovery read · CF-59 declared OpenAPI response schemas. Related, open: CF-21,
CF-51, CF-01 / D-A4, CF-07.

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
