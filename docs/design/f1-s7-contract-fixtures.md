# F1-S7 — Financial contract fixtures and integration readiness

| | |
|---|---|
| Status | **Implemented, in Owner review** (F1-S7 only). Tests and documentation only: no HTTP adapter, no financial command, no UI, no D-A4 work, no Core change. |
| Core evidence baseline | nawara-core `0044b20` (read only; paths below are relative to that repository) |
| Admin baseline | `main` at `19f8924` (PR #76 merged) |
| Design | [`f1-financial-authorization.md`](f1-financial-authorization.md) §13 (F1-S7 row) |
| Classification | contract readiness of a mock-first foundation. **Not production financial certification**, and no operation below is production-ready. |

F1-S7 records Core's financial authorization contracts as fixtures. Each fixture fact cites a Core source line. A spec then checks
that Admin's F1 tables and coordinator (F1-S1 to F1-S5) agree with those contracts. The fixtures hold Core facts only: routes, headers,
body fields, formats, lifetimes, documented statuses and codes, and Core's own words about each answer. They are not Core responses,
nothing sends them, and no adapter reads them.

## 1. Fixture inventory

All fixtures are in `src/app/core/authorization/testing/fixtures/`. They are test-only and never reach a build (`check:production`).

| Fixture | Holds (all at `0044b20`) | Main Core sources |
|---|---|---|
| `step-up-transports.json` | all 32 Core step-up purposes: 31 represented, each with its factors, transport (T1 `authLocal`, T2 `serviceVerified`, T3 `receipt`), delivery (header or body), recipient service and consuming route; 1 excluded with its reason; the header name `x-step-up-token`; the body field `stepUpToken` (max 64); `POST /auth/step-up/verify` and its refusal of Auth-local purposes; `400 step_up_unsupported` | `auth-service/src/owner/step-up.service.ts:23-100, :128, :173, :184, :250-252`; `auth/auth.controller.ts:106-116`; `organization-service/src/admin/admin.controller.ts:22`; `billing-service/src/assistance/assistance.controller.ts:377`; `audit-service/src/legal-hold/legal-hold.controller.ts:9, :15`; `audit-service/src/legal-hold/legal-hold.service.ts:52-60, :83-89` |
| `receipt-issuance.json` | AUTH-01 `POST /auth/admin/authorization-receipts`: owner only; `Idempotency-Key` required (`^[A-Za-z0-9._:-]{8,128}$`); body `{stepUpToken, binding}`; response `{receiptId, secret, expiresAt}` (secret shown once); secret = base64url of 32 bytes (`^[A-Za-z0-9_-]{43}$`); lifetime 600 000 ms; the replay hash covers the binding, not the step-up; the eight operations with purpose, audience and exact field list; 14 documented answers; the service-only routes and codes (AUTH-02/03) | `auth-service/src/receipts/authorization-receipt.controller.ts:26-70`; `authorization-receipt.service.ts:15, :17, :106-112`; `receipt-http.ts:11-21, :27`; `receipt-binding.ts:152-173`; `dto.ts:108-120` |
| `receipt-consumers.json` | the eight receipt consumers: route, register, owning service, whether the route takes `Idempotency-Key` (and Core's natural-key answer when it does not), body fields, the receipt field `receiptSecret`, production state (never mounted or configured), success answers, every documented 4xx/5xx code with Core's own words (`coreSays`) and, where the controller is silent, the cited source behaviour (`basis`) | `billing-service/src/refunds/refund-case.controller.ts:102-120`; `payment-service/src/disputes/disputes.controller.ts:105-120`; `billing-service/src/fraud-holds/fraud-hold.controller.ts:24-56`, `fraud-hold.service.ts:118-128, :176-189`; `billing-service/src/recovery/recovery.controller.ts:163-180`, `recovery.service.ts:282-304, :370`; `billing-service/src/late-settlements/late-settlement.controller.ts:125-139`, `late-settlement.service.ts:275-290, :358-367`; `payment-service/src/reconciliation/reconciliation.controller.ts:73-90`; `billing-service/src/reconciliation/reconciliation.controller.ts:89-104`, `reconciliation.service.ts:386-396, :454`; module production gates (each `*.module.ts`, `billing-config.ts:170`) |

## 2. What the fixture spec checks

`src/app/core/authorization/testing/financial-contract-fixtures.spec.ts`: **321 deterministic tests**, generated from the fixtures.
There are no timers, no network and no randomness. The one key-format test uses `crypto.randomUUID`, the coordinator's real key source.

| Area | Checks |
|---|---|
| Fixture integrity | one Core revision everywhere, equal to the registries' baseline; every fact cites `apps/<service>/src/<file>:<line>`; 31 + 1 = 32 purposes |
| Step-up purposes and transports | the registry holds exactly Core's purposes; per purpose: transport, delivery, recipient, factors, and `allowsFactor` for each method; **T1**: 15 Auth-local purposes, all header to Auth; **T2**: 8 service-verified purposes, never to Auth; header except the two Audit legal holds (body `stepUpToken`); the two financial ones go to Billing; **T3**: 8 receipt purposes, body to Auth's issuance only, factor only (never the secret key); Core's generic verify refuses them |
| T3 issuance | purpose, audience and exact field list per operation (`RECEIPT_OPERATION_PURPOSE`, `RECEIPT_AUDIENCE`, `RECEIPT_BINDING_FIELDS`); the secret holder accepts only Core's format and never prints it; each of the 14 documented answers maps to the expected issuance failure, and the coordinator goes to the expected step without a consumer call; Core's "nothing changed" is retried, its "replay the same key" is replayed; one same-key, same-step-up replay of a lost answer, never a new receipt; the issuance key is kept after "nothing changed"; service-only codes and lost answers are never usable |
| Receipt consumers (×8) | route, register, key requirement, receipt field; every code Admin lists is documented by Core with the right status; every documented 503 is classified; each documented answer gives the policy Core's words support (4xx: no resubmission; "repeat the same request" / "recorded": the identical request; "nothing changed": the same request again); no answer: same-key replay where the route takes a key, **blocked until CF-74** where it does not; an undocumented 503 is never "nothing changed" |
| Coordinator (×8) | the operation's own purpose and binding (a private copy; a later change to the caller's object changes nothing); **authorization is not completion** (issued ≠ applied); two distinct keys in Core's key format, fixed for the intent and new for the next; expiry at Core's `expiresAt` (never sent afterwards, secret discarded); single use; each documented answer drives the matching outcome (unresolved → identical repeat, same receipt and key; nothing changed → same request again; definitive → refused, secret discarded, no repeat); no answer: same-key replay (key routes) or target blocked, secret discarded, a "nothing applied" read keeps the block and only a proving read lifts it (no-key routes) |
| Disposal and repeated intents | the held secret is discarded and nothing is sent on cancellation, expiry, sign-out, another account, another session and another scope; a receipt arriving after the intent ended is discarded at once; a context change while a no-key command is in flight blocks its target; a second intent cannot start while one is under way; input is single flight; a refused step-up asks for the factor again; `401` ends the intent |
| Authority | every receipt operation is represented once, as a Company Owner operation with `authorizationProof` pending in Core; an owner's decision carries the receipt requirement unchanged and never proves authorization; an operator can attempt only the fee proposal and never a receipt operation; a fee proposal is delegated authority (assigned Platform only, live delegation pending in Core, CF-72); the owner decides it; every no-key receipt operation names CF-74 |
| Mock-first and production boundaries | no operation has a production state; no consumer is mounted or configured in production; without adapters no step-up is obtained and nothing is issued or sent (`notInBuild`, never a refusal) |

Mutating any fixture fact makes the spec fail. This was checked before delivery: changing one delivery, one key requirement and
one `coreSays` failed 9 tests.

## 3. Findings

No verified Core contract contradicts Admin's F1 tables. Nothing in F1-S1 to F1-S5 was changed.

| # | Finding | Effect |
|---|---|---|
| F-1 | Three evidence answers are classified "nothing changed" by Admin but not annotated by Core's controllers: `fraud_evidence_unavailable`, `surplus_evidence_unavailable` and `late_settlement_evidence_unavailable`. The same holds for `recovery_authorization_unavailable`, `late_settlement_authorization_unavailable` and the release's `fraud_hold_unavailable`. The source shows each one thrown **before** the receipt is consumed and before any write. Each `*_authorization_unavailable` comes from the shared consume step, which says "anything but a provable consumption by this Owner changes nothing" (`fraud-hold.service.ts:176`); a repeat reuses the same `consumeRef`. | Admin's classification is source-verified, not contract-stated. Proposed **CF-78** asks Core to document it ([`CORE-INTEGRATION.md` §9](../CORE-INTEGRATION.md)). Until then, a future adapter treats only a Core-documented reading as final. |
| F-2 | The four no-key routes document what an identical repeat answers: fraud-hold placement ("this holdId is already this hold"), release ("already released"), external surplus ("the same record repeated (same grant and file): answered, nothing consumed again") and write-off ("the same request again (same obligation and receipt): answered, nothing consumed again"; `reconciliation.service.ts:393-396`). | This is evidence toward **CF-74**, not an answer to it: Core has not stated these as its replay contract after a transport loss. The Owner's rule (design §0) stands, and Admin keeps blocking. CF-74 stays OPEN, with this evidence recorded for the Core conversation. |
| F-3 | The closed reason sets are verified at `0044b20`: refunds `REFUND_REASONS` (`billing-service/src/refunds/refund-input.ts:8`, mirrored in `payment-service/src/refunds/refund.types.ts:14`) and fraud holds `FRAUD_HOLD_REASONS` (`billing-service/src/fraud-holds/fraud-hold.service.ts:16`). | `receipt.model.ts` keeps `reason: string`, which stays correct because Auth checks only the format. Narrowing the type belongs to the slice that first builds a refund or fraud-hold binding (F5/F8), not here. |
| F-4 | Payment's dispute decision and provider-fact association answer `422 idempotency_key_reused`; Billing's routes answer `409 idempotency_key_conflict`. | Both are read as an idempotency conflict (code first), so no change is needed. Checklist item A-3 records that 422 keeps its code. |
| F-5 | The receipt consume and lookup routes (AUTH-02/03) are service-token only; their codes (`receipt_invalid`, `consume_ref_conflict`) never reach a browser. | If one ever appeared at issuance, it would be read as an unknown outcome, never as a usable answer (tested). An owner still cannot read a receipt's state (**CF-75**, open). |

## 4. Integration readiness by operation

The categories follow the F1-S7 brief. "Verified contract" means the route and its answers were read in Core's source at `0044b20`.
It **never** means available: every financial route below is development-only or refused in production, and the browser's
transport to Core is undecided (**D-A4**, open). That applies to every row.

### 4.1 Supported by verified contracts (route and answers verified; still not production)

| Operation | Core | Authorization | Admin readiness |
|---|---|---|---|
| Receipt issuance | AUTH-01 | T3 step-up (factor only) | contract fixed by fixtures; demo gateway only (F1-S4); no HTTP adapter |
| Refund authorization | BIL-24 | receipt `refund.authorize`; `Idempotency-Key` | mapping and coordinator verified; simulation only |
| Dispute decision | PAY-11 | receipt `payment.dispute.decide`; `Idempotency-Key` | verified; simulation only |
| Late settlement application | BIL-32 | receipt `billing.late_settlement.apply`; `Idempotency-Key` | verified; simulation only |
| Provider-fact association | PAY-13 | receipt `payment.provider_fact.associate`; `Idempotency-Key` | verified; simulation only |
| Fraud-hold release | BIL-27 | receipt `billing.fraud_hold.release`; **no key** | verified; simulation only; uncertain outcomes blocked (**CF-74**) |
| Recovery write-off | BIL-34 | receipt `billing.recovery.write_off`; **no key** | verified; simulation only; **CF-74** |
| Assistance correction / dispute resolution | BIL-19, BIL-22 | T2 step-up (header, Billing) | transport verified; simulation only; owner reads missing (**CF-70**); same-key replay order undocumented (**CF-76**) |

### 4.2 Development-only (route mounted in every build; Billing not deployed)

`platformBilling.read`, `platformBilling.configure`, `catalog.read`, `catalog.manageProducts` and `catalog.managePrices` (both **OD-05**),
`fees.setCaps`, `fees.manageDelegations`, `fees.decideProposal`, and `fees.propose` (operator with a live owner delegation, **CF-72**).
None needs a step-up or receipt.

### 4.3 Simulation-only (nothing mounted in production)

The receipt consumers in §4.1 and the assistance commands, plus the owner reads `restrictions.read`, `refundCase.open`/`read`/`cancel`
(open: **CF-66**), `dispute.read`, `fraudHold.read`, `recovery.read`, `lateSettlement.read`, `reconciliationCase.read`/`acknowledge`,
`reconciliationItems.read`, `balances.read`, `financialLoss.read`. Fraud holds are simulation only by configuration
(`billing-config.ts:170`).

### 4.4 Missing human-facing APIs

| Operation | Missing |
|---|---|
| `fraudHold.place` | human File-evidence path (**CF-71**), owner fraud-hold list (**CF-67**), no-key repeat semantics (**CF-74**) |
| `surplus.recordExternalRepayment` | **CF-71**, **CF-74** |
| `dispute.addEvidence` | **CF-71** |
| `refundCase.list`, `invoices.list`, `payments.list` | **CF-65**, **CF-66** |
| `fraudHold.list`, `recovery.list`, `lateSettlement.list` | **CF-67**, **CF-68**, **CF-69** (and **CF-77**, end of results) |
| `assistance.read`, `fees.read` | **CF-70**, **CF-72** |
| `legalRemedy.record` | **BIL-35** (no route) |
| an owner read of a receipt's state | **CF-75** |

### 4.5 Blocked by D-A4 or Core follow-ups

- **D-A4** (browser session and transport, undecided; same-origin BFF only a preferred candidate): blocks every HTTP adapter here.
  This slice implements nothing of it.
- **CF-74**: no-key consumers (fraud-hold place and release, external surplus, write-off). Uncertain outcomes stay blocked.
- **CF-75**: owner receipt-state read. **CF-76**: same-key replay order of T2 commands. **CF-72**: fee reads and delegation evidence.
- **CF-78** (proposed by this slice, F-1): document the unannotated "nothing changed" 503s.

### 4.6 Not ready for production

**All of them.** No financial operation has a production state in Admin (`FinancialAvailability` has none, by design). Every receipt
consumer is unmounted or unconfigured in Core production. No HTTP adapter exists. D-A4 is open. The receipt gateways are not bound in any
build yet (the demo providers of F1-S4 are unbound; nothing uses the coordinator). The `Unavailable…` gateways, the only
non-demo implementations, end an intent as "not in this build" before any step-up, issuance or command (tested).

## 5. HTTP adapter checklist (for a later, separately authorized slice)

These must be true of any future adapter **before** it is bound. Nothing here authorizes building one.

| # | Rule | Fixture / spec anchor |
|---|---|---|
| A-1 | Behaviour follows HTTP status and Core `code` only, never Core's `message` | `appErrorOf` in the spec (test-only reference mapping) |
| A-2 | 400 → `validation`; 401 → `unauthenticated`; 403 → `forbidden`; 404 → `not_found`; 409 → `conflict`; 429 → `rate_limited`; 503 → `unavailable`; no response → `network`; anything else → `unexpected`. Each keeps Core's `code` | same |
| A-3 | **422 → `validation` with its code kept**, so `idempotency_key_reused` (Payment) is still read as an idempotency conflict and `*_evidence_invalid` as definitive | consumer fixtures (dispute, provider fact, fraud hold, surplus, late settlement) |
| A-4 | T1 and T2 header purposes send `x-step-up-token`; Audit legal holds send body `stepUpToken`; a receipt purpose's proof goes **only** to `POST /auth/admin/authorization-receipts` as body `stepUpToken` | `step-up-transports.json` |
| A-5 | Issuance sends `Idempotency-Key` (Ki) matching `^[A-Za-z0-9._:-]{8,128}$`; consumers that take a key get a **different** key (Kc); both stay fixed for the intent | `receipt-issuance.json`, coordinator tests |
| A-6 | The binding is sent field for field as Core lists it (optional fields omitted, never `null`); nothing is added | `receipt-issuance.json` `operations` |
| A-7 | The receipt secret is read only through `revealReceiptSecret` (ESLint-restricted to consumer adapters) and sent only as body `receiptSecret`, never in a URL, header, log, storage or error | `receipt-consumers.json` `receiptField` |
| A-8 | Responses are `Cache-Control: no-store`; nothing caches the issuance body | `receipt-issuance.json` |
| A-9 | Expiry is Core's `expiresAt`, never a local estimate; an expired, unsubmitted receipt is discarded | coordinator tests |
| A-10 | Nothing is resent automatically. Identical repeats happen only where Core sanctions them (unresolved; no answer on a key route; "nothing changed"). No-key routes with no answer stay blocked until CF-74 | consumer and coordinator tests |
| A-11 | A 2xx consumer answer proves the command; a `200` replay (`Idempotent-Replayed: true`) is the same result, not a new one | consumer fixtures `success` |
| A-12 | Every adapter runs only in a non-production binding until Core mounts the route in production and D-A4 is decided; `check:production` keeps the mock out of production | mock-first tests; `tools/check-production-bundle.mjs` |
| A-13 | A Core upgrade re-verifies every fixture at the new revision (source lines and codes) before any mapping changes | fixture integrity tests |

## 6. Out of scope (unchanged by F1-S7)

No financial UI, Core modification, receipt-backed consumer command, D-A4 work, HTTP integration or deployment. F1-S1 to F1-S5 source is
unchanged. F1-S6a and F1-S6b remain pending, each needing its own authorization.
