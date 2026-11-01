# Assistance A9 — Recovery obligations and surplus (business rules)

Status: implemented with Assistance A9 (read only, mock-first). Evidence: nawara-core `0044b20`, re-read for A9 (read-only checkout of
the merge commit). Paths are relative to `apps/billing-service/`. Admin explains these states; Nawara Core decides every one of them and
computes every amount. A9 settles, allocates, refunds, records, confirms and writes off nothing.

## Core authority and lifecycle (verified)

| Item | Core rule | Evidence |
|---|---|---|
| Creation | Opened by Core (a worker), once per **verified FULL final lost chargeback** of an **assisted** purchase whose payment had no completed refund (R6F-3, R6F-4). A partial chargeback or a refunded payment goes to `recovery_review` instead: no debt, no T3 | `db/migrations/0039_recovery.sql:5-8`, `:38-62`, `:69-78` |
| Base | The request's frozen **base** only (D5), in its currency: never the Organization's fee, never a chargeback fee. The beneficiary keeps the entitlement (B10) | `0039:52-55`; `test/recovery.e2e-spec.ts:446` |
| States | `open → recovered`, once, only when verified principal reaches the base; immutable otherwise | `0039:37`, `:299-315` |
| Settlement channels | The Organization's administrator starts one (BIL-29): an invoice of producer `billing-recovery` paid by the Organization, for **exactly the outstanding** amount; at most one active (payment request missing or not final) | `0039:81-128`; `src/recovery/recovery.controller.ts:96-117` |
| Recovery payment | Only a **Payment-verified** success: the applied `payment.succeeded` of the channel's payment request, or (S6h-B) Payment's verified **late success** of it, for its captured amount. A submission, response or timeout never is | `0039:240-262`; `db/migrations/0042_reconciliation.sql:66-95`; `src/recovery/recovery-ledger.ts:6-17` |
| Split (the database) | `principal = min(amount, outstanding)`, `surplus = amount − principal` | `0042:89-91` |
| Outstanding | `base − Σ principal` (never below 0 in the read); `recovered = base − outstanding` | `0039:232-236`; `src/recovery/recovery.service.ts:266-268` |
| Surplus | Exactly one payment's excess, owed to the Organization (R-1): **never revenue, never offset, never expiring**, and it never re-opens T3 (R-5) | `0039:280-297`, `:425-440` |
| Surplus resolution | Path A: the completed full refund of an **entirely-surplus** payment (refund case `recovery_surplus`). Path B: the owner's **record** of a repayment outside Core (T3 receipt `recovery_surplus_external` + File evidence; not a provider fact), then the receiving Organization's **confirmation** (BIL-31; never the recorder). One path per surplus | `0039:301-341`, `:358-372`; controller `:121-140`, `:158-185` |
| Read status | `resolved` if refunded or confirmed; `external_execution_evidenced` if recorded; else `owed_to_organization` | `recovery.service.ts:271` |
| T3 | While an obligation of the Organization is `open`: blocks its NEW assistance requests only; never blocks settlement or confirmation | `0039:425-440`; controller `:69` |
| Write-off | Owner, T3 receipt `recovery_write_off` (BIL-34): accounting only; the obligation and T3 follow verified recoveries only | §11.5; `recovery-ledger.ts:40-52` |
| Owner read | `GET /billing/admin/recovery-obligations/:id` (BIL-28): base, recovered, outstanding, currency, status, times, `disputeId`, payments, **channels**, surpluses with `recordedAt`, `externalRecordedAt`, `confirmedAt`, `refundCaseId`. **By id only** | `recovery.service.ts:246-273`; controller `:144-157` |
| Discovery | No owner list. An obligation surfaces only through its surplus as a BIL-33 reconciliation case (`recovery_surplus`): CF-68; and that list has no end marker: CF-77 | §9 CF-68, CF-77 |

Recovery and surplus are **one case**: every surplus belongs to its obligation, which belongs to one assistance request. Admin keeps that
nesting (`RecoveryObligationDetail.surpluses`).

## Arithmetic

