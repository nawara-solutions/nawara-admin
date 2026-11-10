# Account Settings — three-panel refinement

Branch: `codex/admin-header-toolbar-refinement`.
Starting SHA: `5c8016f33b14b5dd54b7dea45349360207d60bfc`.

## Inspection before implementation

Angular 22.2 standalone OnPush components use Signals, Transloco and semantic tokens.
The existing `/settings/account?section=profile|access|security` route selection,
accountSettingsView, accountView grant filtering, three panels and native dl rows
are reusable. Existing NwIcon, NwButton, NwSkeleton and NwDataState remain in use.
No applicable AGENTS.md exists. CLAUDE.md and the shared commit command apply.
Unrelated working-tree changes are preserved and excluded from this task.

AuthSession provides Actor (Owner or Operator), optional displayName, nullable
email, optional phone and demo provenance. ScopeContext supplies Company context
or currently authorized Platforms. Managed Organization Membership records do not
constitute the authenticated person's own memberships. Actor still has no
Organization Administrator variant or multiple account-role/membership list.

The session reports no sign-in method used or factor enrollment. The existing
Security route owns AccountSecurityGateway / AccountSecurityFacade and their
capability-protected workflows. Account must retain unreported statuses and the
existing authorized link; it must not infer enrollment from supported methods.
Production has no live signed-in adapter or session restoration (D-A4). No fixture
may be used as a live record.

## Approved composition and implementation scope

Reuse the working architecture. Add one LOCAL identity summary driven by the same
normalized data for Profile and Access, with initials only from an actual supplied
displayName; otherwise use the existing user icon and a neutral translated label.
Keep the shell avatar untouched. Profile places a compact summary above balanced
two-column personal facts. Access places a contextual summary beside structured
scope and access details, stacking at smaller widths. Security adds a compact
summary and concise status rows with one common explanation of unreported data.
No membership decorations, positive security claims, new operations or permissions.

Routes, tabs, all other Settings sections, auth flows, branding and financial code
remain unchanged. Main differences from the concepts are intentional: actual shell
and botanical artwork, token-based accents, no invented membership cards, and no
"Reported" sign-in claim without supporting data.

## Delivered changes

The existing page container, route/query selection, panels and trusted adapter
remain. The shared heading and navigation are unchanged; the selected content
composition places the identity summary above Profile or beside Access. Summary,
heading, tabs and content surfaces align to the existing workspace. On smaller
containers the Access composition stacks and Profile reduces to one column.

`AccountSettingsView.identity` supplies displayName, primary contacts, nullable
initials and the display-only role key from the same current Actor. Initials use
only the actual supplied displayName; no name or initials are derived from email,
phone or user id. The new LOCAL AccountIdentitySummary is presentation only.
It adds no fetching, authorization or changes to the shell account avatar.

AccountInfoRow gains a stacked presentation used for Profile's two columns;
native dl/dt/dd semantics remain. Access retains its original normalization,
current-grant filtering, state handling and retry. It now groups scope facts and
uses structured authorized Company/Platform records. No membership normalization,
role-management control, account switcher or new permission was introduced.

Security rows now carry explicit `status: not-reported` and existing icon names.
This is the only state established by the current session contract; it does not
mean unavailable, not configured, configured or supported-and-enrolled. The panel
uses a compact neutral summary, short method descriptions, readable status rows
and one shared explanation of the missing data. It has no green guarantee badge
or implied security failure. The existing capability-derived action is retained
as an outlined link to `/settings/security`. Factor business logic stays there.

## Trusted sources and supported contexts

AuthSession, ScopeContext, accountView and the existing capability policy remain
the only sources. Owners and Operators, including phone-only and multi-platform
Operators, use the same components. Future authorized contexts can supply the
same normalized presentation data; this task does not add session types or grant
Admin entry to organization members. Organization Administrator and multiple
own-membership/multiple-account-role screenshots are unavailable under the current
contracts. Multiple Platform assignments are demonstrated without relabeling them
as memberships.

