# Assistance A6 — Cash collection and settlement oversight (business rules)

Status: implemented with Assistance A6 (read only, mock-first). Evidence: nawara-core `0044b20`, billing-service
`db/migrations/` (paths below are relative to `apps/billing-service/`). Admin explains these states; Nawara Core decides every
one of them. Nothing here is a command.

## Distinctions the screens keep

| Concept | What it is (Core) | Source shown | Evidence |
|---|---|---|---|
| Cash collection | The Organization administrator's REPORT that the WHOLE frozen total was collected in cash. No amount in the report, no partial collection. "A cash-collection report is evidence, never settlement." | Reported | `0029_assistance_request.sql:8-11`, `:33-49` |
| `cashCollectedAt` / `settleBy` | `cashCollectedAt` is the asserted event time; `reportedAt` is Core's time; `settleBy` is exactly `cashCollectedAt + 72 hours`. | Reported / derived | `0029:10`, `:59`, `:121` |
| Overdue | DERIVED, never stored: unresolved and the database time is past `settleBy`. Admin never computes it from a clock. | Derived | `0029:12-13`; `billing_assistance_overdue` |
| Settlement channel `open` | The electronic settlement invoice's payment request exists (created or requested). Not settled. | Derived | `0030:5-7` |
| Settlement channel `uncertain` | Being sent: Payment may or may not hold it. Not settled. | Derived | `0030:6-7` |
| Settlement channel `settled` | Only together with the request's purchase: a Payment-verified success. The electronic settlement charges the frozen BASE only (never the Organization fee). | Verified fact | `0030:8`, `:10-16` |
| Settlement channel `closed` | Only on an authoritative final unsuccessful outcome (failed, cancelled, expired, rejected), never on time. | Verified fact | `0030:7` |
| Late settlement | A verified success that could not apply (E-7) is recorded append-only; it settles nothing until the OWNER applies it (L-4). Never automatic. | Fact; application is a decision | `0030:15-16`; `0040_late_settlement_application.sql` |
| Cash return | Opened only by Core's sweep past `settleBy` with no purchase, no open or uncertain channel and no obligation; owes the frozen TOTAL (base + fee). `open → return_reported` (a REPORT: it does not discharge the obligation) `→ confirmed_returned` (the beneficiary); `open → superseded_by_settlement` (an applied late settlement). | Derived / reported / decision | `0030:17-19`; `0040:6`, `:23-27` |
| T1 | A `cash_collected` request past its `settleBy`. Clears when the request is settled or returned. | Derived | `0039_recovery.sql:425-440` |
| T2 | A cash-return obligation `open` or `return_reported`. Clears when confirmed or superseded. | Derived | `0039:425-440` |
| T3 | An `open` recovery obligation. Clears when verified recovered principal reaches the base. | Derived | `0039:425-440` |
| Restrictions' effect | Block NEW assistance requests of the Organization only; settling and returning stay possible. | — | `src/assistance/assistance-restrictions.ts` |
| Disputes | Opened by the beneficiary; at most one open. Only `collection_time_incorrect` and `return_time_incorrect` resolve, and only by an owner timestamp correction; `cash_not_returned` and `collection_not_made` have no resolution (J-1). | Reported; resolution a decision | `0031_assistance_resolution.sql:76-200` |
| Recovery and surplus | The BASE of an assisted purchase lost to a full final chargeback; recovered principal and outstanding are Core's values; a surplus is owed to the Organization (never revenue). | Derived / fact | `0039:20-45`, `:253-290` |

## Admin rules (A6)

- `assistanceOversight()` (`src/app/features/assistance/domain/assistance-oversight.ts`) reads these states into stages and never
  computes an amount, a deadline, overdue or a restriction.
- A collection is always tagged **Reported**. Only a `settled` channel (or an owner-applied late settlement) shows a verified
  settlement. A reported return is still owed until the beneficiary confirms it.
- No partial collection, no monetary correction, no command, no automatic transition.

## Uncertainty (not invented)

- Admin has no owner read of these records at `0044b20` (CF-70; CF-68, CF-69); the screens read the A3 simulated cases.
- Core's restriction rows carry `since` and `sourceId`; Admin's read model keeps kinds only (no owner contract to read them).
- A case can in principle have more than one cash-return obligation over time (one at a time, `0040:6`); the directory shows the
  latest, the case page lists them all.
