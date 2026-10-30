# F1 — Financial Authorization Foundation (mock-first): technical design

| | |
|---|---|
| Status | **REVIEWED by the Owner 2026-10-30.** F1-S0 (documentation) and F1-S1 (purpose registry) are **authorized**; F1-S2 to F1-S7 are **not authorized**. The Owner's safety corrections are applied in place and listed in §0. Nothing here is production availability. |
| Prepared | 2026-10-30 |
| Admin baseline | `main` = **`e358f256f694d071b2fd5913227ebe48834273b6`** (merge of PR #52); local tree = `e3786c2` (the PR #52 head, identical content) |
| Core evidence | `nawara-core` **`0044b20`** read-only clone (the F0 baseline). Core was **not** re-fetched (not authorized), so newer Core commits, if any, are **unverified** |
| Not accessed | production, Nawara Lab 01, deployed infrastructure |

**Citation form.** `admin:<path>:<line>` means `nawara-admin@e358f25`; `core:<path>:<line>` means `nawara-core@0044b20`. Core paths
are relative to the Core repository root.

## 0. Owner safety corrections (2026-10-30)

Applied to this design when F1-S0 and F1-S1 were authorized; they override any earlier wording below.

1. **Ambiguous financial outcomes.** A read that shows no applied result does **not**, by itself, authorize repeating a financial
   command. Until **CF-74** is answered, an uncertain outcome on a receipt consumer **without** `Idempotency-Key` (fraud-hold
   place and release, external surplus repayment, recovery write-off) stays **blocked** from automatic and from unverified manual
   resubmission. (§5, §7.2, §10, §11, §16 updated.)
2. **Receipt secrecy.** The redacting `ReceiptSecret` wrapper (§6.3) is **defence in depth**, not complete secret protection. A
   future receipt implementation must restrict access to the secret, prevent persistence and logging, and test those guarantees.
   F1-S1 implements no receipt issuance and no secret storage.
3. **Source consistency.** Every purpose, transport, factor and delivery entry must be traceable to Core source at the verified
   baseline; no financial permission or transport is inferred.
4. **Core questions.** Q1, Q2 and Q3 (§15) are recorded as open Core follow-ups **CF-74, CF-75, CF-76** in
   [`CORE-INTEGRATION.md` §9](../CORE-INTEGRATION.md#9-core-follow-ups). They are not approved Core implementation requests.

**Evidence labels.** **SRC**: read in source at the stated revision. **DOC**: stated by a document at that revision. **INF**: my
inference, labelled. **OPEN**: needs a Core answer.

---

## 1. Verified Admin baseline

| Check | Result | Method |
|---|---|---|
| Repository | `/home/user/nawara-admin`, `origin` = `https://github.com/nawara-solutions/nawara-admin` | `git remote get-url origin` |
| Current branch | `claude/gallant-einstein-ip4nif`, HEAD `e3786c2`, working tree **clean**, no stash, one worktree | `git status`, `git worktree list` |
| Latest merged `main` | **`e358f25`**, "Merge pull request #52 … (F0)", 2026-10-30T20:53:47Z | GitHub API (read-only), not `git fetch` |
| PR #52 included | **yes**: merged by the Owner; base `cf4b1a9`, head `e3786c2`; the merge changes exactly the 9 F0 files (+1822 / −7) | GitHub API `get_commit e358f25` |
| PR #52 CI | `validate` **success** (run 41126560146), `production image smoke test` **success** | GitHub API check runs |
| Other active work | **no open PRs**; no uncommitted changes; the local repository has not fetched `e358f25`, but its content equals `e3786c2` (the merge's first parent is `cf4b1a9` and its diff is exactly PR #52) | GitHub API, `git diff` |
| CI configuration | `admin:.github/workflows/admin-ci.yml`: on PRs and pushes to `main`: format, lint, stylelint, i18n, tokens, contrast, `npm test` (Vitest), build, `check:production`, plus a Docker production-image smoke test | file read |
| Production-bundle barrier | `admin:tools/check-production-bundle.mjs` greps the production build for demo-only markers; `admin:src/app/core/config/app-environment.ts:63-75` refuses `production && demo` | file read |

### 1.1 Existing architecture F1 must build on (SRC)

| Element | Where | What it does today |
|---|---|---|
| `StepUpGateway`, `StepUpPurpose`, `StepUpGrant` | `admin:src/app/core/auth/step-up.gateway.ts:21-57` | one gateway, `obtain(purpose, proof) → { token, expiresAt }`, 13 purposes; `UnavailableStepUpGateway` throws `adapterUnavailable` |
| `MockStepUpGateway` | `admin:src/app/core/auth/step-up.mock.ts:33-72` | demo only: owner only (operator `403 admin_forbidden`), demo TOTP or simulated passkey, 5-minute opaque grant in `DemoAuthState` |
| `DemoAuthState` step-up store | `admin:src/app/core/auth/auth.mock-state.ts:315-365`, factor rules `:400-430` | `issueStepUp`, `checkStepUp` (no consumption), `consumeStepUp` (always deletes); per-purpose factor allow-list mirrored from Core |
| `FactorProof` | `admin:src/app/core/auth/auth.model.ts:48-50` | `totp` (code) or `passkey` (assertion); **no `secret_key` variant** |
| `Actor` | `admin:src/app/core/auth/actor.ts` | `owner` (companyId) or `operator` (platformAssignments) |
| Capability policy | `admin:src/app/core/access/capability-policy.ts:115-147` | owner 22 capabilities, operator none; UX only |
| `ActionRun` | `admin:src/app/core/actions/action-run.ts:133-310` | closed → editing → verifying → pending → succeeded / failed; one idempotency key per input; context checked before send and on answer; a grant serves one send; **"Try again" after `outcomeUnknown` resends** (`retryOf`, `admin:src/app/core/actions/action-failure.ts:60-73`) |
| Non-`ActionRun` precedent | `admin:src/app/features/settings/application/secret-key.facade.ts:126-134`, `…/change-password.facade.ts:60-73` | deliberately **not** `ActionRun`, because a lost answer must never be resent; an unknown outcome allows only a completely new flow |
| `AppError` | `admin:src/app/core/errors/app-error.ts` | one error model; branches on `kind` + `code`, never `message` |
| Adapter binding | `admin:src/app/core/config/app-environment.ts:84-95` (`adapterProviders`, `DemoDomain`) | demo builds bind mocks lazily from `src/app/demo/`; every other build binds `Unavailable…` |
| Clock | `admin:src/app/shared/format/clock.ts` (`NW_CLOCK`) | injectable time, so expiry is testable |
| Browser storage | only `admin:src/app/core/preferences/preference-store.ts` (theme, accent, locale) | no session or proof is stored |
| Cross-tab | none (`visibilitychange` only, in `operator-grants-refresh.ts:63`) | a demo session ends on reload |

---

## 2. Evidence and Core contract references

### 2.1 F0 errata found during this design (SRC, `0044b20`)

| F0 statement | Source truth | Fix (proposed for slice F1-S0, docs only) |
|---|---|---|
| `admin:docs/CORE-INTEGRATION.md` §11.4: T3 receipt issuance is sent with header `x-step-up-token` | `POST /auth/admin/authorization-receipts` takes **`stepUpToken` in the JSON body** with `binding`, plus the `Idempotency-Key` header (`core:apps/auth-service/src/receipts/dto.ts:109-114`; `core:apps/auth-service/src/receipts/authorization-receipt.controller.ts:44-50`) | correct §11.4 and `master-roadmap.md` §9.3 (append an errata note; do not rewrite history) |
| §11.4: T2 consumers take header `x-step-up-token` "(Organization, Release, Audit, Billing)" | **Audit legal holds take `stepUpToken` in the body** (`core:apps/audit-service/src/legal-hold/legal-hold.service.ts:52-60`, `:83-89`); Organization, Release and Billing assistance take the header (`core:apps/organization-service/src/admin/admin.controller.ts:22,91,149`; `core:apps/release-service/src/admin/admin.controller.ts:9,88,114`; `core:apps/billing-service/src/assistance/assistance.controller.ts:377,413,439`) | record the per-consumer delivery (§3) |
| Receipts are "use once and drop" (§11.4, roadmap §9.3) | every receipt consumer documents `503 …_authorization_unresolved (repeat the same request)`, and Billing's refund relay states that "a retry with the same key resumes the same relay (the replay fingerprint never covers the secret)" (`core:apps/billing-service/src/refunds/refund-authorization.service.ts:28-36`) | Admin must keep the **same** receipt in memory for the life of one intent, so that it can make the Core-sanctioned identical repeat (§7) |

### 2.2 Core facts this design depends on (SRC, `0044b20`)

| Fact | Evidence |
|---|---|
| Step-up request: `POST /auth/admin/step-up` `{ purpose, method: 'secret_key' \| 'totp' \| 'webauthn', code?, secretKey?, challengeId?, assertion? }` → `{ stepUpToken, expiresAt }`; owner only; passkey options at `POST /auth/admin/step-up/webauthn-options { purpose }` | `core:apps/auth-service/src/owner/dto.ts:30-40`; `core:apps/auth-service/src/owner/owner.controller.ts:165-182` |
| Step-up token is a UUID, single use, bound to owner, session (`sid`) and purpose; lifetime `STEP_UP_TTL_SEC`, **default 300 s** (documented maximum ≤ 15 min) | `core:apps/auth-service/src/owner/step-up.service.ts:183-220`; `core:apps/auth-service/src/config/app-config.ts:260` |
| Purpose → allowed factors (factor-only purposes never accept the secret key) | `core:apps/auth-service/src/owner/step-up.service.ts:23-100` |
| `POST /auth/step-up/verify { purpose, stepUpToken }` is called by services with the owner's bearer; it **refuses receipt purposes without consuming them** | `core:apps/auth-service/src/auth/dto.ts:22-26`; `core:apps/auth-service/src/auth/auth.controller.ts:107-116`; `step-up.service.ts:53-58` |
| Receipt issuance: `{ stepUpToken, binding }` + `Idempotency-Key` → `{ receiptId, secret, expiresAt }`; the secret is returned once, never on a replay; expiry = issuedAt + 10 minutes by the database clock | `core:apps/auth-service/src/receipts/dto.ts:109-120`; `core:apps/auth-service/src/receipts/authorization-receipt.service.ts:14-15` |
| Issuance replay: same key, different body → `409 idempotency_key_reused`; consumed → `409 receipt_already_consumed`; an `issued`, unexpired receipt is **voided** → `409 receipt_issued_response_lost`; expired → `409 receipt_expired`; `503 receipt_outcome_unknown` → replay the same key; `503 receipt_unavailable` → nothing changed | `authorization-receipt.service.ts:105-163`; controller `:40-43` |
| Issuance requires an active owner of `binding.companyId` (`authority_revoked`, `receipt_binding_invalid`) | `authorization-receipt.service.ts:115-122` |
| **A new receipt does not invalidate another one:** issuance only inserts; only a replay of the **same key** voids that receipt | `authorization-receipt.service.ts:105-145` (no update of other rows) |
| Binding fields per operation, and the one audience each may be consumed by | `core:apps/auth-service/src/receipts/receipt-binding.ts:15-173` |
| Receipt consumption (AUTH-02/03) is **service-token only**; Admin never calls it | `authorization-receipt.controller.ts:52-66` |
| Each consumer's body, idempotency and documented answers | §5 below (controller lines cited per row) |
| Production refusal of every S5/S6 module | `admin:docs/CORE-INTEGRATION.md` §11.3 (F0, SRC-cited) |

---

## 3. Three-transport authorization matrix

| | **T1 Auth-local step-up** | **T2 service-verified step-up** | **T3 single-use authorization receipt** |
|---|---|---|---|
| Who obtains | owner, `POST /auth/admin/step-up` | owner, `POST /auth/admin/step-up` | owner: step-up, then `POST /auth/admin/authorization-receipts` |
| Factors | per purpose: TOTP, passkey, and the secret key only where Core allows it | per purpose (factor-only for Release, Audit, Billing) | **factor only** (TOTP or passkey) |
| Proof delivered | header `x-step-up-token` to the Auth route | **header** `x-step-up-token` (Organization, Release, Billing assistance) **or body** `stepUpToken` (Audit legal holds) | step-up token in the **issuance body**; then the receipt **secret in the consumer's body** (`receiptSecret`) |
| Validated by | Auth, inside the command's transaction | the target service calls `POST /auth/step-up/verify` with the owner's bearer | the consuming service calls AUTH-02 with its own service token; Auth checks digests, binding, audience, expiry and live owner authority |
| Lifetime | step-up: default 300 s (≤ 15 min) | same | step-up: same; receipt: **10 minutes** |
| Bound to | owner, session, purpose | owner, session, purpose | step-up: owner, session, purpose; receipt: issuer, Company, exact binding (target ids, amount and currency where present, decision or reason), one audience |
| Single use | yes (consumed on commit; a refusal rolls it back) | yes (consumed by verify) | step-up consumed at issuance; receipt consumed once, by `consumeRef` |
| Lost answer | **never resend** a used token; reconcile by re-reading (existing P6/P9 behaviour) | consumer-specific: Audit says "nothing changed (a fresh step-up is needed)" on `503`; others: OPEN Q3 | issuance: replay the **same key** (Core rules above); consumer: **repeat the identical request** with the same receipt and key only where Core documents it (§7) |
| Admin today | modelled (`StepUpGateway`, mock) | used for `platform.create`, `organization.create` through the same gateway; header only; **body delivery not modelled** | **not modelled** |
| Purposes (`0044b20`) | `platform_assignment.grant/.revoke`, `operator.create`, `owner.secret_key.rotate`, `owner.factor.enroll/.remove`, `owner.password.change`, `join_code.create/.revoke`, `organization.admin.grant/.revoke`, `admin_invitation.create/.revoke`, `account.suspend/.restore`, `hierarchy.reference.repair` | `platform.create`, `organization.create`, `release.withdraw`, `compatibility_policy.change`, `audit.legal_hold.place/.release` (body), `billing.assistance.correct`, `billing.assistance.dispute.resolve` | `refund.authorize`, `payment.dispute.decide`, `billing.fraud_hold.place/.release`, `billing.recovery_surplus.record_external`, `billing.late_settlement.apply`, `payment.provider_fact.associate`, `billing.recovery.write_off` |

`x-step-up-token` and body `stepUpToken` are **not interchangeable**: each consumer reads exactly one. A T3 step-up token is never accepted
by `/auth/step-up/verify`, so it can never serve a T1 or T2 route, and must never be sent to one.

---

## 4. Owner / Operator capability matrix (financial and authorization-relevant)

The guard at `0044b20` is the source; Core decides per request. "Prod" is whether a production build mounts the route.

| Operation | Actor | Scope | Grants / role | Step-up | Receipt | Preconditions | Simulation-only | Prod |
|---|---|---|---|---|---|---|---|---|
| Platform billing configuration (BIL-01) | owner | own Company's Platform (live `/auth/platform-access`) | Company owner | — | — | immutable `companyId` once written | no (mounted) | Billing **not deployed** |
| Personal catalog (BIL-02/03) | owner | Platform | owner | — | — | catalog values OD-05 open | no | not deployed |
| Fee caps, delegations, approve, reject (BIL-04/05/07) | owner | Platform | owner | — | — | — | no | not deployed |
| Fee proposal, withdraw (BIL-06) | **operator** | assigned Platform | a live owner **delegation** | — | — | operators never approve (I-18) | no | not deployed |
| Assistance correction (BIL-19) | owner | Company / Platform | owner | **T2** `billing.assistance.correct` (header) | — | a reported time exists and changes | **yes** | refused |
| Assistance dispute resolution (BIL-22) | owner | Company / Platform | owner | **T2** `billing.assistance.dispute.resolve` (header) | — | open dispute | yes | refused |
| Restrictions read (BIL-26) | owner of the Platform (or the Organization actor, not an Admin user) | Organization | — | — | — | — | yes | refused |
| Refund case open / read / cancel (BIL-23/25) | owner | Company **and** Platform of the payment | owner | — | — | eligible verified payment; no open dispute; one case | yes | refused |
| Refund authorization relay (BIL-24) | owner | case's Company and Platform | owner | (T3 step-up) | **T3** `refund` → audience `payment-service`, relayed by Billing | case `open`; no live relay; no open dispute | yes | refused |
| Payment disputes read (PAY-09) | owner | Company | owner | — | — | — | yes | refused |
| Dispute evidence (PAY-10) | owner | Company | owner | — | — | **a File grant: no human path (CF-71)** | yes | refused |
| Dispute decision (PAY-11) | owner | Company | owner | (T3 step-up) | **T3** `dispute_decision` (`contest` / `accept`) | dispute open; no decision yet | yes | refused |
| Fraud hold place / release (BIL-27) | owner | Company | owner | (T3 step-up) | **T3** `fraud_hold_place` / `fraud_hold_release` | 1–5 File evidence grants (CF-71); 14-day limit | yes | refused |
| Recovery obligation read (BIL-28 admin) | owner | Company / Platform | owner | — | — | — | yes | refused |
| Surplus external repayment (BIL-30) | owner | Company | owner | (T3 step-up) | **T3** `recovery_surplus_external` | File evidence (CF-71); surplus owed | yes | refused |
| Late settlement application L-4 (BIL-32) | owner | Company | owner | (T3 step-up) | **T3** `late_settlement_apply` | L-4 evidence conditions; not cash-returned; no purchase | yes | refused |
| Reconciliation cases read / acknowledge (BIL-33) | owner | Company | owner | — | — | acknowledgement only for review-only types | yes | refused |
| Payment reconciliation items, balances (PAY-12, R6H-12) | owner | Company | owner | — | — | — | yes | refused |
| Provider-fact association (PAY-13) | owner | Company | owner | (T3 step-up) | **T3** `provider_fact_associate` | unmatched verified fact | yes | refused |
| `FinancialLoss` read (BIL-34) | owner | Company | owner | — | — | — | yes | refused |
| Recovery write-off (BIL-34) | owner | Company | owner | (T3 step-up) | **T3** `recovery_write_off` | outstanding amount unchanged since the receipt | yes | refused |
| Audit legal hold place / release | owner | Company | owner | **T2, body** `audit.legal_hold.place/.release` | — | — | no | Audit S2 **not deployed** |
| Release withdraw / policy | owner | operating Company | owner | **T2, header** | — | — | no | Release not in production |

**Rules carried into F1:** operators inherit nothing from owners; an owner never bypasses a step-up or a receipt; Organization
administrators and beneficiaries are **not** Admin users (recovery settlement, surplus confirmation and assistance actions belong
to product apps); members and operators are refused on every owner financial route, and cross-scope reads answer the collapsed
`404` (`core:docs/architecture/core-v2-s6-financial-certification.md:135-136`).

---

## 5. Financial operation → authorization mapping (verified consumers)

"Repeat" is what Core documents for an unresolved answer. "Key" is whether the route takes `Idempotency-Key`.

| Operation | Route | Mechanism | Binding (from `receipt-binding.ts`) and where Admin gets each value | Body | Key | Documented answers (409 / 503) | Repeat rule |
|---|---|---|---|---|---|---|---|
| Refund authorization | `POST /billing/admin/refund-cases/:id/authorizations` (`refund-case.controller.ts:102-120`) | T3 `refund` | `companyId, refundCaseId, paymentId, amount, currency, reason, legalOverride?, captureFactId?`: all from the case read BIL-25 (`refund-case.service.ts:23-48`: `capture.captureFactId`) | `{ receiptSecret }` only | **yes** (class M relay) | 409 `refund_case_completed`, `refund_case_not_open`, `refund_dispute_open`, `refund_authorization_in_progress`, `refund_authorization_invalid`, `refund_authorization_expired`, `refund_authorization_conflict`, `refund_rejected_by_payment`, `idempotency_key_conflict`; 503 `refund_authorization_unresolved`, `refund_payment_unavailable` (relay **recorded**), `auth_timeout`, `auth_unavailable` | same key + same secret resumes the same relay (`refund-authorization.service.ts:36`) |
| Dispute decision | `POST /payment/admin/disputes/:id/decision` (`disputes.controller.ts:117-120`) | T3 `dispute_decision` | `companyId, disputeId, paymentId, decision`: dispute read PAY-09 + the owner's choice | `{ decision, receiptSecret }` | **yes** | 409 `dispute_not_open`, `dispute_decision_exists`, `dispute_decision_refused`, `dispute_decision_conflict`; 503 `dispute_decision_unresolved (repeat the same request)`, `owner_authority_unavailable` | identical repeat |
| Fraud hold place | `POST /billing/admin/fraud-holds` (`fraud-hold.controller.ts:24-41`) | T3 `fraud_hold_place` | `companyId, holdId, beneficiaryUserId, productId, reason`: **`holdId` is a client-generated UUID bound before issuance**; beneficiary and product from a source Admin cannot discover (CF-67) | `{ holdId, beneficiaryUserId, productId, reason, evidence[1..5], receiptSecret }` | **no** (natural key `holdId`) | 409 `fraud_hold_active`, `fraud_hold_conflict`, `fraud_hold_authorization_refused`; 503 `fraud_evidence_unavailable`, `fraud_hold_authorization_unresolved (repeat the same request)`, `fraud_hold_unavailable` (nothing changed) | identical repeat on the documented `503` only; after a **transport loss**: **blocked** until CF-74 (a re-read is information, not authorization to repeat) |
| Fraud hold release | `POST /billing/admin/fraud-holds/:id/release` (`:47-56`) | T3 `fraud_hold_release` | `companyId, holdId, beneficiaryUserId, productId`: hold read | `{ receiptSecret }` (INF from service `:155`) | no | 409 `fraud_hold_not_active`, `fraud_hold_authorization_refused`; 503 `fraud_hold_authorization_unresolved`, `fraud_hold_unavailable` | as above; "a repeat answers the release" (DOC, controller summary) |
| Surplus external repayment | `POST /billing/admin/recovery-surpluses/:id/resolution` (`recovery.controller.ts:163-181`) | T3 `recovery_surplus_external` | `companyId, surplusId, organizationId, amount, currency`: obligation read BIL-28 | evidence + `receiptSecret` | no | 409 `surplus_not_owed`, `recovery_authorization_refused`; 503 `surplus_evidence_unavailable`, `recovery_authorization_unresolved (repeat the same request)`, `recovery_authorization_unavailable` | identical repeat on the documented `503` only; transport loss: **blocked** until CF-74 |
| Late settlement L-4 | `POST /billing/admin/late-settlements/:id/application` (`late-settlement.controller.ts:119-139`) | T3 `late_settlement_apply` | `companyId, lateSettlementId, assistanceRequestId, beneficiaryUserId, reasonCode`: late-settlement read R6G-4 + the owner's reason code | `{ reasonCode, receiptSecret, evidence?, ownerDetermination? }` (`late-settlement.service.ts:72-102`) | **yes** | 409 `late_settlement_refused` (`reason`), `late_settlement_authorization_refused`, `idempotency_key_conflict`; 503 `late_settlement_evidence_unavailable`, `late_settlement_authorization_unresolved (repeat the same request)`, `late_settlement_authorization_unavailable` | identical repeat |
| Provider-fact association | `POST /payment/admin/provider-facts/:id/associations` (`reconciliation.controller.ts:73-90`) | T3 `provider_fact_associate` | `companyId, factId, kind, amount, currency, targetType, targetId`: PAY-12 item + the owner's target | `{ targetType, targetId, receiptSecret }` | **yes** | 409 `provider_fact_matched`, `fact_already_associated`, `provider_fact_association_invalid`, `…_refused`, `…_conflict`; 503 `provider_fact_association_unresolved (repeat the same request)`, `owner_authority_unavailable` | identical repeat |
| Recovery write-off | `POST /billing/admin/recovery-obligations/:id/write-off` (`reconciliation.controller.ts:89-104`) | T3 `recovery_write_off` | `companyId, obligationId, organizationId, amount, currency`: obligation read | `{ receiptSecret }` only (`reconciliation.service.ts:386-388`) | no | 409 `write_off_not_permitted`, `recovery_authorization_refused`; 503 `recovery_authorization_unresolved (repeat the same request)`, `recovery_authorization_unavailable` | identical repeat on the documented `503` only; transport loss: **blocked** until CF-74 |
| Assistance correction / resolution | `POST /billing/admin/assistance-requests/:id/corrections`, `…/assistance-disputes/:id/resolution` | **T2** header | — | correction / resolution body | **yes** | 409 `correction_not_permitted`, `idempotency_key_conflict` | OPEN Q3 |
| Audit legal hold | `POST /audit/owner/company/legal-holds[/:holdId/release]` | **T2, body** | — | `{ stepUpToken, reasonCode, from, to }` / `{ stepUpToken, reasonCode }` | no | 503: "nothing changed (a fresh step-up is needed)" | new step-up, never a repeat |
| Refund case open, cancel; reconciliation acknowledgement | `POST /billing/admin/refund-cases`, `…/:id/cancel`, `…/reconciliation-cases/:id/acknowledgement` | **none** (owner bearer only) | — | — | yes (class K) | per route | same key replays the stored outcome (`refund-idempotency.ts`) |
| Fee caps, delegations, decisions, proposals | BIL-04..07 | **none** | — | — | yes | — | same key |
| **Unavailable (not designed):** dispute evidence, fraud-hold and surplus evidence (no human File path, CF-71); owner refund-case, fraud-hold, recovery and late-settlement lists (CF-65, CF-67–69); owner payment discovery (CF-66); legal remedies (BIL-35); any partial refund | — | — | — | — | — | — | — |

---

## 6. Proposed TypeScript interfaces (illustrative; nothing is written)

### 6.1 Purpose registry (pure, `core/authorization/`)

```ts
/** Core's step-up purposes (auth-service step-up.service.ts:23-100 at 0044b20), classified by transport. Machine values. */
export type AuthLocalPurpose =
  | 'platform_assignment.grant' | 'platform_assignment.revoke' | 'operator.create'
  | 'owner.secret_key.rotate' | 'owner.factor.enroll' | 'owner.factor.remove' | 'owner.password.change'
  | 'join_code.create' | 'join_code.revoke' | 'organization.admin.grant' | 'organization.admin.revoke'
  | 'admin_invitation.create' | 'admin_invitation.revoke' | 'account.suspend' | 'account.restore';
// 'hierarchy.reference.repair' deliberately absent: ADR-0061 activation is MOVE V3.

export type ServiceVerifiedPurpose =
  | 'platform.create' | 'organization.create' | 'release.withdraw' | 'compatibility_policy.change'
  | 'audit.legal_hold.place' | 'audit.legal_hold.release'
  | 'billing.assistance.correct' | 'billing.assistance.dispute.resolve';

export type ReceiptPurpose =
  | 'refund.authorize' | 'payment.dispute.decide' | 'billing.fraud_hold.place' | 'billing.fraud_hold.release'
  | 'billing.recovery_surplus.record_external' | 'billing.late_settlement.apply'
  | 'payment.provider_fact.associate' | 'billing.recovery.write_off';

export type CorePurpose = AuthLocalPurpose | ServiceVerifiedPurpose | ReceiptPurpose;
export type StepUpFactor = 'totp' | 'webauthn' | 'secret_key';

export interface PurposeRule {
  readonly transport: 'authLocal' | 'serviceVerified' | 'receipt';
  readonly factors: readonly StepUpFactor[];      // Core's allow-list, verbatim
  readonly delivery: 'header' | 'body' | 'receiptIssuance';
}

export const PURPOSE_RULES = {
  'audit.legal_hold.place': { transport: 'serviceVerified', factors: ['totp', 'webauthn'], delivery: 'body' },
  'refund.authorize':       { transport: 'receipt',         factors: ['totp', 'webauthn'], delivery: 'receiptIssuance' },
  // … every purpose, each with a comment citing Core
} as const satisfies Record<CorePurpose, PurposeRule>;
```

The existing `StepUpPurpose` (`admin:src/app/core/auth/step-up.gateway.ts:21-34`) stays a **subset alias** of
`AuthLocalPurpose | ServiceVerifiedPurpose`, so no caller changes. A unit test asserts that the registry equals the evidence table
(§3) and that no purpose has two transports.

### 6.2 Branded, non-interchangeable proofs

```ts
declare const proofBrand: unique symbol;

/** A step-up token for ONE purpose. Its transport is part of the type, so a receipt proof cannot reach a domain route. */
export interface StepUpProof<P extends CorePurpose> {
  readonly purpose: P;
  readonly token: string;          // never logged, never stored, never in a URL
  readonly expiresAt: string;      // Core's value, UTC
  readonly [proofBrand]: (typeof PURPOSE_RULES)[P]['transport'];
}

export type HeaderStepUp<P extends AuthLocalPurpose | ServiceVerifiedPurpose> = StepUpProof<P>; // for routes that read x-step-up-token
export type BodyStepUp<P extends 'audit.legal_hold.place' | 'audit.legal_hold.release'> = StepUpProof<P>;
export type ReceiptStepUp<P extends ReceiptPurpose> = StepUpProof<P>; // accepted ONLY by AuthorizationReceiptGateway.issue
```

`StepUpGateway.obtain` keeps its signature for existing purposes. F1 adds `obtainFor<P extends CorePurpose>(purpose: P, proof: FactorProof): Observable<StepUpProof<P>>`,
implemented by the same adapters, so there is one step-up system, not two.

### 6.3 Receipt bindings and the secret holder

```ts
export type ReceiptOperation =
  | 'refund' | 'dispute_decision' | 'fraud_hold_place' | 'fraud_hold_release'
  | 'recovery_surplus_external' | 'late_settlement_apply' | 'provider_fact_associate' | 'recovery_write_off';

/** Mirrors core receipt-binding.ts:15-173 field for field; every value comes from a Core read, never from typing. */
export type ReceiptBinding =
  | { readonly operation: 'refund'; readonly audience: 'payment-service'; readonly companyId: string; readonly refundCaseId: string;
      readonly paymentId: string; readonly amount: number; readonly currency: string; readonly reason: string;
      readonly legalOverride?: boolean; readonly captureFactId?: string }
  | { readonly operation: 'dispute_decision'; readonly audience: 'payment-service'; readonly companyId: string;
      readonly disputeId: string; readonly paymentId: string; readonly decision: 'contest' | 'accept' }
  | { readonly operation: 'fraud_hold_place'; readonly audience: 'billing-service'; readonly companyId: string;
      readonly holdId: string; readonly beneficiaryUserId: string; readonly productId: string; readonly reason: string }
  // … fraud_hold_release, recovery_surplus_external, late_settlement_apply, provider_fact_associate, recovery_write_off
  ;

export const RECEIPT_PURPOSE = {
  refund: 'refund.authorize', dispute_decision: 'payment.dispute.decide',
  fraud_hold_place: 'billing.fraud_hold.place', fraud_hold_release: 'billing.fraud_hold.release',
  recovery_surplus_external: 'billing.recovery_surplus.record_external', late_settlement_apply: 'billing.late_settlement.apply',
  provider_fact_associate: 'payment.provider_fact.associate', recovery_write_off: 'billing.recovery.write_off',
} as const satisfies Record<ReceiptOperation, ReceiptPurpose>;

/**
 * The receipt secret, held in memory for ONE intent. Not a string: it cannot be interpolated, JSON-serialized or logged by accident.
 * JavaScript cannot zero a string; `discard()` drops the only reference. DEFENCE IN DEPTH ONLY (§0.2): `reveal()` still returns
 * the secret, so access must be restricted to the one consumer adapter, and persistence and logging prevented and tested.
 */
export class ReceiptSecret {
  #value: string | null;
  constructor(value: string) { this.#value = value; }
  /** For the one adapter that writes the consumer's body. */
  reveal(): string { if (this.#value === null) throw new Error('discarded'); return this.#value; }
  discard(): void { this.#value = null; }
  toJSON(): string { return '[receipt]'; }
  toString(): string { return '[receipt]'; }
}

export interface IssuedReceipt<B extends ReceiptBinding = ReceiptBinding> {
  readonly receiptId: string;
  readonly secret: ReceiptSecret;
  readonly expiresAt: string;     // issuedAt + 10 min (Core's database clock)
  readonly binding: B;
  readonly simulated: boolean;    // true for every demo receipt; shown in the UI
}

export abstract class AuthorizationReceiptGateway {
  abstract issue<B extends ReceiptBinding>(
    binding: B, stepUp: ReceiptStepUp<(typeof RECEIPT_PURPOSE)[B['operation']]>, idempotencyKey: string,
  ): Observable<IssuedReceipt<B>>;
}
```

### 6.4 Typed failures

```ts
export type ReceiptIssueFailure =
  | { readonly kind: 'stepUpRefused' }                     // 403 step_up_required
  | { readonly kind: 'bindingInvalid' }                    // 400 receipt_binding_invalid
  | { readonly kind: 'authorityRevoked' }                  // authority_revoked
  | { readonly kind: 'voided' }                            // 409 receipt_issued_response_lost: start over, new step-up and new key
  | { readonly kind: 'alreadyConsumed' } | { readonly kind: 'expired' } | { readonly kind: 'keyReused' }
  | { readonly kind: 'unavailable' }                       // 503 receipt_unavailable: nothing changed
  | { readonly kind: 'outcomeUnknown' }                    // 503 receipt_outcome_unknown or no answer: replay the SAME key once
  | { readonly kind: 'refused' } | { readonly kind: 'notInBuild' } | { readonly kind: 'stale' };

/** Per consumer, from each controller's documented codes (§5). The generic `unresolved` is Core's "(repeat the same request)". */
export type FinancialCommandFailure<C extends string> =
  | { readonly kind: 'refused'; readonly code: C }         // definitive 409: the receipt is spent or unusable; discard it
  | { readonly kind: 'unresolved' }                        // documented 503 "…_unresolved (repeat the same request)"
  | { readonly kind: 'recorded' }                          // e.g. refund_payment_unavailable: re-read, never re-issue
  | { readonly kind: 'unavailable' }                       // 503 "nothing changed"
  | { readonly kind: 'outcomeUnknown' }                    // no HTTP answer
  | { readonly kind: 'stale' } | { readonly kind: 'notInBuild' };
```

---

## 7. Authorization and receipt state machines

### 7.1 Step-up (all transports)

```text
idle ──open──► choosing (factors = PURPOSE_RULES[p].factors ∩ owner's confirmed factors)
choosing ──passkey──► challenge (webauthn-options) ──assertion──► verifying
choosing ──code entered──────────────────────────────────────────► verifying
challenge ──browser cancel──► choosing                      (no request to step-up)
verifying ──200──► authorized(proof, expiresAt)
verifying ──401 / 403 step_up_required / 400 verification_failed──► choosing (failure shown; nothing spent)
verifying ──429──► choosing (rate limited; retry-after)
verifying ──503 / no answer──► choosing (nothing issued as far as Admin knows; a new attempt asks again)
authorized ──clock ≥ expiresAt before use──► expired ──► choosing
authorized ──used by one send──► spent            (the proof object is dropped at once)
any ──cancel / close / actor or scope change / session ended──► cancelled   (proof dropped; nothing sent)
```

A proof is never reused for a second send. Existing `ActionRun` already implements this for T1/T2 and stays unchanged.

### 7.2 Receipt (T3) and financial outcome: two separate machines

```text
AUTHORIZATION (receipt)                                         FINANCIAL OUTCOME (per consumer)
──────────────────────                                          ────────────────────────────────
unavailable  (no adapter / not owner / route refused)           notSubmitted
     │ open (binding read from Core)                                 │
     ▼                                                               │
preparing (binding loaded, frozen)                                   │
     │ step-up (7.1, receipt purpose)                                │
     ▼                                                               │
issuing (Idempotency-Key Ki fixed)                                   │
  ├─201──► issued(secret, expiresAt) ─── submit (key Kc fixed) ────► submitted
  ├─503 receipt_unavailable ──► preparing (new step-up)              ├─2xx────────────────► applied(result)   ─► receipt: consumed (discard)
  ├─503 outcome_unknown / no answer ──► issueUnknown                 ├─409 definitive─────► refused(code)     ─► receipt: discard
  │     └─ replay SAME Ki once (user action):                        ├─503 "unresolved"───► unresolved ── repeat IDENTICAL request
  │          201 → issued · 409 response_lost → voided               │                       (same Kc, same secret) while held
  │          409 expired → expired · 409 consumed → (impossible:      ├─503 "recorded"─────► recorded ── re-read the resource; never re-issue
  │          treat as voided + re-read)                               ├─503 nothing changed► notSubmitted (may submit again, same Kc)
  ├─403 step_up_required ──► preparing                               └─no answer──────────► outcomeUnknown
  └─409 keyReused (bug) ──► failed                                         ├─ key routes: identical repeat (same Kc, same secret) is
issued ──clock ≥ expiresAt and not submitted──► expired (discard)           │   Core-replayed → allowed as a user action
issued/any ──cancel, close, actor/scope change, sign-out, page          └─ no-key routes (fraud hold, surplus, write-off):
             destroyed──► discarded (secret dropped)                         BLOCKED until CF-74: no automatic and no unverified 
voided / expired ──► a NEW intent: new step-up, new Ki                       manual resubmission; reads are information only (§0)
```

Rules:
1. **Authorization ≠ outcome.** `issued` never displays "done". Only an `applied` answer, or a later Core read, shows an effect.
2. **No path from `outcomeUnknown` or `unresolved` back to "issue a new receipt for the same intent".** A new receipt is a new
   intent, offered only after a definitive refusal, an expiry or a void. A read showing nothing applied is not enough on its own
   (§0.1); on a no-key route an uncertain intent stays blocked until CF-74.
3. **The same secret is held from `issued` to a terminal state, in memory only**, so the Core-documented identical repeat is
   possible; it is discarded on `applied`, `refused`, expiry, cancel, actor or scope change, sign-out and page destruction.
4. **One run per intent** (single flight). A second click while `issuing` or `submitted` is ignored.
5. **Idempotency keys:** `Ki` (issuance) and `Kc` (consumer) are distinct, fixed per intent, generated with `crypto.randomUUID()`.
   They are never reused across intents, so a new intent can never replay an old outcome.
6. **Expiry is shown from Core's `expiresAt`**, not a local constant. Submission is refused locally once expired (UX); Core
   remains the authority (`refund_authorization_expired`).

---

## 8. Gateway architecture

```text
Feature facade (later slices F3+)
   │ uses
   ▼
FinancialAuthorizationRun<B, R, C>   (core/authorization/, application layer; NOT ActionRun)
   │ step 1: StepUpGateway.obtainFor(receiptPurpose, proof)      ── existing gateway, extended
   │ step 2: AuthorizationReceiptGateway.issue(binding, proof, Ki) ── new
   │ step 3: consumer command(input, secret, Kc)                   ── per-feature gateway (later slices)
   │ step 4: reconcile(): consumer read                            ── per-feature gateway (later slices)
   ▼
Adapters:  demo → MockStepUpGateway, MockAuthorizationReceiptGateway (DemoAuthorizationState)
           every other build → UnavailableStepUpGateway, UnavailableAuthorizationReceiptGateway
           HTTP adapters: NONE in F1 (D-A4, and the routes are refused in production)
```

- `FinancialAuthorizationRun` is a sibling of `ActionRun`, reusing its context checks (actor and scope captured at open, checked
  before every send and on every answer) and its `AppError` mapping style. It does not reuse `retryOf` (§1.1 precedent).
- `AuthorizationReceiptGateway` is a core gateway (cross-feature); consumer commands live in their features.
- New `DemoDomain` value `authorizationReceipts`, bound through `adapterProviders` like every other domain.
- T2 body delivery: a later Audit legal-hold gateway takes `BodyStepUp<…>` in its command input. Organization, Release and Billing
  assistance gateways take `HeaderStepUp<…>`. No generic "send a step-up somewhere" helper exists.

---

## 9. Mock-first strategy

| Mock | Behaviour (mirrors `0044b20`) |
|---|---|
| `MockStepUpGateway.obtainFor` | unchanged rules plus receipt purposes; factor-only enforced via `DEMO_STEP_UP_METHODS`; owner only; session-revocation aware |
| `DemoAuthorizationState` (new, demo only) | receipts keyed by (issuer, `Ki`); stores only a digest of the secret (`crypto.subtle`), never the secret; 10-minute expiry on `NW_CLOCK`; replay rules exactly as §2.2 (reuse, consumed, voided, expired); `consume(secret, binding, consumeRef, audience)` for later consumer mocks: digest, binding, audience, expiry, live owner check; a consumed receipt is refused again; consumption by the same `consumeRef` returns the same result |
| `MockAuthorizationReceiptGateway` | uses `MockStepUpGateway`'s store to consume the step-up; returns `simulated: true`; scenarios (`STEP_UP`-style token): `normal`, `unavailable`, `outcomeUnknown` (commits, then drops the answer), `responseLost` (commits, drops the answer, so a replay voids), `expiredSoon` |
| Labels | every demo receipt surface says **"Simulated authorization — not issued by Nawara Core"** (new i18n keys en/fr/ar) |
| Production | demo files live under `src/app/demo/` or are imported only by demo bindings; a new marker string is added to `check-production-bundle.mjs` |
| No Core route activated | the mocks never call Core and never imitate `/payment/simulation/*` |

Existing mocks, fixtures, the demo world and their tests are untouched except the additive purpose entries in `DEMO_STEP_UP_METHODS`.

---

## 10. Security threat and failure-mode analysis

| Threat / failure | Mitigation in F1 |
|---|---|
| Receipt secret persisted, logged or sent in telemetry | `ReceiptSecret` wrapper (`toJSON`/`toString` redact; **defence in depth only**, §0.2: access restricted to the one consumer adapter, and persistence and logging prevented and tested), no storage API in `core/authorization/` (lint rule or spec), never in `AppError` or toasts; spec spies on `localStorage`, `sessionStorage`, `console.*` |
| Secret in a URL | consumers take it in the body; no router state or query parameter carries it (spec on router navigation extras) |
| Receipt proof sent to a T1/T2 route | branded types (§6.2), plus a registry test |
| Wrong header vs body | delivery is part of `PurposeRule`; gateway signatures accept only the matching proof type |
| Double submission | single flight; buttons disabled while `issuing`/`submitted`; idempotency keys fixed per intent |
| Ambiguous network outcome → irreversible repeat | `outcomeUnknown` never returns to a re-issuable state; identical repeat only where Core replays by key or documents "repeat the same request"; no-key routes **blocked** after an uncertain outcome until CF-74 (§0.1) |
| Lost issuance answer | replay the same `Ki` once: Core voids an issued receipt (`receipt_issued_response_lost`), so a secret is never obtained twice |
| Stale binding (amount changed, e.g. write-off) | binding is read from Core immediately before the step-up and frozen; Core refuses mismatches (`write_off_not_permitted`, `…_conflict`); the UI re-reads and offers a new intent |
| Session ended mid-flow | context check before every send and on every answer; the secret is discarded; mock refuses a revoked session (`sessionRevoked`) |
| Actor / scope switch | the same `ActionContext` rule as `ActionRun` |
| Another tab | no shared state exists today; an answer arriving after navigation is delivered to the run only if it is still the same actor and scope; no cross-tab coordination is designed (D-A4) |
| Clock skew | expiry uses Core's `expiresAt`; the local countdown is advisory, never authoritative |
| Mock mistaken for Core | `simulated: true` label; demo-only bundling; `check:production` marker |
| Operator obtains a receipt | Core refuses (`forbidden`); the mock refuses; the capability policy hides it (UX) |

---

## 11. Test matrix

| Area | Test | Mock-first (Vitest) | Needs staging Core |
|---|---|---|---|
| Registry | every Core purpose present once, correct transport, factors, delivery | ✅ | re-verify on Core upgrade |
| Actors | owner allowed; operator refused at policy and mock; no session → `401` | ✅ | ✅ |
| Step-up | expired proof refused; wrong purpose refused; secret key refused for factor-only purposes; passkey cancel → choosing | ✅ | ✅ |
| Receipt issuance | 201; reuse → `keyReused`; replay after loss → `voided`; consumed → `alreadyConsumed`; expired; `503 unavailable` vs `outcomeUnknown` | ✅ | ✅ |
| Expiry | `NW_CLOCK` advanced past `expiresAt` → `expired`, secret discarded, submit disabled | ✅ | ✅ (10 min) |
| Reuse | a consumed receipt refused by the mock consumer | ✅ | ✅ |
| Double submission | two submits → one issuance, one consumer call | ✅ | — |
| Concurrent intents | two runs for the same target: both issue (Core allows), the consumer refuses the second (`…_in_progress`/`conflict`) | ✅ (mock consumer) | ✅ |
| Lost responses | issuance loss; consumer loss on key route (identical repeat); consumer loss on no-key route (**blocked**, no resubmission offered; §0.1) | ✅ | ✅ |
| Session revocation | revoke during `issuing` and `submitted` → secret discarded, answer dropped | ✅ | ✅ |
| Navigation | leaving the page during `submitted` → detached, secret discarded on destroy, no resend | ✅ | — |
| Persistence | storage spies see nothing; `JSON.stringify(run)` contains no secret | ✅ | — |
| Logging | `console` spies; `AppError` contains no secret | ✅ | — |
| a11y (UI slice) | keyboard-only flow, focus order, `aria-live` for expiry, labelled factor choice | ✅ (Testing Library / component specs) | — |
| RTL, i18n | AR layout of the dialog; en/fr/ar key parity (`check:i18n`) | ✅ | — |
| Themes, accents, motion | light/dark, 11 accents (`check:contrast`), `prefers-reduced-motion` on the countdown | ✅ | — |
| Production wiring | production build binds `Unavailable…`; `check:production` marker absent | ✅ (CI) | — |
| Real contract conformance | DTO shapes, codes, header/body delivery, lifetimes against a local simulation Core | ❌ | ✅ (blocked by D-A4; not authorized in F1) |

---

## 12. Proposed component structure

```text
src/app/core/authorization/                 (new; headless, no UI)
  purpose-registry.ts            + .spec.ts     PURPOSE_RULES, CorePurpose unions
  proof.ts                                      branded StepUpProof types
  receipt.model.ts               + .spec.ts     ReceiptBinding union, RECEIPT_PURPOSE, ReceiptSecret
  receipt.gateway.ts                            AuthorizationReceiptGateway + Unavailable…
  receipt-failure.ts             + .spec.ts     AppError → ReceiptIssueFailure / FinancialCommandFailure
  financial-authorization-run.ts + .spec.ts     the coordinator (§7.2)
  financial-authority.ts         + .spec.ts     owner/operator rules per FinancialOperation (UX)
src/app/core/auth/
  step-up.gateway.ts             (additive: obtainFor, purpose aliases)
  step-up.mock.ts                (additive)
  auth.mock-state.ts             (additive DEMO_STEP_UP_METHODS entries)
src/app/demo/authorization/                 (new, demo only)
  authorization-receipts.mock.ts + .spec.ts
  demo-authorization-state.ts    + .spec.ts
src/app/shared/ui/authorization/            (UI slice only, later)
  factor-chooser/                nw-factor-chooser (TOTP / passkey per allowed factors)
  authorization-dialog/          nw-authorization-dialog (binding summary, expiry, simulated label, states)
```

---

## 13. PR-sized implementation slices

Order: domain rules → actor permissions → API contracts → typed models → tests → UI workflows → integration readiness.

| # | Slice | Purpose | Likely files | Invariants | Public interfaces | Tests | Acceptance | Risks | Impact on existing |
|---|---|---|---|---|---|---|---|---|---|
| **F1-S0** | F0 errata + F1 design record (docs only) | correct §11.4 (receipt step-up in body; Audit body delivery; same-secret repeat) and store this design | `docs/CORE-INTEGRATION.md` §11.4 + errata note, `docs/design/f1-financial-authorization.md`, `docs/ROADMAP.md` | history kept; errata dated | — | links, i18n untouched | Owner review | none | none |
| **F1-S1** | Purpose registry and transport typing | one source of truth for Core purposes, transports, factors, delivery | `core/authorization/purpose-registry.ts`, `proof.ts`; additive aliases in `step-up.gateway.ts`; `auth.mock-state.ts` factor entries | no purpose has two transports; factor lists equal Core; existing `StepUpPurpose` unchanged | §6.1, §6.2 | registry equality, type tests (`expectTypeOf`/`@ts-expect-error`) | `npm run validate` green; no behaviour change | registry drift on Core upgrade → test cites the Core revision | none (additive) |
| **F1-S2** | Financial authority rules | owner/operator matrix as pure functions | `core/authorization/financial-authority.ts` | operator only for fee proposals; no owner bypass; DEV-ONLY marking | `FinancialOperation`, `financialAuthorityOf(actor, op)` | table-driven spec of §4 | spec green | over-permissive UX → spec covers each row | capability policy untouched (wiring later) |
| **F1-S3** | Receipt contract types and failures | typed bindings, secret holder, gateway interface, error mapping | `receipt.model.ts`, `receipt.gateway.ts`, `receipt-failure.ts` | bindings mirror Core field for field; secret never serializable | §6.3, §6.4 | mapping of every documented code; `ReceiptSecret` redaction | spec green; `Unavailable…` only | code list drift → cite controller lines | none |
| **F1-S4** | Demo receipt mock | Core-faithful issuance, replay, expiry, consumption (no consumer UI) | `src/app/demo/authorization/*`, `step-up.mock.ts` (`obtainFor`), `app-environment.ts` (`DemoDomain`), `check-production-bundle.mjs` (marker), i18n "simulated" keys | digest only stored; replay rules §2.2; simulated flag | `MockAuthorizationReceiptGateway`, `DemoAuthorizationState` | §11 issuance, expiry, reuse, loss, revocation, storage/console spies | spec green; production bundle clean | demo state growth → cleared on sign-out | additive demo domain |
| **F1-S5** | `FinancialAuthorizationRun` coordinator | the §7.2 machine, headless | `financial-authorization-run.ts` | §7.2 rules 1–6 | `FinancialAuthorizationRun<B, R, C>` with `open`, `chooseFactor`, `verify`, `submit`, `repeatIdentical`, `reconcile`, `cancel`, `state` signal | full state-machine spec with a fake consumer: lost answers, unresolved, recorded, expiry, revocation, double submit, navigation | spec green; no feature uses it yet | complexity → exhaustive transition table test | none |
| **F1-S6** | Authorization UI workflow (design system) | reusable factor chooser + authorization dialog over the run | `shared/ui/authorization/*`, i18n en/fr/ar | no new route; simulated label; reduced motion; RTL | components' inputs/outputs | component specs, a11y, RTL, themes; `check:i18n`, `check:contrast` | Owner visual review (no redesign; existing `nw-dialog`, `nw-form-field`, `nw-inline-alert`) | scope creep into features → no feature wiring | none (unused until F3+) |
| **F1-S7** | Integration readiness (docs + contract fixtures) | JSON fixtures of Core DTOs and codes at `0044b20`; HTTP adapter checklist | `core/authorization/testing/fixtures/*`, `docs/design/f1-…` | fixtures cite Core lines; no HTTP adapter | — | fixtures parsed by the mapping specs | Owner review | — | none |

F1-S1 → S2 and S3 (parallel) → S4 → S5 → S6 → S7. Each slice is independently revertible.

---

## 14. D-A4 dependencies

| Component | Independent of D-A4 | Needs an authenticated Core session | Mock-testable | Blocked until D-A4 |
|---|---|---|---|---|
| Purpose registry, proof types, bindings, failures, authority rules (S1–S3) | ✅ | — | ✅ | — |
| Demo receipt mock and coordinator (S4–S5) | ✅ (demo session only) | — | ✅ | — |
| UI components (S6) | ✅ | — | ✅ | — |
| Contract fixtures (S7) | ✅ | — | ✅ | — |
| HTTP step-up adapter (`POST /auth/admin/step-up`, webauthn options) | ❌ | ✅ owner bearer | — | **yes** |
| HTTP receipt adapter (`POST /auth/admin/authorization-receipts`) | ❌ | ✅ | — | **yes** (and Auth S2 code not deployed: G-7/M3) |
| HTTP consumer adapters (Billing, Payment) | ❌ | ✅ | — | **yes**, and refused in production; local simulation Core only |
| Cross-tab session behaviour, refresh during a 10-minute receipt window | ❌ | ✅ | partial | **yes** |

F1 implements no token persistence, BFF, cookie session or browser-to-Core authentication.

---

## 15. Open Core contract questions

| # | Question | Why it matters | Suggested Admin record |
|---|---|---|---|
| Q1 | For the routes without `Idempotency-Key` (fraud hold place and release, surplus resolution, write-off), what does a byte-identical repeat answer after a transport loss when the first request **committed**? | decides whether Admin may ever repeat; until answered, uncertain outcomes on these routes stay blocked (§0.1) | **CF-74** (recorded F1-S0) |
| Q2 | Is there, or will there be, an owner-facing read of a receipt's state (issued, consumed, voided) by `receiptId`? AUTH-03 is service-only | after a page loss the owner can only infer consumption from the consumer resource | **CF-75** (recorded F1-S0) |
| Q3 | T2 replay: for Organization, Release and Billing assistance, does a same-key repeat after a lost answer replay the stored outcome **before** verifying the (now consumed) step-up? | today Admin never resends T2 commands; this decides whether that can change | **CF-76** (recorded F1-S0) |
| Q4 | Q8 (proof of receipt non-consumption) is OPEN in Core: an unanswered authorization stays pending | the UI must show "pending, do not retry" indefinitely | track Core Q8 |
| Q5 | The configured `STEP_UP_TTL_SEC` in each environment (default 300 s) | the UI shows Core's `expiresAt`; this is for copy and reviewer expectations only | doc note |
| Q6 | Fraud-hold `beneficiaryUserId` and `productId`: from which owner-readable source, given there is no hold list or beneficiary read? | the binding cannot be built from Core data today | CF-67 (extend) |
| Q7 | `fraud_hold_release` body shape is inferred from the service (`fraud-hold.service.ts:155`), not a declared DTO | contract fixture accuracy | verify at S7 |

---

## 16. Exact Owner decisions required before coding

| Id | Decision | Recommendation |
|---|---|---|
| OD-F1-1 | Authorize F1 at all, given D-R0-1 and the 2026-10-06 priorities (Admin business features deferred) | **Partly decided 2026-10-30:** F1-S0 and F1-S1 authorized; F1-S2 to F1-S7 not authorized |
| OD-F1-2 | Approve the F0 errata (receipt step-up in the body; Audit body delivery; same-secret repeat) as F1-S0 | **Authorized 2026-10-30** (F1-S0) |
| OD-F1-3 | **Receipt retention policy:** keep the secret in memory for one intent so the Core-documented identical repeat is possible, versus discarding after the first send | keep in memory, never persisted, discarded on any terminal state, expiry, cancel, actor/scope change, sign-out or page destroy |
| OD-F1-4 | No-key consumers after a transport loss | **Decided by the Owner (§0.1):** blocked from automatic and unverified manual resubmission until CF-74 |
| OD-F1-5 | Factor chooser scope: TOTP and passkey (simulated in demo builds); secret key only for purposes Core allows it, and never for receipts | approve |
| OD-F1-6 | New demo domain `authorizationReceipts` and the visible label "Simulated authorization — not issued by Nawara Core" (en/fr/ar) | approve |
| OD-F1-7 | Whether F1 includes the UI slice S6, and whether its review uses the existing `/foundation` gallery (a dev page) or component specs only | specs only in F1; gallery later |
| OD-F1-8 | Record Q1–Q3 as CF-74 to CF-76 | **Done in F1-S0** (open Core follow-ups, not implementation requests) |
| OD-F1-9 | Existing T2 users (`platform.create`, `organization.create`) migrate to the registry types in S1 without behaviour change, or stay untouched | migrate types only (aliases), no behaviour change |

D-A4 and every financial product decision (D-R0-2, D-R0-3, D-R0-6, D-R0-7) stay **open** and are not needed for F1-S0 to F1-S5.

---

## 17. Recommended first F1 implementation slice

**F1-S0 (documentation only), then F1-S1.**

1. **F1-S0** corrects the F0 record before code depends on it. The receipt step-up travels in the body, Audit legal holds take a
   body proof, and receipts must survive for Core's identical repeat. It also stores this design under `docs/design/`. There is
   no code risk and it is quick to review.
2. **F1-S1** is the first code slice: the purpose registry and branded proof types. It is pure TypeScript with tests that pin
   Admin's view of Core's 32 step-up purposes (31 in the registry: `hierarchy.reference.repair` is excluded as MOVE V3), their transports, factors and delivery at `0044b20`. Every later slice depends on it. It
   changes no behaviour and no UI, and keeps `StepUpGateway` and all existing callers as they are.

---

*Prepared read-only (no repository change) and reviewed by the Owner on 2026-10-30. Stored here by F1-S0; implementation is limited to F1-S1 until the Owner authorizes the next slice.*
