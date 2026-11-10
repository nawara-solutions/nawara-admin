# Access & memberships — Owner visual review

Implemented on `codex/admin-header-toolbar-refinement`, starting at
`c05d87cdcf070a99cebc42cabe34030587a9fd06`. The initial workspace already contained
uncommitted security, branding, header, theme and appearance work. Those changes
are preserved and excluded from this task's commit, including unrelated hunks in
shared account and translation files.

## Presentation

Access uses one full-width panel with the existing heading, description and icon.
The identity summary and two-column allocation are removed for Access only.
Account type, scope and actual company/assigned platforms appear once in native
`dl` / `dt` / `dd` relationships. The repeated Access overview is removed. One
subtle read-only note remains inside the panel. Profile, security, navigation,
routes, history, session and authorization behavior are preserved.

The existing `accountSettingsView` → `accountView` → `AuthSession` / `ScopeContext`
architecture supplies the values. Operator entries are still filtered against
current session assignments; stale grants, loading, empty, forbidden and error
states retain their behavior. The existing retry only refreshes the trusted reads.
Operators now have an explicit platform-scoped description rather than a blank scope.

The shared `ProductSymbol` renders the existing approved Solutions puzzle-leaf
mask and detail layers (`public/brand/nawara-scope-solutions-{mask,details}.webp`).
Branding is selected only when the directory company ID matches the current owner
and its trimmed, case-normalized name is exactly `Nawara Solutions`. Similar names,
unrelated company IDs, missing context and platform assignments do not receive it.
Other companies use a neutral building icon. No asset or wordmark was redrawn,
replaced or modified. The existing mechanism uses source-extracted WebP layers,
not an SVG master; see `docs/brand/scope-symbols.md`. Its accent and theme mechanism
is unchanged. The page-level botanical artwork is preserved.

## Supported data and limitations

The trusted Admin `Actor` union currently supports owners and operators only.
Organization administrators are organization members, not Admin actors. This
session contract has no organization-scoped account, multiple-role, own-membership
or tenant-logo metadata. Those fixtures cannot be honestly produced from trusted
session data and were not fabricated. No empty memberships section is rendered.
Multiple authorized platform assignments remain supported; they are not relabeled
as membership records. Supporting further roles or memberships requires an
existing trusted adapter source, outside this presentation change.

Missing-company, unrelated-company, similar-name and long-name browser captures
use isolated presentation inputs through Angular's development debug API. They do
not establish authentication claims, ship fixtures or add application test hooks.
Owner/operator captures use the existing demo session. Production demo isolation
is covered by the route tests and production bundle check.

## Visual evidence

- [Actual before](screenshots/before-chrome-owner-1440.png)
- [Final desktop](screenshots/after-chrome-owner-1440.png)
- [Operator / multiple assignments](screenshots/chrome-operator-multiple-platforms.png)
- [Missing company](screenshots/chrome-no-company.png)
- [Unrelated company](screenshots/chrome-other-company-1440.png)
- [Long company on mobile](screenshots/chrome-long-company-390.png)
- [Sapphire light](screenshots/chrome-sapphire-light.png)
- [Rose dark](screenshots/chrome-rose-dark.png)
- [Pearl light](screenshots/chrome-pearl-light.png)
- [Tablet](screenshots/chrome-owner-768.png)
- [Mobile](screenshots/chrome-owner-390.png)
- [Arabic RTL mobile](screenshots/chrome-ar-390.png)
- [Firefox owner](screenshots/firefox-en-owner-access.png)
- [Firefox real 200% zoom](screenshots/firefox-en-access-zoom200.png)

Chrome's 43 recorded checks cover 1920, 1440, 1024, 768, 390 and 720 CSS pixels,
all eleven accents in Light and Dark, System following both browser color schemes,
missing/long/unrelated company contexts, multiple and empty platform assignments,
Back/Forward and Arabic RTL. No horizontal document overflow was found after
responsive transitions settled. Firefox 159.0.1 additionally verifies owner,
operator, Arabic RTL and real browser zoom at 200% (720 CSS pixels at DPR 2).
Firefox's minimum compact window is 500 CSS pixels; Chrome covers the requested 390.
See `browser-results.json` and `firefox-results.json` for measured results.

Static rows have no interactive or tabindex attributes. Badges use semantic accent
tokens, labels and values retain native description-list semantics, external names
use bidi isolation, and mobile rows stack with wrapping names and proportional
branding. Existing navigation remains keyboard accessible. No new permission,
editing, account-switching or role-management controls were added. These checks
cover DOM semantics and browser reflow; no screen-reader session was performed.

## Validation

- Focused settings suite: **24 files, 326 tests passed**, including final Arabic
  Access assertions, accurate roles, scopes, no duplicate facts, tenant branding,
  missing context, stale grants, retries, read-only behavior and demo/live isolation.
- Full suite: **202 files, 2,604 tests passed** using the existing serial Vitest
  runner configuration to limit concurrent workers. Final Arabic assertions were
  subsequently verified in the focused suite.
- ESLint, Stylelint, i18n, token, contrast and brand checks: passed.
- Production build and production bundle isolation: passed.
- Build reports existing style-budget warnings in appearance, global search,
  notification center, operator detail, brand mark and notifications page styles.
- `npm run validate` stops at an unrelated pre-existing formatting issue in
  `docs/review/account-security-option-b/browser-results.json`. All later validation
  stages were run individually and passed. This unrelated file was preserved.
- No new dependency, backend implementation or authorization change.

## Changed source files

- `application/account-settings-view.ts` and its spec: access-only branding metadata,
  operator scope and trusted-context tests.
- `components/account-settings/account-access-panel.ts` and its spec: single access
  list, conditional existing brand, state handling and duplication/read-only tests.
- `components/account-settings/account-panel.scss`: access-only row layout.
- `pages/account-settings.page.html`, `.scss`, `.spec.ts`: remove Access identity
  summary and two-column allocation; preserve Profile/security behavior; regression tests.
- `src/i18n/{en,fr,ar}.json`: Access scope label and operator scope description only.
- This review directory: actual screenshots and browser results.

One focused local commit is recorded in the final task response. No push, PR,
merge or deployment. Awaiting Owner visual review.
