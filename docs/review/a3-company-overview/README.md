# A3-S1 review: bounded shell + Company Overview (2026-10-02)

Owner-authorized slice: the A3 infrastructure the approved Company Overview needs, built with **explicit mock adapters and a
mock owner session**, labelled **"Demo data"**. Branch `feat/admin-a3-company-overview` (from merged A2, `4d43a65`); not
committed. Scope and deferrals: [`../../ROADMAP.md` § A3-S1](../../ROADMAP.md#a3-s1-bounded-a3-shell--company-overview-slice-owner-authorized-2026-10-02).

**Visual target:** the latest reference, `nawara-solutions/Nawara Admin Company Overview Dashboard.png` (1536 × 1024, light).
Its numbers, statuses and items are sample data; the implementation reuses them as **fictional** demo data. Fidelity was
matched in **light mode at the same viewport**, then the dark variant was derived; the dark variant is not compared to the
light reference.

> **Superseded visually (2026-10-02):** the page was rebuilt to the owner's claude.ai design. The current evidence is the
> section [Owner design](#owner-design-2026-10-02) below; the sections after it describe the previous reference build.

## Owner design (2026-10-02)

Source: claude.ai design project, `Nawara Owner Dashboard.dc.html` and `Nawara Responsive Showcase.dc.html` (tablet 820,
mobile 390, mobile drawer). Decisions, changes and omissions: [`../../ROADMAP.md` § A3-S1](../../ROADMAP.md).

| Check | Result |
|---|---|
| `npm run validate` | exit 0: Prettier, ESLint (0 errors; the one warning is the Console Ninja extension in `src/main.ts`), Stylelint, i18n (265 keys × en/fr/ar), contrast (89 pairs × 2 themes), 29 test files / 106 tests, production build 332.88 kB initial with no budget warning, `check:production` |
| Rendered matrix (headless Chrome, dev build) | 10 renders: desktop 1440 light/dark × EN/FR/AR, laptop 1280, tablet 820, mobile 390 light EN and dark AR, mobile drawer light/dark. Correct `lang`/`dir`/theme, no horizontal overflow, no broken image, no console error or warning |
| Text over the illustrations | measured per text element on the renders (sidebar labels, group labels, profile, header title and subtitle): lowest 4.85:1, the active "Overview" item on its pink background |
| Drawer | opens from the menu button, focus moves to the first navigation link; close button, scrim and Escape close it |

Screenshots: [`screenshots/owner-design/`](screenshots/owner-design/).

**Not verified:** a real screen reader; browsers other than Chrome; axe (not a project dependency, D-A2-5) was not re-run.

## How to see it

- `npm start` → <http://localhost:4200/overview> (development build: demo owner, mock adapters).
- `npm run build` (production) has **no** session and **no** demo code: `/overview` shows "Sign-in is not available yet".
- The A2 gallery is at `/foundation`.

## Evidence

| File | Content |
|---|---|
| [`validate-output.txt`](validate-output.txt) | `npm run validate`, exit 0 |
| [`rendered-checks.txt`](rendered-checks.txt) | 18 renders, measured sidebar contrast (12 cases), keyboard, scope, drawer, disclosure, production |
| [`screenshots/reference-vs-implementation-light.png`](screenshots/reference-vs-implementation-light.png) | the reference beside the light implementation, both 1536 × 1024, full resolution |
| [`screenshots/reference-vs-implementation-dark.png`](screenshots/reference-vs-implementation-dark.png) | the reference beside the dark variant (for orientation only) |
| `screenshots/desktop-{light,dark}-{en,fr,ar}.png` | all six desktop combinations (1536 × 1024) |
| `screenshots/laptop-light-en.png`, `laptop-dark-ar.png` | 1280 × 800 |
| `screenshots/mobile-light-en.png`, `mobile-dark-ar.png`, `mobile-drawer-light-en.png` | 390 × 844 |
| `screenshots/platform-scope-light-en.png`, `production-no-session-light-en.png` | platform scope placeholder; production build |

## Results

| Check | Result |
|---|---|
| Prettier, Stylelint | pass |
| ESLint | 0 errors. One warning at `src/main.ts:5:53` comes from the Console Ninja VS Code extension injecting into the Angular lint builder; `npx eslint src` directly is clean |
| `check:i18n` | 255 keys in each of en, fr, ar; 281 static references |
| `check:contrast` | 69 token pairs × 2 themes |
| Unit tests | 29 files, 98 tests |
| Production build | 319.14 kB initial; no budget warning |
| `check:production` | the production bundle contains no demo session, mock adapter or fixture |
| Rendered matrix | 18/18 (light/dark × EN/FR/AR × desktop/laptop/mobile): correct `lang`/`dir`/theme, no horizontal overflow, no broken image, no console error, axe 0 violations |
| Geometry at 1536 × 1024 (light, EN) | rows within about 6 px of the reference (summary 100 px, platforms + attention 264 px vs 276, access + activity 187 vs 181, growth + commercial 174 vs 173); health strip 100 vs 81; page 1053 px tall vs 1024; no card heading wraps in EN, FR or AR |
| Sidebar contrast over the illustration | measured on the rendered background: passes in all 12 cases (light/dark × EN/AR × desktop 1536 × 1024, laptop 1280 × 720, mobile drawer). Worst 4.85, which is the active "Overview" item on its own pink background, not text over petals |
| Keyboard | skip link first; every stop has a visible focus ring; the Demo data disclosure opens with Enter and closes with Escape (focus kept); disabled actions and unbuilt sidebar items are not stops; the drawer moves focus in and back |
| Scope | switcher and Open platform → `/platforms/:id`; unknown platform → one "not found or not accessible" state; unbuilt route → "Page not found" |

**Not verified:** a real screen reader; browsers other than Chrome; 400 % zoom.

## What the tests guard

- **Scope isolation:** operators get no company capability whatever their assignments; the facade calls none of the three
  gateways for them; the route guard sends them to `/forbidden`.
- **Adapter configuration:** production refuses demo data; the overview, commercial and health domains bind `unavailable`
  adapters outside demo builds and never load mocks.
- **States:** each of the three loads has its own view state; a failing commercial or health summary never hides the overview;
  unavailable metrics render "—" + "Not available", never 0.
- **Domain rules:** unique identities ≤ memberships and never their sum; operator assignments (5) are not unique operators (4);
  Auth is in the health strip; pending invitations have no trend; activity times are relative ("10:42", "Yesterday").

## Remaining visual differences from the reference (honest list)

| Reference | Implementation | Why |
|---|---|---|
| Create platform: active gradient button | disabled, with an accessible explanation | owner decision; real flow needs A4 step-up + cutover |
| Bell with an unread dot, avatar in the top bar | omitted | no notification source; no account menu yet |
| ⋮ menus on platform rows; chevrons on attention rows | omitted | no lifecycle actions; target pages not built |
| "View all platforms", "View audit log", "Account security", "Manage access", commercial links, "View services": live buttons | disabled buttons | destinations not built |
| "Last 30 days ▾" dropdown | static period chip | no period selection exists in Core |
| "7 invitations awaiting acceptance" | "7 · Invitations awaiting acceptance" | count kept separate so FR/AR need no plural forms |
| "5 assignments across 2 platforms." | "Assignments 5 · Unique operators 4 · Platforms 2" | owner instruction to distinguish assignments from unique operators |
| Seven services | eight, with Auth first | owner instruction (the reference omitted Auth) |
| "Core services status for Nawara Solutions." | "Illustrative statuses of Nawara Core services, not live health." | demo statuses must not imply live health |
| Bold (700) headings and values | semibold (600) | only Plex weights 400/500/600 are loaded (A2); adding 700 is a separate decision |
| Icons with heavier strokes; vivid icon tiles | Lucide at the A2 stroke (1.75) on the A2 accent tiles | design-system defaults kept |
| Faint floral wash behind the header | none | restrained decoration |
| Large, saturated sidebar petals behind the labels and orbit arc around the logo | softer petals masked under the text column; no orbit around the logo | measured text contrast; the logo artwork is not decorated |
| Times "10:42" | "11:42 AM" in en (12-hour clock), browser time zone | locale conventions; time-zone preference is later work |
| Everything fits in 1024 px | page 1053 px tall (health strip 19 px taller, rows within about 6 px) | slightly larger type and line heights from the A2 scale |
| At 1280 × 800 the reference was not drawn | some labels and "Recent administrative activity" wrap at laptop width; FR "Problèmes de paiement" wraps in its tile at 1536 | narrower columns; no heading wraps at the reference viewport |

## Remaining limitations

- **Logo:** the sidebar lockup is the board's own pixels (368 px wide, about 1.8× at display size), not vector. Official vector
  files are still needed (D-A2-6).
- **Sidebar illustration:** drawn by Admin in the reference's direction; not brand artwork; proposal for owner review.
- **Backend:** every overview figure, list, chart and item is 🔴 (hierarchy, identities, access, attention, history, activity)
  or 🟡 (commercial: Billing/Payment V2 A10/A11; service health: CF-06, V2 A12) in Core V1; Create platform is 🟢 as a
  contract but blocked by the cutover. See [`../../CORE-INTEGRATION.md`](../../CORE-INTEGRATION.md) §7, §9.
