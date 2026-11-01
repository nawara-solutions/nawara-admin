# Assistance A11 — Navigation and workflow integration

Status: implemented with Assistance A11 (read only, mock-first). A11 connects the existing A4–A10 screens as one owner oversight
experience. It adds no route, no read, no Core contract, no financial command and no permission. Core evidence baseline: nawara-core
`0044b20` (unchanged since A10; no Core contract was re-interpreted).

## 1. Audit before A11 (gaps found)

| Journey | Before A11 | Gap |
|---|---|---|
| Billing → Assistance | "Assistance cases" link on `/billing` (owner only) | none |
| Breadcrumbs | `Company › Billing › Assistance` on the directory; `Company › Assistance › Disputes` (and Settlements, Recovery, Case) below it | **inconsistent**: Billing was dropped below the directory (the breadcrumb supported one parent only) |
| Directory → overviews | three inline links in the directory header | **inconsistent**: no shared section navigation, no current-view indication |
| Overview → other overviews | none; only "All assistance cases" back to the directory | **missing**: disputes ↔ settlements ↔ recovery took two steps |
| Directory filters, order, search | in memory (facade signals) | **broken continuity**: opening a case and coming back, a reload, a deep link or back/forward reset every filter |
| Overview filters | in memory | same |
| Case → back | "All assistance cases" → `/billing/assistance`, always | **misleading**: a case opened from an overview returned to the directory, unfiltered |
| Case → overviews, evidence, restrictions | contextual links (A7–A10) | none |
| Case → another case (restriction source, A10) | plain link | the way back was lost |
| Secondary lists' outage (exceptions, cash returns) | a bare sentence, no retry | **inconsistent** with every other unavailable state |
| Sidebar | one "Billing & payments" item, not exact, active on every Assistance page | none (no duplicate item added) |

## 2. Final route map (unchanged routes)

```text
/billing                                  Billing & payments (P7-S3)             Company › Billing
/billing/assistance                       Case directory (A4, A6)                Company › Billing › Assistance
/billing/assistance/disputes              Disputes and exceptions (A7)           Company › Billing › Assistance › Disputes and exceptions
/billing/assistance/settlements           Late settlements and cash returns (A8) Company › Billing › Assistance › Late settlements and returns
/billing/assistance/recovery              Recovery and surplus (A9)              Company › Billing › Assistance › Recovery and surplus
/billing/assistance/:requestId            One case (A5–A10)                      Company › Billing › Assistance › Case
```

Every Assistance route keeps its own `capabilityGuard('company.assistance.view')` (owner only) and its gateway binding (the demo adapter
in a demo build, the unavailable adapter otherwise). The fixed paths stay before `:requestId`.

## 3. Navigation decisions

- **Breadcrumbs** accept a chain of parents (`BREADCRUMB_PARENT_DATA` as an array, outermost first; a single object still works; an
  ill-formed chain is dropped whole, never shown partially). Every page below the directory shows `Company › Billing › Assistance › page`.
- **Section navigation** (`ui/assistance-section-nav.ts`): one labelled `nav` landmark on the directory and the three overviews, with the
  four views in working order (Cases, Disputes and exceptions, Late settlements and cash returns, Recovery and surplus). The current view
  has `aria-current="page"`, a heavier label and an underline (never colour alone); matching is exact on the path and ignores the query,
  so the directory is never current on an overview. It replaces the directory's three inline links and the overviews' back links. It is
  not on the case page (a case is not a section; it has its back link and breadcrumbs). The global sidebar is unchanged.
- **Back from a case** returns to the list the case was opened from (directory, disputes, settlements or recovery), with that list's
  filters, and says so ("Back to recovery and surplus"). The list's address travels as history state on the case link
  (`assistanceReturn`), so it survives back and forward; it is untrusted and accepted only when it is one of the four list paths (no
  other address, no fragment, never an open redirect). A deep link, a bookmark or a reload without that state returns to the directory.
  A link from one case to another (an A10 restriction source) passes the same way back on.
- Section links open each view's default; a view's own filters are in its address (below), not remembered across views.

## 4. Context preservation (URL-backed state)

| View | Query parameters (defaults are omitted) | Source of truth |
|---|---|---|
| Directory | `ref` (a full case reference), `platform`, `state`, `channel`, `attention`, `order` | `directoryQueryOf` |
| Disputes and exceptions | `state` (`open` by default; `all` for every state), `reason`, `exception` | `disputesQueryOf` |
| Late settlements and cash returns | `late`, `return`, `disputed` | `settlementsQueryOf` |
| Recovery and surplus | `state`, `surplus=owed` | `recoveryQueryOf` |

