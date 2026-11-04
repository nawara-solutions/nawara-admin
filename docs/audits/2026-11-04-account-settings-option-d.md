# Reusable Account Settings — Option D

## Starting point and architecture inspection

Repository: `nawara-solutions/nawara-admin`.
Branch: `codex/admin-header-toolbar-refinement`.
Starting SHA: `d5b6d9d7ddf7e1f2b3748e3ddc3f0b9ef0144e3a`.
Owner reference: `Nawara Account Settings UI Comparison.png`, Option D.
Instructions inspected: `CLAUDE.md`, the shared commit command, existing Settings
architecture, session/access contracts, page/view tests and shared UI conventions.
No applicable AGENTS.md exists in this repository. The detailed current Owner
request supplies the implementation requirements; no separate earlier reusability
specification was found in this workspace.

Inspection before implementation:

1. Angular 22.2, standalone OnPush components, strict TypeScript/templates, Signals,
   RxJS, Transloco, component SCSS/BEM and Vitest via Angular CLI.
2. `/settings/account` is a lazy component inside the shared Settings workspace.
   Existing pages use URL query parameters for local view selection. Shell focus
   handling ignores query-only navigation, so inner sections can preserve scrolling.
3. `AuthSession` exposes `Actor`, epoch and demo provenance. The current session
   implementation is demo-only; production is signed out until the HTTP adapter and
   session strategy exist (D-A4). No new authentication context is authorized here.
4. Identity fields: email (nullable), optional phone, optional actual displayName.
   Real `/auth/me` has no display name. The old page deliberately hid even a supplied
   demo name; the new Profile must show a supplied name and use an honest fallback.
5. `ScopeContext` reads the Company directory for an owner and named authorized
   Platforms for an operator. It handles loading, errors, reload and grants refresh.
   Directory reads use mock adapters only in demo builds; other builds are unavailable.
6. `Actor` currently supports only OwnerActor and OperatorActor. Organization-admin
   privilege exists on managed `Membership` records, not as an Admin actor. Neither
   Identity/Grants nor a "my memberships" API supplies the authenticated person's
   organization memberships. Organization admins without an admin tier are denied
   Admin entry by the existing landing resolver. Multiple platform assignments are
   supported; multiple account roles / own memberships are not supplied.
7. `can(actor, capability)` is the existing UX authorization boundary. Security
   links may use `account.security.view`; role labels are display data only. No
   permissions or guards will be changed. Core remains the authorization boundary.
8. Session identity does not contain the sign-in method used, authenticator/passkey
   enrollment, recovery-key existence or session inventory. The existing Security
   route owns factor metadata and its gateway/facade and workflows. Account will
   show unknown enrollment/method statuses and link there when permitted, without
   copying factor-management business logic or loading fixtures as live records.
9. Existing gateways and environment-gated demo providers remain authoritative.
   Account needs no new gateway or backend operation. Demo badge provenance comes
   from AuthSession, not a build flag or a hardcoded company/name.
10. Shared NwIcon, NwButton, NwDataState, NwSkeleton and semantic spacing, text,
    border, surface, focus and accent tokens already exist. Account rows/panels are
    LOCAL domain presentation, not a new shared UI framework.
11. Existing tests cover owner/operator/phone-only identities, revoked grants,
    errors/retry, blocked sessions, no secret leakage/network/storage, and Arabic.
    Those protections must remain, with assertions moved to the relevant section.

Hardcoded assumptions found: AccountView and the template expose owner/operator
branches; type and sign-in copy are selected directly by role; the template renders
all three cards at once and the host is capped at 44rem. Existing contact-confirmed
copy for operators is derived from the documented working-code contract, not a
separate verification read. The replacement omits this inferred verification status: it is not an explicit session field.

## Implementation

Keep `accountView` as the existing trusted session/scope adapter (including its
current-grant filtering), and normalize it into a role-neutral AccountSettingsView.
The page/facade and three presentation panels consume rows, access entries and
capability-derived links; they never choose a component by role name. A local
information-row component uses a real `div` inside `dl` with `dt`/`dd` relationships.
Profile, Access and Security are URL-owned by `?section=profile|access|security`;
missing or unknown values select Profile. Existing paths and main tabs remain.

Organization-admin sessions and own membership lists cannot be manufactured within
the current contracts. Presentation will accept normalized repeated access records,
but the real adapter will emit only the actual Company/Platform facts available.
Unknown security data and unsupported edits stay read-only. No account switcher,
role assignment, profile editing, backend API, new capability or auth flow is added.

