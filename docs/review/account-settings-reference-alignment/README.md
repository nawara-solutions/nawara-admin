# Access and Security — closer reference alignment

Branch: `codex/admin-header-toolbar-refinement`.
Starting SHA: `efec217a6e8f10f4061a70c3f75a4e0d51d3a62e`.

The Owner identified that the preceding implementation simplified the supplied
Access and Security compositions too much. This correction restores their visual
hierarchy while retaining the existing normalized data, routes and permissions.

## Comparison

| View | Previous | Corrected |
| --- | --- | --- |
| Access | [Before](../account-settings-premium/screenshots/chrome-en-owner-access-1440-sapphire-light.png) | [After](screenshots/chrome-en-owner-access-1440-sapphire-light.png) |
| Security | [Before](../account-settings-premium/screenshots/chrome-en-owner-security-1440-sapphire-light.png) | [After](screenshots/chrome-en-owner-security-1440-sapphire-light.png) |
| Access mobile | [390px](screenshots/chrome-en-owner-access-390-sapphire-light.png) | [Arabic 390px](screenshots/chrome-ar-owner-access-390-sapphire-light.png) |
| Security mobile | [390px](screenshots/chrome-en-owner-security-390-sapphire-light.png) | [Arabic 390px](screenshots/chrome-ar-owner-security-390-sapphire-light.png) |
| Rose dark | [Access](screenshots/chrome-en-theme-rose-dark-access.png) | [Security](screenshots/chrome-en-theme-rose-dark-security.png) |
| Pearl light | [Access](screenshots/chrome-en-theme-pearl-light-access.png) | [Security](screenshots/chrome-en-theme-pearl-light-security.png) |
| Firefox | [Access](screenshots/firefox-en-owner-access.png) | [Security](screenshots/firefox-en-owner-security.png) |

Access now includes the tinted portrait area, local identity icon/initials,
role pill, labeled contact details, read-only note, icon-led access rows, inline
Company context and a collection of actual access-context cards. Card labels are
**Access overview**, not fictional memberships. Company and scope come from the
existing normalized view; Operators show their actual currently authorized
Platforms. No new data loading or membership record is introduced. The shared
information row has optional presentation icons and a badge style, neither of
which changes authorization.

Security now has the accent-tinted horizontal summary, title separator, method
icon chips, neutral status dots and badges, and descriptions underneath each
status. The common session explanation follows the details instead of interrupting
the summary-to-details hierarchy. The existing outlined Security link remains.

The reference's green "Reported" method and membership records still cannot be
copied honestly: the session does not provide the method used, enrollment or own
organization memberships. Statuses remain **Not reported**, and membership-shaped
decorations are replaced with actual Company/Platform/scope context. No false
security guarantees, decorative membership records, account switching or editing
operations were added. No new botanical artwork or purple-specific colors.

## Preservation and validation

The normalized account view, session sources, capability checks, demo/live
boundary, account routes, tabs, history and all other Settings sections remain
unchanged. The summary's richer layout applies to Access; Profile retains its
inline summary. Unrelated working-tree changes remain excluded.

- Focused account suite: 119 tests passed before the additional access-card test.
- Final full serial suite: **201 files / 2,586 tests passed**, including that new
  test verifying cards contain only actual authorized records.
- The default validation pipeline ran; existing invitation/create-organization
  dialog timing tests failed under concurrency. They remain untouched and pass
  in the full serial run. No assertions or timeouts were weakened.
- Format, Angular lint, style lint, i18n, token, contrast and brand checks passed.
  TypeScript, final production build and production demo-isolation checks passed.
- The richer identity-summary stylesheet has a 4.50kB size warning against the
  4kB warning budget, below the unchanged 8kB error budget. Existing unrelated
  style-budget and unused eslint-disable warnings also remain.
- Chrome passed **126 checks**: six widths × three sections × en/fr/ar, eleven
  accents × light/dark × three sections, System preference, history/keyboard,
  query scroll retention and zoom-equivalent reflow. Firefox passed sections,
  Operator Access, RTL, compact layout and actual 200% browser zoom. Exact 390px
  checks use Chrome; Firefox's unzoomed minimum width here is 500px.
- [Browser results](browser-results.json), [Firefox results](firefox-results.json),
  [actual test/build output](validation.txt).

Changes are confined to Account Settings presentation components, their focused
access-card test, Account copy in en/fr/ar and this review evidence. No backend,
permission, session or financial logic changed. No push, PR, merge or deployment.

Ready for Owner visual review. Differences that remain are the preserved actual
Nawara shell/artwork, semantic accents, and truthful available account data.
