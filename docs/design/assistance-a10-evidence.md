# Assistance A10 — Evidence, audit history and restrictions (business rules)

Status: implemented with Assistance A10 (read only, mock-first). Evidence: nawara-core `0044b20`, re-read for A10 (read-only checkout
of the merge commit). Paths are relative to `apps/billing-service/` unless stated. Admin shows what Core holds; Core decides every state.
A10 uploads, opens, downloads, corrects, resolves, applies, records, issues and consumes nothing.

## Evidence Core holds (verified)

| Evidence | What Core stores | File | Owner read | Evidence |
|---|---|---|---|---|
| Cash collection report | asserted `cashCollectedAt`, Core's `reportedAt`, the reporter; immutable | none: the report is the evidence | none (CF-70) | `db/migrations/0029_assistance_request.sql:11`, `0031:47-50` |
| Cash return report, beneficiary confirmation | `returnedAt`, `returnReportedAt`, reporter; `confirmedAt`; immutable | none | none (CF-70) | `0031:244-300`, `0040:232-242` |
| Assistance dispute | a closed reason code; **no free text, no evidence store** | none | none (CF-70) | `src/assistance/assistance-input.ts:69` |
| Organization's dispute answer | `accepts` / `contests` and its time; evidence only | none | none (CF-70) | `0031:216-223` |
| Owner time correction | field, superseded and corrected value, reason code, `sequence`, `correctedAt`; append-only; the original stays | none | none (CF-70) | `0031:117-160` |
| Verified late success | the payment request, Core's `recordedAt`, Payment's instant | none | BIL-32 | `src/late-settlements/late-settlement.service.ts:150-174` |
| L-4 Path A | the beneficiary's attestation; **carries no file** | none | BIL-32 | `late-settlement.service.ts:99-100` |
| L-4 Path B | 1 to 5 File `settlement_evidence` grants, each verified live by Billing; append-only | `{grantId, fileId, verifiedAt}` | BIL-32 | `0040:116-122`; `late-settlement.service.ts:158`, `:171` |
| Recovery payment | Payment-verified success (or S6h-B verified late success) of a channel's payment request | none | BIL-28 | `recovery.service.ts:255` |
| External surplus repayment (Path B) | the owner's T3 receipt and a File `surplus_evidence` grant (`grantId`, `fileId`) | stored, **not returned** by BIL-28 | BIL-28 (`externalRecordedAt` only) | `0039_recovery.sql:276-283`; `recovery.service.ts:255-259` |
| Surplus confirmation, surplus refund | `confirmedAt`; `refundCaseId` (no time) | none | BIL-28 | `recovery.service.ts:256-259` |

File has no human route at all: "No human, public or grantee route" (file-service `src/grants/grant.controller.ts:41-42`). A File id is a
**reference**: Admin shows it as an id, never as a link, a download or an upload control (**CF-71**, unchanged). Billing's `verifiedAt` is
the verification of the grant, never of the file's content.

## Restrictions (verified)

| Item | Core rule | Evidence |
|---|---|---|
| Model | one function, `billing_assistance_restrictions(organization, at)`, at the database's current clock; no ledger, no repeat-violation state | `0032:1-21`; replaced by `0039:425-440` |
| T1 | a request still `cash_collected` past its `settleBy`; source: the request; since: `settleBy` | `0039:428-430` |
| T2 | a cash-return obligation still `open` or `return_reported`; source: the obligation; since: its opening | `0039:432-434` |
| T3 | an open recovery obligation; source: the obligation; since: its opening | `0039:436-438` |
| Effect | blocks NEW assistance requests of the Organization only; no discharge, read or collection path checks them | `0032:14-17`; `assistance.controller.ts:474` |
| End | exactly when the source stops qualifying (settled or returned; confirmed or superseded; principal recovered). No timer, no manual clearance; a write-off does not end T3 | the same function; §11.5 |
| Reserved | `inactive` (D6) is never returned | `src/assistance/assistance-restrictions.ts:11-16` |
| Owner read | **BIL-26** `GET /billing/organizations/:organizationId/restrictions` → `{restrictions: [{kind, sourceId, since}]}` ordered by kind, since, source; the Owner of the Organization's Platform (live), its administrator, or a `restriction.read` service; one 404 otherwise; development only | `src/assistance/assistance-restriction.service.ts:13-24`; `assistance.controller.ts:452-476` |

