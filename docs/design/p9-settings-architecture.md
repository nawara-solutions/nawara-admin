# P9 — Settings & configuration architecture

- **Status:** P9-0 discovery reviewed and the design direction approved (2026-10-24). **P9-S1 implemented** 2026-10-24:
  the Settings hub (`/settings`), Settings → Language (`/settings/language`) and the account menu's Settings item;
  Appearance (`/settings/appearance`) unchanged (§11). **P9-S2 to P9-S5 are planned, each separately authorized; S4 and
  S5 are contract-gated** by a read-only Core verification first. No account, security, Company or Platform setting
  is implemented.
- **Baseline:** P9-0 read `main` `d0bce78` (PR #41). Core was **not** read: every Core fact below comes from Admin's
  `docs/CORE-INTEGRATION.md` (§3, §4, §5, §7, §9).
- **Scope:** personal preferences, the signed-in person's account and security, Company configuration and Platform
  configuration.
- **Canvas:** https://claude.ai/artifact/SUVrzazXf62621Bastpu6s (8 artboards; private, may expire). This text prevails.

## 1. Current implementation inventory (P9-0, before P9-S1)

| Area | Where | State |
|---|---|---|
| Settings | `/settings` → redirect to `/settings/appearance` | one page; no guard beyond the shell's session guard; no capability |
| Appearance | `AppearancePanel` (top-bar popover, sign-in pages, `/settings/appearance`) | mode (system, light, dark), six accents, reset; `ThemeService`, keys `nw.theme`, `nw.accent` |
| Language | top-bar and sign-in language menu (`PreferenceMenus`) | `LocaleService`, key `nw.locale`; not in Settings |
| Navigation | sidebar `SETTINGS_ITEM` for every actor; account menu "Appearance" | no "Settings" item in the account menu |
| Account security | Company Overview "Access & security" | "2FA enabled" (demo) and a disabled "Account security" |
| Platform policy | Platform dashboard | assisted-payments policy read only, "Change" `aria-disabled` |
| Auth | sign-in, owner MFA (TOTP, simulated passkey), TOTP enrollment, working code, contact confirmation | recovery shown as deferred; `DemoAuthState` keeps `enrolledOwners`, codes, step-up grants, the session |

## 2. Three levels of authority

1. **Personal preferences and account security: identity scope.** Every signed-in person, owner or operator, for
   themselves only. Presentation preferences stay in this browser. Account security is Auth's: the owner's sign-in
   methods (Core routes exist, details unverified); operators have no factors or password to manage.
2. **Platform configuration: one Platform.** The Company owner. No operator authority is verified for Platform
   configuration: an operator sees no Platform settings, even on an assigned Platform. **A Platform assignment never
   grants configuration rights.**
3. **Company configuration: the Company.** The owner only. Core has no human route to read or change the Company
   profile (CF-02, proposed CF-49).

## 3. Five kinds of data, never mixed

| Kind | What | Where |
|---|---|---|
| Browser-local | theme, accent, language | `PreferenceStore` only (`nw.theme`, `nw.accent`, `nw.locale`); per browser, not per account; never sensitive |
| Demo-only | simulated records | `DemoWorld` (business facts) and `DemoAuthState` (sign-in state); in memory, reset on reload, labelled simulated |
| Canonical business | Company, Platform, Organization configuration | Organization service (not authoritative before cutover), Billing / Payment (V2); only through gateways |
| Auth-controlled | factors, secret key, password | Auth decides and records; step-up tokens and one-time secrets live in memory for one use, never in settings records or storage |
| Unsupported | no Core contract | Company edit, sessions, notification preferences, operator policies: shown as unavailable or not shown |

## 4. Permission matrix (UX; Core authorizes every request)

| Setting | Owner | Assigned operator | Core status | P9 treatment |
|---|---|---|---|---|
| Appearance (theme, accent) | own browser | own browser | browser-local | exists; unchanged |
| Language (en / fr / ar) | own browser | own browser | browser-local | **P9-S1:** also in Settings, the same `LocaleService` state |
| Account identity (email or phone, role, scope) | view own | view own | 🟢 `/auth/me`, `/auth/grants` | P9-S2, read only; no display name exists in Core |
| Authenticator app, passkeys | own, step-up | none (no factors) | 🟢 `factors*` routes, details unverified | P9-S4a read-only list, then mock commands after a Core read |
| Secret key rotate, password change | own, step-up | none (no password) | 🟢 routes exist, details unverified | mock after verification; the secret shown once |
| Owner recovery | sign-in flow | none | 🟢 `recovery/*` | explained and linked, never a setting |
| Sessions list, sign out elsewhere | none | none | 🔴 no route documented | unavailable (proposed CF-51) |
| Notification preferences | none | none | 🟡 V2 A8 | unavailable (proposed CF-50) |
| Company profile | view (demo) | none | 🔴 no human read or edit | P9-S3 read only demo; edit unavailable (CF-02, CF-49) |
| Platform name | view; rename after verification | none in Settings | 🟢 PATCH contract unverified, not authoritative | P9-S5: owner-only mock rename, `409 not_authoritative` scenario |
| Assisted payments (Platform, Organization) | view | none | 🟡 Billing / Payment V2 | read only; "Change" stays disabled |
| Organization metadata | edit | edit (assigned) | 🟢 PATCH, built P3b-S2 | link to the Organization page, never rebuilt |
| Operator access (assignments, block, create) | manage | none | 🟢 built P6 | link to `/operators`, never rebuilt |
| Operator policies (shift length, capability sets) | none | none | 🔴 undefined / 🟡 V2 A6 | not shown (proposed CF-52) |

**Already built: link, do not rebuild.** The Appearance panel; the language menu; Operators and Platform access
(P6); Organization details edit and admin invitations (P3b); the assisted-payments policy on the Platform dashboard;
the TOTP enrollment view (A4-S4) and the step-up dialog (P4); the Company Overview "Account security" action (its
target becomes `/settings/security`).

**Must stay unavailable:** Company profile edit, logo or brand customization (Admin's brand is Nawara's); sessions
list, remote sign-out, "trusted devices"; notification channels and opt-outs; operator shift length, capability sets,
roles; assisted-payments changes and any commercial policy authoring; display-name edit, account deletion, data
export, API keys, SSO; a computed "security score"; passkeys outside the configured origin.

## 5. Ownership of state

| Store | Holds (P9) | Never holds |
|---|---|---|
| `PreferenceStore` | theme, accent, locale; a new key only by registry entry and owner decision | identity, factors, tokens, codes, scope, anything per account |
| `DemoWorld` | Company name; Platform name, key, product; assisted-payments settings; operators and assignments; a Platform rename as a command with an activity record | any sign-in fact, secret or grant |
| `DemoAuthState` | the owner's simulated factors (id, kind, label, added), secret-key generation, simulated password check, step-up grants, the session | business records; the plaintext secret key or TOTP secret after display |
| `AuthSession` | the actor from `/auth/me` and `/auth/grants` (read only in Settings) | editable profile fields |

A sign-out keeps `DemoAuthState`'s Core records and `DemoWorld`; a new identity never sees the previous one's Settings
data (views keyed on the actor, ARCHITECTURE §11).

## 6. Routes and navigation

| Route | Who | Guard | Content | Slice |
|---|---|---|---|---|
| `/settings` | everyone | session | Hub: the sections the actor has, as cards (replaces the redirect) | **S1 ✅** |
| `/settings/appearance` | everyone | session | unchanged | exists |
| `/settings/language` | everyone | session | language and direction, the same state as the top-bar menu | **S1 ✅** |
| `/settings/account` | everyone | session | identity read only: email or phone (machine value, LTR), account kind, scope | S2 |
| `/settings/security` | owner | capability `account.security.manage` (owner) | sign-in methods and step-up methods; an operator gets a collapsed 404 and sees how they sign in on `/settings/account` | S4 |
| `/settings/company` | owner | capability `company.settings.view` | Company profile read only (demo) and a directory of existing configuration | S3 |
| `/platforms/:platformId/settings` | owner | capability `platform.settings.view` + the Platform belongs to the Company; operators: collapsed 404, even when assigned | Platform identity (rename after verification), policies read only | S5 |

Navigation: the sidebar keeps one Settings item (active on every Settings page); the account menu gains "Settings"
(Appearance stays, **S1 ✅**); the Platform dashboard header gains "Platform settings" for the owner (S5); the Company
Overview "Account security" links to `/settings/security` (S4a). Breadcrumbs: Settings › section. The hub lists the
sections; each later slice adds its section to it only when built.

## 7. Contract readiness and missing contracts

- **Ready (local):** appearance, language. **Ready (Core 🟢 read):** `/auth/me`, `/auth/grants`.
- **Exists, details unverified:** factor list, add, remove (`factors*`; adding needs step-up `owner.factor.enroll`
  once a factor exists, CF-21); the WebAuthn factor routes (origin `admin.nawara-solutions.com` only);
  `secret-key/rotate`; `password/change`; the Platform `PATCH /organization/admin/platforms/:id` (fields, authority,
  step-up, response; writes `409 not_authoritative` before cutover). Each needs a separately authorized read-only Core
  verification before its slice (S4-0, S5-0).
- **Proposed** (CORE-INTEGRATION §9): **CF-49** owner read and edit of the Company profile; **CF-50** a person's
  notification preferences; **CF-51** a person's own sessions; **CF-52** operator policy configuration; **CF-53** a
  display name for Admin identities.

## 8. Mock-first opportunities

- Settings hub, Language, Account: no mock (local state and the session's actor).
- Security overview: a `SecuritySettingsGateway.load()` over `DemoAuthState`; unavailable in production builds until
  the HTTP adapter.
- Security commands (after verification): add authenticator (reuses the enrollment view), remove a factor
  (destructive + step-up), rotate the secret key (one-time display, copy and confirm), change password; each on
  `ActionRun`, never resent after a lost answer.
- Company profile: a `CompanySettingsGateway` over `DemoWorld`, read only.
- Platform rename: a `DemoWorld` command (`platform.renamed` activity), owner only, `409 not_authoritative` as a scenario.

## 9. Slices and order (each separately authorized)

| Slice | Scope | Depends on |
|---|---|---|
| **P9-S1** ✅ | Settings hub at `/settings`, Language page, account-menu "Settings". Local only | D1, D2, D3 |
| P9-S2 | `/settings/account`: read-only identity and scope for owner and operator; the operator's sign-in explanation (working code, the shift ends the session) | S1 |
| P9-S3 | `/settings/company`: read-only demo Company profile and the configuration directory (links to Platforms, Operators & access, Licenses, Billing, Releases) | S1, D4 |
| P9-S4-0 | read-only Core verification of factor management, secret key and password contracts | D6 |
| P9-S4a | `/settings/security` read only: sign-in methods, step-up methods, recovery explained; Company Overview link enabled | S4-0 |
| P9-S4b…d | mock commands, one per slice: add / remove factor, rotate secret key, change password | S4a, D7, D10 |
| P9-S5-0 / S5 | verify the Platform PATCH contract, then `/platforms/:platformId/settings`: identity, owner-only mock rename, policies read only | D5, D6 |

## 10. Risks and acceptance

**Risks.** Preferences are per browser (on a shared device the next person inherits theme and language: acceptable,
not sensitive, stated on the pages). A secret (TOTP seed, secret key, password, step-up token) reaching
`PreferenceStore`, `DemoWorld`, a URL, a log or a toast is forbidden. One-time secrets are shown once and cleared on
navigation and sign-out. Demo security state must never pass for real protection ("simulated" in demo builds, "not
available" in production). The Overview's "2FA enabled" must come from the same gateway as `/settings/security`. An
assignment is never configuration authority. Removing the last factor or changing the password without step-up is
Core's decision; Admin never relaxes it. Company isolation: every Company and Platform read is keyed on the actor's
`companyId`. Lost answers on security commands are never resent automatically.

**Acceptance (each slice).** `npm run validate`; capability tests (an operator has no Company, Platform or security
settings capability; direct URLs give forbidden or a collapsed 404); the hub lists exactly the actor's built sections;
one state per preference; the preference registry still lists only theme, accent and locale; no secret in storage, a
URL, history state or a log; `DemoAuthState` vs `DemoWorld` isolation; en / fr / ar parity; a real-browser pass:
keyboard, screen-reader names, light / dark / system, accents, Arabic RTL, 320 px to desktop, owner and operator
walkthroughs with direct URLs.

**Owner decisions** (P9-0): D1 hub at `/settings` ✅; D2 language also in Settings, the same state ✅; D3 accessibility
follows the operating system, no in-app toggles ✅; D4 Company configuration at `/settings/company`; D5 Platform
configuration at `/platforms/:platformId/settings`, owner only; D6 authorize the read-only Core verification passes;
D7 security commands as demo mocks after verification, or read only; D8 record proposed CF-49 to CF-53 ✅ (as
proposals); D9 the account menu's "Settings" item ✅ and the Overview's "Account security" link (S4a); D10 demo password
and secret-key semantics (in memory only, reset on reload). D1–D3, D8 and the S1 half of D9 are settled by the P9-S1
authorization; the rest wait for their slices.

## 11. P9-S1 implementation (2026-10-24)

- **Routes** (`features/settings/settings.routes.ts`): `''` is the hub (`SettingsHubPage`, title `titles.settings`),
  no longer a redirect; `appearance` and `language` carry the parent crumb "Settings" (`/settings`). No guard beyond
  the shell's session guard, no capability, no providers: owners and operators alike, with or without Platform
  assignments.
- **Hub** (`pages/settings-hub.page.*`): "Personal preferences", two links (Appearance, Language), each with its
  current value read from `ThemeService` (mode · accent) and `LocaleService` (the language named in itself, with its
  `lang`); a note that personal preferences live in this browser and change nothing for the Company. Nothing else:
  no account, security, Company or Platform section until its slice is built.
- **Language** (`pages/language-settings.page.*`): a native radio group (English, Français, العربية, each with its
  `lang` and its reading direction) bound to `LocaleService.locale()`; a choice calls `LocaleService.use()`, the same
  call as the top-bar menu: catalog, `<html lang dir>`, CDK `Directionality` and `Accept-Language` change together,
  and the choice is kept under `nw.locale` by the service. The page stores nothing itself; no second key or state.
- **Account menu:** "Settings" (to `/settings`) before "Appearance" and "Sign out".
- **Appearance:** unchanged (the panel, its state and its reset); its page gains only the Settings parent crumb.
- **Accessibility:** the operating system's reduced-motion and contrast settings keep applying as before; no new
  preference, key or toggle.
- **Tests:** `settings.routes.spec.ts` (session guard only, no capability, the hub is a page, parent crumbs, no
  providers); `pages/settings-pages.spec.ts` (hub for an owner, an assigned operator and an unassigned operator;
  current values; navigation and browser back / forward; the language radio group; Arabic RTL and back to LTR; two-way
  sync with the top-bar menu; only `nw.locale` written, nothing in session storage, the session unchanged and the demo
  bindings never loaded); `account-menu.spec.ts` (the Settings item, owner and operator).
