# Assistance A8 — Late settlements and cash returns (business rules)

Status: implemented with Assistance A8 (read only, mock-first). Evidence: nawara-core `0044b20`, re-read for A8 (read-only checkout
of the merge commit). Paths are relative to `apps/billing-service/`. Admin explains these states; Nawara Core decides every one of
them. A8 applies nothing, reports nothing, confirms nothing and issues no receipt.

## Late settlements (verified)

| Item | Core rule | Evidence |
|---|---|---|
| What it is | A **Payment-verified** success (an applied `payment.succeeded` of the request's settlement invoice) that arrived after finality (L-1). Core records it; nobody "reports" a late settlement. | `db/migrations/0040_late_settlement_application.sql:44-60` (guard), `0030` |
| Why late | `channel_closed`, `purchase_exists`, `cash_return_obligation_exists`, `request_not_settleable` | `0030:290` |
| Times | `settledAt` is Payment's trusted original instant (unknown only for records before S6g; then L-4 is refused, never invented); `recordedAt` is Core's time | `0040:46-60`; `src/late-settlements/late-settlement.service.ts:157` |
| Status | `unapplied` → `applied`, only by an owner application (L-4). **Never automatic, never by time.** | `late-settlement.service.ts:162` |
| Beneficiary attestation | Once, append-only: `cash_not_returned` or `cash_returned`. A statement, never a financial fact; `cash_returned` makes it inapplicable. The Organization's administrator cannot attest. | `late-settlement.controller.ts:60-75`; service `:198-224` |
| Owner read | `GET /billing/admin/late-settlements/:id` (BIL-32): status, attestation, application (`reasonCode`, `appliedAt`, `appliedBy`, `receiptId`, `purchaseId`, `supersededObligationId`), File evidence references, refund cases | service `:143-171` |
| Discovery | No owner list. Only an **unapplied** one surfaces as a BIL-33 reconciliation case (CF-69), whose list has no end marker (CF-77) | §9 CF-69, CF-77 |
| L-4 application | The owner of the seller Company and of its Platform (live), with an Auth **receipt** `late_settlement_apply` (T3; factor step-up `billing.late_settlement.apply`), bound to Company, late settlement, request, beneficiary and reason code. Path A `cash_not_returned_attested` (the beneficiary's attestation); Path B `cash_not_returned_evidenced` (1–5 File grants + the owner's explicit determination; no human File path, CF-71) | controller `:118-137`; service `:274-320` |
| Refusal order | `already_applied`, `purchase_exists`, `cash_return_confirmed`, `request_not_settleable`, `cash_return_reported`, `dispute_open`, `settlement_in_progress`, `refund_exists`, `evidence_contradictory`, `evidence_insufficient` (Path A), `settlement_time_unavailable`. The database re-checks each one. | service `:243-272` |
| Effect | One transaction: the application, the supersession of the live **open deadline** obligation, the purchase (Payment's instant kept), the request settled; T1 and T2 end for that request only. Nothing else moves. | service `:296-330`; `0040:6-13` |

## Cash returns (verified)

| State | Reached by | Meaning |
|---|---|---|
| `open` | Core's sweep: `cash_collected`, past `settleBy`, no purchase, no `open`/`uncertain` channel, no obligation (E-6); or a refund completion | the Organization owes the frozen total (base + fee); T2 |
| `return_reported` | the Organization's administrator, never the beneficiary (BIL-17) | a **report**: still owed; T2 continues |
| `confirmed_returned` | the beneficiary only, and never while an assistance dispute is open (BIL-18, J-4); the request becomes `returned` | discharged |
| `superseded_by_settlement` | only an L-4 application, only from `open`, only for a `deadline` obligation | discharged; history kept (at most one live obligation) |

`src/assistance/cash-return-sweep.ts:9-24`; `assistance.controller.ts:286-343`; `assistance-resolution.service.ts:68-95`; `0040:17-37`.
The representation carries `openedAt` and `supersededAt` (`assistance-settlement.view.ts:30`).

## Open dispute effects (unchanged from A7)

An open assistance dispute holds the beneficiary's confirmation of a reported return and the owner's L-4 (`dispute_open`). It never
holds a verified electronic settlement or the sweep, and it is not a T1/T2/T3 restriction.

## Authority matrix (A8 actions)

| Action | Beneficiary | Organization admin | Company owner | Operator | Admin (A8) |
|---|---|---|---|---|---|
| Attest about a late settlement | ✅ | ❌ (403) | — | — | shown as a report |
| Report a cash return | ❌ | ✅ BIL-17 | — | — | shown as a report |
| Confirm a cash return | ✅ BIL-18 | ❌ | — | — | shown as a report |
| Apply a late settlement (L-4) | — | — | ✅ BIL-32, **T3** receipt | — | standing and receipt requirement shown as a **future capability** |
| Read a late settlement | own (participant view) | own Organization | ✅ by id (BIL-32) | ❌ | list via the A2 discovery read (CF-69) + detail by id |
| Read or list cash returns | own | own Organization | ❌ (CF-70) | ❌ | demo projection only |

## Admin rules (A8)

- `assistance-late-settlements.ts`: `lateStanding` reads Core's refusal order from Admin-visible facts (`applied`, `refused`,
  `attested`, `needsBasis`); a cancelled refund case is left to Core ("Nawara Core decides", never guessed); `lateHistory`,
  `supersedable`, `cashReturnStanding`, `LATE_APPLICATION_AUTHORITY` (T3 receipt). Pure; no amount computed.
- `/billing/assistance/settlements`: late settlements through the existing `lateSettlements` discovery read, each read by id
  (`lateSettlement`) with its case (`caseDetail`); cash returns through `cashReturnCases`, a demo-only projection recorded as
  `none` / CF-70 / D-A4. Every other build shows "not available"; production binds only the unavailable adapter.
- A1/A2 additions verified at `0044b20`: `CashReturnObligation.openedAt` and `supersededAt`; the late settlement's
  `application.reasonCode`. Nothing else.
- Demo data: case 8 gained a verified late success (`channel_closed`) and the beneficiary's `cash_not_returned` attestation
  (consistent with their open `cash_not_returned` dispute). Core records any verified success after finality (L-1); it shows the
  owner's L-4 held by an open dispute. Expected test expectations for case 8 (its settlement stage, exceptions and the late lists)
  were updated accordingly; no other scenario was added.

## Uncertainty (not invented)

- No owner list of late settlements (CF-69, CF-77) or owner read of cash returns (CF-70); File evidence has no human path (CF-71).
- Whether a cancelled refund case refuses L-4 depends on its relayed authorization, which Admin cannot read.