Not restrictions: an open **assistance** dispute (it holds steps of its own case, A7); a **Payment** dispute (PAY-09; Billing's
`refund_dispute_open` refuses a refund case, `src/refunds/refund-case.service.ts:109`, never an assistance request; only a full final lost
chargeback of an assisted purchase leads to T3, through a recovery obligation); a fraud hold (BIL-27); D6.

Correction of the A7 note "restriction rows' `since` and `sourceId` are not modelled (no owner contract to read them)": BIL-26 **is** an
owner read (development only). A10 models its rows.

## Admin rules (A10)

- `domain/assistance-evidence.ts`: `caseEvidence()` builds the register from the case page's own record (no new read): each item's kind,
  source, actor, Core time (or "not stated", never estimated), statement (Core's machine values) and references; `EVIDENCE_PROVENANCE`
  fixes source, actor and file availability per kind. Only Path B grants are `reference`; only the external surplus record is `notInRead`.
- `domain/assistance-history.ts`: the timeline ordered by the time an entry is about (`at`) or by Core's recording (`recordedAt`), ties by
  the other clock then the id; source filters; `HISTORY_STANDING` states what each kind means for money, and `STANDING_SOURCE` ties every
  standing to one source, so a report can never read as verified financial completion.
- `domain/assistance-restrictions.ts`: what each row rests on and what `since` means, this case or another case of the Organization, a
  case link only for a T1 source (an obligation id resolves to no case without CF-70/CF-68), `NOT_RESTRICTIONS`. It derives nothing.
- Gateway: `organizationRestrictions(context, organizationId)`; `ASSISTANCE_READ_CONTRACTS.organizationRestrictions` is
  `perOrganization` / BIL-26, real integration unavailable (D-A4, development-only). The demo adapter answers the same model the case
  read summarises (`demoRestrictionRowsOf`; `caseDetail.restrictions` is now its distinct kinds); another Company's or Platform's
  Organization, or a malformed id, is the collapsed 404; operators 403.
- Types (verified): `AssistanceRestrictionRow` (BIL-26), `LateSettlementDetail.paymentRequestId` and each evidence item's `fileId` (BIL-32).
- Case page: a **Restrictions** card (rows, scope, what is not a restriction; a failed read says so and never reads as "none"); an
  **Evidence and references** card; the **History** card with an order, source filters (view state only: nothing is read again) and each
  entry's standing. The oversight card no longer repeats the restrictions. The late-settlement section and the recovery standing (case page
  and `/billing/assistance/recovery`) name File references and the unreturned Path B grant.
- No new route: evidence and history are per case, restrictions per Organization and already reached from every overview through the case
  page. A Company-wide overview would need owner lists Core does not have (CF-68, CF-70).
- Seed: case 15 (an L-4 application on File evidence, Path B, two grants; deadline obligation superseded; request settled) is the first
  demo record with File references. Every late settlement carries its payment request. Existing amounts and states are unchanged.

Rendered checks (demo build, the real design-token package, desktop and mobile, light and dark, EN/FR/AR, the 11 accents):
[`review/assistance-a10/rendered-checks.txt`](../review/assistance-a10/rendered-checks.txt).

## Explicitly unsupported

Evidence upload, opening or download; File grants; corrections; dispute answers or resolutions; late-settlement applications; recovery
actions; surplus records, confirmations or refunds; write-offs; receipt issuance or consumption; any payment command; any HTTP adapter.

## Missing Core prerequisites

CF-71 (human File path), CF-70 (owner reads of requests, obligations, disputes and corrections), CF-68 / CF-69 / CF-77 (discovery), D-A4,
and the Billing owner routes being development-only. Core's owner Audit reads (per Organization, and AUD-03 in development) record Core's audit events, not this per-case
history; Admin does not present its history as Audit.