The adapter imports no demo identity or security fixtures. Demo provenance still
comes from AuthSession; production isolation remains unchanged. Browser review
uses the existing Owner sign-in and mock-only session contract, including
Operator, missing-name/contact and long-email variants. No live records, actions
or security statuses were fabricated. Profile and access data remain read-only.
Production auth/session restoration (D-A4) remains absent: refreshing still ends
the existing memory-only demo session, while direct authenticated section links
and Back/Forward retain the URL-owned selection.

## Before / after and visual comparison

The before captures were made during the preceding account implementation and
remain in its committed review evidence. The after captures are from this task's
actual local application. Existing uncommitted shell/branding work is visible in
both; it remains excluded from this commit.

| Section | Before | After | Comparison with approved concept |
| --- | --- | --- | --- |
| Profile | [Before](../account-settings-option-d/screenshots/chrome-en-owner-profile-1440-sapphire-light.png) | [After](screenshots/chrome-en-owner-profile-1440-sapphire-light.png) | Compact identity strip; name/email column beside phone; no oversized banner |
| Access | [Before](../account-settings-option-d/screenshots/chrome-en-owner-access-1440-sapphire-light.png) | [After](screenshots/chrome-en-owner-access-1440-sapphire-light.png) | Context sidebar beside structured access; omitted fictional membership cards and decorative banner |
| Security | [Before](../account-settings-option-d/screenshots/chrome-en-owner-security-1440-sapphire-light.png) | [After](screenshots/chrome-en-owner-security-1440-sapphire-light.png) | Compact method summary and readable rows; all session statuses honestly unreported, unlike the concept's unsupported green sign-in claim |

The approved concepts guide composition, not pixel identity. Material intentional
differences remain: preserved actual shell and botanical artwork, current Nawara
semantic themes and typography, no invented memberships or organization context,
and no fabricated confirmed authentication status. No claim of exact screenshot
matching is made.

## Screenshot index

| Requested evidence | Actual browser capture |
| --- | --- |
| Owner Profile / missing phone | [Chrome](screenshots/chrome-en-owner-profile-1440-sapphire-light.png), [Firefox](screenshots/firefox-en-owner-profile.png) |
| Operator Profile | [Chrome](screenshots/chrome-en-operator-profile.png) |
| Owner Access | [Chrome](screenshots/chrome-en-owner-access-1440-sapphire-light.png), [Firefox](screenshots/firefox-en-owner-access.png) |
| Operator Access / multiple authorized Platforms | [Chrome](screenshots/chrome-en-operator-access-multiple-platforms.png), [Firefox](screenshots/firefox-en-operator-access.png) |
| Security / unknown enrollment and method | [Chrome](screenshots/chrome-en-owner-security-1440-sapphire-light.png), [Firefox](screenshots/firefox-en-owner-security.png) |
| Known supported authorized Security navigation | The Owner Security captures show the real capability-controlled link; a known configured method is not available from the session and was not fabricated |
| Missing identity / long email | [390px](screenshots/chrome-en-long-email-missing-name-phone-mobile.png) |
| Missing name and email / phone only | [390px](screenshots/chrome-en-phone-only-missing-information-mobile.png) |
| Sapphire light | [Profile](screenshots/chrome-en-theme-sapphire-light-profile.png), [Access](screenshots/chrome-en-theme-sapphire-light-access.png), [Security](screenshots/chrome-en-theme-sapphire-light-security.png) |
| Rose dark | [Profile](screenshots/chrome-en-theme-rose-dark-profile.png), [Access](screenshots/chrome-en-theme-rose-dark-access.png), [Security](screenshots/chrome-en-theme-rose-dark-security.png) |
| Pearl light | [Profile](screenshots/chrome-en-theme-pearl-light-profile.png), [Access](screenshots/chrome-en-theme-pearl-light-access.png), [Security](screenshots/chrome-en-theme-pearl-light-security.png) |
| Compact desktop | [1024px Profile](screenshots/chrome-en-owner-profile-1024-sapphire-light.png), [Access](screenshots/chrome-en-owner-access-1024-sapphire-light.png) |
| Mobile | [390px Profile](screenshots/chrome-en-owner-profile-390-sapphire-light.png), [Access](screenshots/chrome-en-owner-access-390-sapphire-light.png), [Security](screenshots/chrome-en-owner-security-390-sapphire-light.png) |
| Arabic RTL | [Desktop](screenshots/chrome-ar-owner-profile-1440-sapphire-light.png), [390px](screenshots/chrome-ar-owner-profile-390-sapphire-light.png), [Firefox compact](screenshots/firefox-ar-compact-profile.png) |
| Browser zoom | [Firefox actual 200%](screenshots/firefox-en-profile-zoom200.png), [Chrome 200% reflow equivalent](screenshots/chrome-en-zoom-200-reflow-profile.png) |
| Organization Administrator / own memberships | Not supported by the trusted authenticated-context contract; no fabricated capture |

