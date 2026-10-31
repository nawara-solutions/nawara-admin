# Assistance A7 — Disputes and exceptions (business rules)

Status: implemented with Assistance A7 (read only, mock-first). Evidence: nawara-core `0044b20`, re-read for A7 (read-only
checkout of the merge commit). Paths are relative to `apps/billing-service/`. Admin explains these states; Nawara Core decides
every one of them. Nothing here is a command: A7 adds no correction, no resolution and no other owner action.

## Dispute lifecycle (verified)

| Item | Core rule | Evidence |
|---|---|---|
| Who opens | The request's **beneficiary** only (`assistance_dispute."beneficiaryUserId"` is the request's, H-4). No owner, operator or Organization actor route opens one; an owner never acts for a beneficiary. | `db/migrations/0031_assistance_resolution.sql:76-79`; `src/assistance/assistance-resolution.service.ts:103-122` |
| When | The request carries cash evidence (`cash_collected`, `settled` or `returned`); no filing cutoff. `openedAt` is Core's time. | `0031:83`, `:177-183`, `:194` |
| Reasons | `collection_not_made`, `collection_time_incorrect` (any collected request); `cash_not_returned` (a cash-return obligation exists); `return_time_incorrect` (a return was reported). No free text. | `0031:90`, `:178-180`; `src/assistance/assistance.controller.ts:84-86` |
| One at a time | At most one open dispute per request (`assistance_dispute_open_unique`). | `0031:101` |
| Organization's answer | Once per open dispute, by an administrator of the Organization (never the beneficiary): `accepts` or `contests`. Evidence only; it changes no state and closes nothing. | `0031:216-239`; `assistance-resolution.service.ts:126-130` |
| Escalation | `escalationDue`: Core-derived, open for more than seven days. A target only; it closes and starts nothing. | `src/assistance/assistance-settlement.view.ts:34-57` |
| Statuses | `open → resolved`, nothing else; no deletion. | `0031:92`, `:200-212` |
| Resolution | Only `timestamp_corrected` (J-2), only for `collection_time_incorrect` and `return_time_incorrect`, resting on an owner correction of **exactly** the disputed time appended **after** the dispute opened. `cash_not_returned` and `collection_not_made` have **no** resolution (J-1) and stay open. | `0031:93-98`, `:200-207`; `assistance.controller.ts:421-427` |
| What an open dispute holds | The beneficiary's confirmation of a reported return (`409 assistance_dispute_open`, J-4); the owner's L-4 late-settlement application (`dispute_open`); a second dispute. Never a verified electronic settlement, the obligation sweep, an amount or an obligation. It is not a restriction (T1/T2/T3). | `assistance.controller.ts:264-266`, `:311`; `src/late-settlements/late-settlement.service.ts:249`, `:261` |

`refund_dispute_open` (refund cases) concerns **Payment** disputes (`src/refunds/refund-case.service.ts:109`), not assistance
disputes; A7 does not present it as an assistance hold.

## Owner timestamp corrections (verified)

- Fields: `cashCollectedAt` (a collected request) and `returnedAt` (a reported return) only. Nothing monetary is correctable
  (`0031:117`, `:135-160`).
- Append-only (`assistance_correction` rejects update, delete, truncate); each has a `sequence` and Core's `correctedAt`; the
  superseded value is kept; the effective time is the latest correction, else the original (`billing_assistance_effective_time`).
  The original evidence on the request and obligation never changes.
- Never by a party to the request (the beneficiary or the reporting actor); it must keep the recorded time order
  (`422 correction_time_invalid`).
- A correction changes no amount, fee, deadline (`settleBy`), overdue state, obligation, settlement, purchase or payment
  (`assistance.controller.ts:396-399`).

## State-transition and authority matrix

| Transition or action | Beneficiary | Organization admin | Company owner | Operator | Admin (A7) |
|---|---|---|---|---|---|
| Open a dispute (none → `open`) | ✅ BIL-20 `POST /billing/assistance-requests/:id/disputes` | — | — | — | explained, never offered |
| Answer a dispute (`accepts`/`contests`) | — | ✅ BIL-21 | — | — | shown as a report |
| Correct `cashCollectedAt` / `returnedAt` | — | — | ✅ BIL-19, **T2** `billing.assistance.correct` | — | eligibility shown as a **future capability** |
| Resolve (`open → resolved`, `timestamp_corrected`) | — | — | ✅ BIL-22, **T2** `billing.assistance.dispute.resolve`, timestamp reasons only | — | path shown as a **future capability** |
| Resolve `cash_not_returned` / `collection_not_made` | — | — | ❌ no Core path | — | "no resolution in Nawara Core" |
| Confirm a reported return | ✅ BIL-18 (no open dispute) | — | — | — | explained, never offered |
| Read disputes | own (beneficiary) | own Organization | ❌ **no owner read or list** (CF-70) | ❌ | demo projection only |

Owner commands also require the owner of the request's Platform (live) and refuse operators (`assistance.controller.ts:382-386`).

## Exceptions (A7)

Each category is read from the same Core values as the A6 oversight, and each matches an existing A2 directory filter
(`EXCEPTION_FILTER`), so no new read or Core contract is introduced.

| Exception | Core value | Source | Restriction |
|---|---|---|---|
| Collection reported, not settled | request `cash_collected` | report | — |
| Uncertain settlement | channel `uncertain` | derived | — |
| Overdue settlement | Core's overdue (past `settleBy`) | derived | T1 |
| Open dispute | an `open` dispute | report | — |
| Cash return owed | obligation `open` or `return_reported` | derived | T2 |
| Late settlement to review | an unapplied late settlement | fact | — |
| Recovery open | recovery obligation `open` | derived | T3 |

## Admin rules (A7)

- `assistance-disputes.ts` reads standing, holds and correction eligibility; `assistance-exceptions.ts` reads categories. Both
  are pure, compute no amount, deadline or restriction, and never turn a report into a fact.
- The dispute overview (`/billing/assistance/disputes`) reads a demo-only projection (`AssistanceGateway.disputeCases`) of the
  owner's scoped cases; `ASSISTANCE_READ_CONTRACTS.disputeCases` records it as `none` / CF-70 / D-A4. Every other build shows
  "not available"; production binds only the unavailable adapter.
- The A1 dispute and correction types gained Core's representation fields (`openedAt`, `escalationDue`, `response`,
  `resolution.resolvedAt`, `correctedAt`), verified against `representDispute` and `CorrectionDto` at `0044b20`. No other field
  was added.
- No new demo scenario: the A3 cases already cover all four reasons (cases 4, 8, 9, 10). The foreign Company's case gained an
  open dispute so isolation is tested against a real leak candidate. `escalationDue = true` is not seeded (no existing case can
  be open for more than seven days without changing the A3 timings); a spec covers it with a stubbed adapter.

## Uncertainty (not invented)

- No owner read or list of assistance disputes or corrections exists at `0044b20` (CF-70).
- The dispute representation exposes no actor id; Admin shows the role only.
- Restriction rows' `since` and `sourceId` are not modelled (no owner contract to read them).