- The facades read their query from the address (`application/assistance-url-state.ts`, `pageQuery`) and write it back on every change
  (`writePageQuery`), **replacing** the history entry, so back leaves the view instead of stepping through filters. A reload, a deep link,
  back and forward, and a return from a case all show the same view.
- Every value read from the address is untrusted: anything outside Core's closed sets, a partial reference or a repeated parameter is
  dropped and never sent. A Platform id outside the Company is Core's not found, as before.
- Only machine values the owner already sees are written (states, reasons, order, a Platform id, a case reference — the same ids already
  in `/platforms/:id` and `/billing/assistance/:id`). No secret, receipt, step-up or authorization data; nothing in browser storage.
- **Not restored:** keyset pages ("Show more"). A cursor is valid only for the list it came from, so a restored view reads its first page
  again; the owner asks for more again. Restoring deeper pages would mean replaying cursors the gateway contract does not promise to keep
  stable (and BIL-33 has no end marker, CF-77).

## 5. Permission boundaries (unchanged)

- Owner only: each route's capability guard sends an operator to `/forbidden` (deep links included); each facade refuses before any read.
- Company/Platform isolation stays in the gateway (`assistanceReadContext`, the demo adapter's scoping). Unknown, malformed and
  another Company's case references keep Core's one collapsed not-found.
- No financial capability, command, receipt or step-up is added; the F1 coordinator is untouched.

## 6. State handling

| State | Directory | Overviews (each list) | Case |
|---|---|---|---|
| Loading | data-state loading | data-state loading | data-state loading |
| No case at all | "No assistance cases" | "none" line (per list) | — |
| No match for the filters | "No case matches these filters." + Show all cases | "none" line | — |
| Unknown / cross-scope | not found (search, Platform) | — (Company scope) | collapsed not found |
| Forbidden | forbidden | forbidden | forbidden |
| Not in this build | "Not available in this build" | the same | the same |
| Unavailable | data-state error + Retry | data-state error + Retry (**now also the second list**) | data-state error + Retry |
| Error | data-state error + Retry | data-state error + Retry (**now also the second list**) | data-state error + Retry |
| Demo | badge + simulation note | badge + simulation note | badge + simulation note |

Kept intentionally different: the overviews show a quiet "none" line per list (two lists per page; an empty list is information, not a
page state), and a Company-scope not-found in an overview list reads as "none" (A7 decision: in Company scope Core's 404 can only mean the
Company itself). "Not available in this build" is never shown as an empty result, and a reported collection is never shown as settled
(A5–A10 rules unchanged).

## 7. Known limitations

- Keyset pages are not restored (§4).
- The way back from a case depends on history state: opening a case in a new tab, or from a bookmark, returns to the directory.
- Section links do not remember another view's last filters (no browser storage by design).
- The four-level trail (`Company › Billing › Assistance › page`) uses the shell's existing truncation on narrower desktops (at 1280 px
  the earliest crumbs give way first; at 1440 px it shows in full; below the desktop breakpoint only the page is shown). A11 does not
  change the global breadcrumb design.
- On a narrow screen the section navigation scrolls inside its own row and keeps the current view visible (scrolled into view instantly,
  so reduced motion is respected); the page itself never scrolls sideways.
- Every Assistance read is still demo-only or unavailable: CF-68, CF-69, CF-70, CF-71, CF-77, D-A4 and the Billing owner routes being
  development-only. No new Core follow-up.

## 8. A12 acceptance prerequisites (owner decisions) — decided 2026-11-01

All three were decided by the owner for A12 and are recorded as accepted UX decisions in
[`review/assistance-a12/README.md`](../review/assistance-a12/README.md) §1:

- filter changes keep **replacing** the history entry;
- "Show more" depth is **not** restored;
- case pages keep their contextual back link; the section navigation is **not** added there.

## 9. Evidence

Tests: `pages/assistance-navigation.spec.ts` (real Billing routes and demo bindings: Billing entry, section navigation, filters through
case → back, back/forward, deep links, overview returns, case-to-case, collapsed not-found, operator refusal, production bindings, FR/AR,
keyboard), `application/assistance-url-state.spec.ts`, breadcrumb chain tests. Rendered checks:
[`review/assistance-a11/rendered-checks.txt`](../review/assistance-a11/rendered-checks.txt).