## Responsive, accessibility and theme validation

Chrome passed **126 recorded checks**: all three sections × English/French/Arabic
× six widths (1920, 1440, 1280, 1024, 768, 390); all eleven accents × light/dark ×
three sections; System following both browser color schemes; three query-scroll
checks; and 200% reflow-equivalent width. Every responsive case asserts one
rendered panel, correct direction, no document overflow and no visible account
child overflow. Native link keyboard activation and Back/Forward passed. Scroll
retention is checked where both contents retain a scroll range; native browser
clamping when shorter content eliminates the range is not a router scroll reset.

Firefox independently passed Owner sections, Operator Access, Back/Forward,
Arabic RTL, compact layout and actual **200% browser zoom** (DPR 2, 720 CSS-pixel
viewport, no horizontal overflow). Firefox's minimum unzoomed window here is
500px; exact 390px coverage is Chrome. See [Chrome results](browser-results.json)
and [Firefox results](firefox-results.json).

The new elements are static and introduce no tab stops or motion. Navigation
retains native keyboard/focus and active-link semantics. Information remains
semantic dl/dt/dd. Status meaning uses text, with neutral styling; colors alone
do not communicate enrollment. Existing reduced-motion behavior is preserved.

## Tests and validation

- Focused account tests: **9 files, 119 tests passed**, including summary identity,
  missing-name/phone, Unicode initials, no email-derived name, role-neutral data,
  long text, access/loading/error/retry, precise unknown security and authorized
  navigation, demo/production isolation, tabs, direct query routes, history and RTL.
- Full suite: **201 files, 2,585 tests passed** serially with the existing external
  temporary runner config `{ test: { fileParallelism: false, maxWorkers: 1 } }`.
- The default `npm run validate` pipeline was run. Formatting, Angular lint, style
  lint, i18n, tokens, contrast and brand checks passed; concurrent tests hit the
  existing organization invitation/create/edit dialog timing failures. Those
  files and assertions were not changed. The full serial run passes all of them.
- Explicit TypeScript check, final production build and production-bundle demo
  isolation check passed. Existing unrelated style-budget warnings and the
  existing unused eslint-disable warning in `src/main.ts` remain.
- Style and i18n checks were rerun after the final spacing refinements. See
  [actual full/focused test and build output](validation.txt).

## Files changed

- `application/account-settings-view.{ts,spec.ts}`: summary and explicit unreported
  security presentation; tests for real/missing/Unicode identity.
- `components/account-settings/account-identity-summary.{ts,scss}`: new LOCAL summary.
- `components/account-settings/account-info-row.{ts,scss}`: stacked read-only variant.
- `components/account-settings/account-profile-panel.{ts,scss}`: two-column facts.
- `components/account-settings/account-access-panel.ts`, `account-panel.scss`: grouped access.
- `components/account-settings/account-security-panel.{ts,scss,spec.ts}`: summary and concise statuses.
- `pages/account-settings.page.{ts,html,scss,spec.ts}`: composition and focused assertions.
- `src/i18n/{en,fr,ar}.json`: Account presentation copy only.
- This review directory and browser evidence.

All implementation paths above are under `src/app/features/settings/` unless a
full path is given. No route, backend contract, permission, auth flow, global
avatar, logo, illustration or other Settings section was modified. No push, PR,
merge or deployment. Ready for Owner visual review within the stated contracts.
