# Assistance acceptance report (A12)

**Classification: mock-first frontend acceptance — not production financial certification.** Every record seen in this acceptance is a
deterministic demo record (`src/app/demo/world/assistance/assistance.seed.ts`) that follows Nawara Core's rules at `0044b20`. No Core
read or command was exercised: every Assistance read is demo-only or unavailable (§8), Billing's owner routes are development-only, and
the browser session decision (D-A4) is open. Acceptance means the Admin module shows Core's states faithfully, safely and accessibly on
those records; it does not certify any money movement.

Date: 2026-11-01. Admin baseline: `main` at `0a4129f` (A11 merged, PR #71). Core evidence baseline: `0044b20` (unchanged since A7).

## 1. Accepted UX decisions (owner, A12)

| Decision | Status |
|---|---|
| Filter changes replace the current history entry (back leaves the view instead of stepping through filters) | **accepted**, unchanged from A11 |
| "Show more" (keyset) depth is not restored; a restored view reads its first page again | **accepted**, unchanged from A11 |
| Case pages keep their contextual back link; the Assistance section navigation is not added there | **accepted**, unchanged from A11 |

## 2. Tested journeys

| Journey | Evidence |
|---|---|
| Billing → directory → (URL filter) → case → disputes (case link) → settlements → recovery (section navigation) → case → evidence, history, restrictions → back to recovery → browser back to the case | `pages/assistance-acceptance.spec.ts` "the owner journey end to end" |
| Bookmarks of each view with filters, each applied and with the right current section | acceptance spec "bookmarks" |
| Case → back to the originating list with its filters; deep link → directory; case → case keeps the way back | `pages/assistance-navigation.spec.ts` (A11) |
| Browser back and forward restore view and way back | navigation spec |
| Directory search restored from the address; untrusted address values dropped | navigation spec, `application/assistance-url-state.spec.ts` |
| States on every view: loading, empty Company, no match, not found, forbidden, not in this build, unavailable + Retry | acceptance spec (unavailable, empty, production, operator), page specs A4–A10 (loading, error, retry) |
| Keyboard-only use of every view; visible focus on every stop | rendered checks (`rendered-checks.txt`, keyboard rows) |

## 3. Core business invariants (verified on every demo case, as rendered)

`pages/assistance-acceptance.spec.ts` "holds every invariant on each of the Company's cases" renders all 15 cases of the demo Company
through the real routes and checks each invariant; the domain specs (A1–A10) check the same rules on the data.

| Invariant | Core source (billing-service, `0044b20`) | Admin check |
|---|---|---|
| A reported cash collection is never a verified settlement | `0029_assistance_request.sql:11` (evidence, never settlement) | the collection is tagged *Reported*; the "settled by a verified payment" words appear only for Core's settled channel; every history report reads `reportedOnly` |
| Late payments are never applied automatically | `0040` L-4 owner application; `late-settlement.service.ts` | "applied" only where the owner's application exists, per case |
| A cash-return report is not a beneficiary confirmation | `0031:244-300`, `0040:232-242` | a confirmation time only when the beneficiary confirmed; report and confirmation are separate evidence items |
| Owner corrections preserve original facts | `0031:117-160` (append-only, original kept) | the reported time stays beside the time in force; each correction is an evidence item with its superseded value |
| Disputes hold only Core-authorized operations; never a restriction | `assistance.controller.ts:264-266`, `late-settlement.service.ts:249` | no restriction row rests on a dispute; dispute holds as A7 |
| Recovery is the base only; recovered and outstanding are Core's | `0039_recovery.sql:52-55`, `recovery.service.ts:266-268` | base equals the frozen base; the three amounts shown are the record's values |
| Surplus semantics (owed, recorded, confirmed, refunded; never revenue) | `0039:280-372` | A9 domain and page specs; external record shown as an owner decision whose File is not in the owner read |
| Evidence ids never become links, downloads or uploads | file-service `grant.controller.ts:41-42` (no human route), CF-71 | no link, download, file input or embed in the evidence register; each Path B grant shows its grant and file ids |
| T1/T2/T3 provenance is accurate | `0039:425-440`; BIL-26 `assistance.controller.ts:452-476` | the rendered rows equal the model's rows (kind and source id) for each case's Organization |
| No financial command executes | gateway is read-only (A2 contract test) | no button, form or text entry on any case; the only controls are the history's view controls |

## 4. Authorization and isolation

| Check | Result |
|---|---|
| Company owner | full read-only access through every Assistance route |
| Operator | refused on every Assistance address, deep links included (`/forbidden`; no gateway read) |
| Cross-Company | another Company's cases, disputes, obligations and Organizations are the collapsed not-found; never rendered |
| Cross-Platform | Drive (no assistance) shows no match; a Platform outside the Company is not found |
| Unknown / malformed references | unknown, malformed and foreign case references give the same not-found; a partial search reference is dropped from the address and never sent |
| Production bindings | every Assistance view shows "Not available in this build", never an empty result |
| Production bundle | `check:production`: no demo session, mock adapter or fixture in the production build |
| New permissions / HTTP adapters | none |

## 5. Localization and accessibility

- EN/FR/AR key parity and non-empty values for every Assistance key (acceptance spec; `check:i18n` for the whole catalog).
- Arabic RTL: `dir="rtl"`, mirrored layout, Core references kept left-to-right (`<code dir="ltr">`).
- Rendered matrix (108 views: desktop, tablet, mobile × light, dark × EN, FR, AR × six views) and 11 accents × two views: no horizontal
  overflow, one `h1`, no heading skip, every `nav` named and names unique, every section labelled by its heading, every icon decorative
  or named, every visible control named, no console error. Lowest rendered contrast among the audited Assistance texts: **5.02:1**
  (AA requires 4.5:1); `check:contrast` passes for all token pairs × 22 theme/palette combinations.
- Keyboard: every Assistance view is fully operable; every stop shows a visible focus indicator; the section navigation is the first
  stop of each list view.
- Reduced motion: no transition or animation longer than 10 ms on any Assistance view.
- Status descriptions: counts and outcomes use `role="status"`, notes `role="note"`; sources are words and icons, never colour alone.

## 6. Defects found and fixed in A12

| Defect | Fix |
|---|---|
| French Assistance copy could start a line with ";" or ":" (an ordinary space before French high punctuation) | a no-break space in the 78 affected `assistanceCases` French strings; a regression test. The rest of the catalog has the same pattern (309 places): recorded as **QF-2** (`docs/ROADMAP.md`), outside Assistance scope |

No financial, authorization or navigation defect was found. Test-side only: the A11 routed harness moved to
`features/assistance/testing/assistance-routed-testing.ts` (the existing `testing/` convention) and accepts a demo scenario.

## 7. Reliability

- Flakiness baseline before any A12 change: three consecutive full runs on `main` `0a4129f`, 179 files / 2109 tests each, no failure.
- QF-1 (the timing-sensitive P9-S4b spec) did not recur and is unrelated to Assistance; it stays tracked separately.
- No existing assertion was weakened.

## 8. Known limitations and remaining Core blockers

- Keyset pages are not restored; the way back from a case depends on history state (a new tab or a bookmark returns to the directory).
- Narrower desktops truncate the four-level breadcrumb trail (the shell's existing design).
- Every Assistance read is demo-only or unavailable until Core provides: owner reads of requests, obligations, disputes and corrections
  (**CF-70**), owner discovery of recovery obligations and late settlements (**CF-68**, **CF-69**) with an end-of-results contract
  (**CF-77**), a human File path (**CF-71**), and production Billing owner routes; plus the browser session decision (**D-A4**). Owner
  financial commands remain out of scope (F1 slices not authorized).

## 9. Visual and CI evidence

- Rendered checks: [`rendered-checks.txt`](rendered-checks.txt) (design tokens byte-identical to the published 0.1.0).
- Local `npm run validate` and GitHub Admin CI results are listed in the A12 pull request.