Admin computes **no** amount. `recovered`, `outstanding`, each payment's `principalAmount` and `surplusAmount` and each surplus's amount
are Core's values, displayed as stated. Amounts are integers in the minor units of the obligation's ISO 4217 currency (Core:
"minor units", `currency char(3)`); the display exponent comes from ISO 4217 through `Intl` (`AssistanceMoneyPipe`), never assumed or
converted. Which currencies a deployment accepts is an open Core decision (B-005). The seed specs replay Core's split to check the demo
data, never to display anything.

A payment in progress (an active channel) is not a recovery; a settled channel's payment is a recovery only once Payment verified it; a
recovered obligation is never inferred from a settled assistance channel or purchase.

## Actor permissions

| Action | Organization admin | Company owner | Operator | Beneficiary | Admin (A9) |
|---|---|---|---|---|---|
| Read an obligation | ✅ own (BIL-28) | ✅ by id (BIL-28) | ❌ | ❌ (403) | demo read |
| List obligations | — | ❌ (CF-68) | ❌ | — | demo projection |
| Start a settlement | ✅ BIL-29 | ❌ | ❌ | ❌ | not offered |
| Record an external surplus repayment | ❌ | ✅ BIL-30, T3 receipt + File evidence | ❌ | ❌ | not offered |
| Confirm a surplus repayment | ✅ BIL-31 (never the recorder) | ❌ | ❌ | ❌ | not offered |
| Refund an entirely-surplus payment | ❌ | ✅ refund case, T3 receipt `refund` | ❌ | ❌ | not offered |
| Write off | ❌ | ✅ BIL-34, T3 receipt | ❌ | ❌ | not offered |

Admin's capability stays `company.assistance.view` (owner only, read only); no financial capability is added.

## UI scope

- `/billing/assistance/recovery` (before `:requestId`): obligations through the existing discovery read (`recoveryObligations`, state and
  "surplus still owed" filters, keyset pages), each read by id (`recoveryObligation`) with its case (`caseDetail`: restrictions) and the
  case's late settlements (`lateSettlement`). Each row: case, Organization and Platform, why it exists (the dispute reference), owed /
  recovered / outstanding (each with its source), payments with Core's split, surpluses payable to the Organization and their stage,
  settlement attempts, history, related late settlements and the Organization's restrictions (T1/T2/T3 are the Organization's, so a
  recovered obligation still shows T3 while another of its Organization is open).
- Case page: the recovery section keeps its A5 summary and gains why it exists and the same standing (no repeated summary).
- `domain/assistance-recovery.ts`: `surplusStage`, `recoveryStanding`, `recoveryHistory`, `RECOVERY_AUTHORITY`. Pure.

## Explicitly unsupported

Recovery collection or allocation, starting a settlement, surplus repayment record or confirmation, surplus refund, write-off, payment
capture or settlement, late-settlement application, receipt issuance or consumption, any financial mutation, any HTTP adapter.

## Data changes (verified)

- Types: `RecoveryObligationDetail.channels` (`RecoveryChannelView`), each payment's `paymentRequestId`, and each surplus's `recordedAt`,
  `externalRecordedAt`, `confirmedAt`, `refundCaseId`; `RecoveryFilter.surplusOwed` (mirrors Core's only discovery path).
- Seed: the A3 cases 13 and 14 recover by partial amounts; Core reaches such amounts only through Payment's verified **late successes**
  (S6h-B: the captured amount, not the request amount). They now carry the channels that make this explicit (each ended unpaid; case 13
  has a second channel in progress for exactly the outstanding amount). Case 14 gains one entirely-surplus late capture whose surplus the
  owner recorded as repaid outside Core (Path B, awaiting the Organization): a verified state not represented before. Amounts already
  shown by A5–A8 are unchanged.

## Missing Core prerequisites

CF-68 (owner discovery of recovery obligations), CF-77 (BIL-33 end marker), CF-70 (owner case read for the restrictions and context),
CF-71 (human File evidence path, Path B), CF-74 (no-key receipt consumers: the external surplus record), D-A4, and the Billing owner
routes being development-only.