## Delivered architecture

- `AccountSettingsPage` composes three panels and reads `AuthSession`, `ScopeContext`
  and the existing Angular route's query parameters. It has no role-specific render
  branches, gateway or commands. Unknown sections default to Profile.
- `accountSettingsView` reuses the existing pure `accountView` scope adapter. It
  emits profile rows, access rows, stateful ordered access entries, contextual
  empty/error copy, security rows and one capability-derived Security link.
- `AccountProfilePanel`, `AccountAccessPanel`, `AccountSecurityPanel` and the native
  `div[adm-account-info-row]` are LOCAL account-domain presentation components.
  `dl`/`dt`/`dd` provide information relationships. Native navigation links use
  `aria-current=page`; no ARIA tab keyboard contract is implied.
- Existing NwIcon, NwButton, NwSkeleton, NwDataState, Transloco and semantic tokens
  are reused. Label/value rows wrap; compact navigation scrolls horizontally.
- The existing Account route, Settings workspace, security gateway/facade and all
  authentication/authorization rules remain unchanged.

## Trusted data and capabilities

Actor provides actual optional displayName, nullable email, optional phone and its
admin type. No name is derived from an email. ScopeContext supplies the Company
name or the operator's named currently authorized Platforms. Existing accountView
filters revoked assignments even before directory reload. Access ordering is
preserved. Only the supported current Company/Platform records are emitted.

`can(actor, 'account.security.view')` controls the sole workflow link. Displayed
role labels grant no capability. No panel compares role names. The existing pure
source adapter interprets Actor's discriminated data model to normalize scope;
this is not a new permission rule. Core remains the authorization boundary.

Security shows unknown sign-in method, second-factor enrollment and passkey
status, with explicit explanations. A supported route or demo sign-in option does
not establish current enrollment. Existing authorized workflows stay on Security;
Account does not duplicate factor loading/management or claim an enabled factor.

## Demo and live separation

The adapter imports no demo record or gateway. Demo indication comes exclusively
from session provenance. Deterministic existing owner, multi-platform operator and
phone-only contracts are used in tests/browser review; missing name, missing phone
and long email variants stay inside those contracts. Production cannot establish
a demo session and contains no demo gateway/fixtures. Tests verify this barrier.
There is currently no legitimate live signed-in session adapter; no live account
or security data was fabricated for this task.

## Read-only scope and contract limitations

All profile/contact/role/scope/assignment information remains read-only. No Edit,
Save, membership switcher, self-assignment, new capability or endpoint was added.
Existing supported security actions are reached through the capability-protected
Security route, preserving its verified step-up workflows.

Organization Administrators without an Admin tier cannot enter this application
under the existing Actor/landing contracts. Managed Membership records do not
provide a trusted own-membership context. Consequently Organization Administrator
account screenshots, multiple own memberships and multiple account roles cannot
honestly be produced. Supporting them needs a trusted session/own-membership
contract and authorized Admin entry; this task does not invent either. Multiple
**platform assignments** are supported, tested and captured; they are not relabeled
as Organization memberships.

The URL preserves `?section=profile|access|security`; Back/Forward works and query
navigation retains session epoch and context. Full reload still ends the existing
memory-only demo session (D-A4). Durable authenticated refresh cannot be completed
without changing the explicitly preserved authentication architecture. Direct
account-section links resolve correctly when authenticated.

## Changed files

- `src/app/features/settings/pages/account-settings.page.{ts,html,scss,spec.ts}`
- `src/app/features/settings/application/account-settings-view.{ts,spec.ts}`
- `src/app/features/settings/components/account-settings/account-info-row.{ts,scss}`
- `src/app/features/settings/components/account-settings/account-{profile,access,security}-panel.ts`
- `src/app/features/settings/components/account-settings/account-access-panel.spec.ts`
- `src/app/features/settings/components/account-settings/account-panel.scss`
- `src/i18n/{en,fr,ar}.json` (Account copy only)
- This audit and `docs/review/account-settings-option-d/` evidence.

All unrelated pre-existing changes, including Appearance, shell and branding work,
are excluded from the focused commit. No branch switch, push, PR, merge or deployment.

## Validation and Owner review

See [review evidence](../review/account-settings-option-d/README.md) for browser
screenshots, exact validation results and remaining limits. This is implementation
completion within the available contracts, pending Owner visual review; it does
not certify unavailable Organization Administrator or production auth behavior.
