Visual correction against `Nawara Admin Account Settings.png`

The previous implementation placed the account heading outside the workspace and removed the Profile panel's visible frame. Its composition therefore differed from the supplied reference.

This correction changes only three account stylesheets:

- `pages/account-settings.page.scss`: one rounded outer account surface now contains the heading, Demo indicator, horizontal divider, left navigation and framed right panel. Navigation uses a wider desktop column, with the tablet reduction applied later. Compact layouts retain horizontal section scrolling.
- `components/account-settings/account-identity-summary.scss`: a larger desktop avatar and an RTL-aware separator recreate the reference's identity grouping. Mobile keeps the smaller avatar and removes the separator.
- `components/account-settings/account-profile-panel.scss`: the single read-only note uses the active accent's subtle surface.

The main Settings tabs and all shell styles remain untouched. The reference's repeated name/email tiles and unavailable phone filler remain omitted, as required by the original account specification. The Profile panel is consequently shorter than the illustrative mockup. It still displays each available fact once, with no invented identity or security information.

Compare [the previous Profile](../account-settings-workspace/screenshots/en-profile-1440.png) with [the corrected Profile](screenshots/en-profile-1440.png). Additional captures: [Access](screenshots/en-access-1440.png), [Security](screenshots/en-security-1440.png), [mobile Profile](screenshots/en-profile-390.png), [Arabic Profile](screenshots/ar-profile-1440.png), [Rose Dark](screenshots/rose-dark-profile.png), [Pearl Light](screenshots/pearl-light-profile.png), and [Operator Profile](screenshots/operator-profile.png).

Validation: focused account suite **132 tests passed**; style lint, TypeScript, changed-file formatting, production build and production isolation checks passed. Existing component stylesheet budget warnings remain. [Validation output](validation.txt).

The Chromium matrix was rerun for all six requested viewport widths, all three languages, all eleven accents in Light/Dark, System appearance, native link focus/Enter, history and both actual authenticated demo roles. [128 recorded cases](browser-results.json) include the previously documented memory-only demo refresh limitation. The existing backend/role/membership limitations are unchanged. Native browser zoom remains covered by a reflow-equivalent viewport rather than an independent native-zoom check.

This is a visual follow-up to commit `c17ac39c469222ad17b9a7cb803d177b5d5b3d53`. No PR, merge or deployment was performed.
