# F1-S6b — Financial authorization dialog

| | |
|---|---|
| Status | **Implemented, in Owner review** (F1-S6b only). Mock-first authorization UI: no financial command, no consumer gateway, no HTTP adapter, no D-A4 work, no Core change, no feature wiring. |
| Admin baseline | `main` at `cb5ef14` (PR #84, F1-S6a, merged; its CI green; no open PR) |
| Design | [`f1-financial-authorization.md`](f1-financial-authorization.md) §7.2, §12, §13 (F1-S6 row); G0 audit [G0-P1-2](../audits/g0-frontend-gap-audit.md) |
| Classification | LOCAL (Admin financial-authorization UI; register in `ROADMAP.md`) |
| Evidence | [`docs/review/f1-s6b-financial-authorization/`](../review/f1-s6b-financial-authorization/README.md) |

F1-S6b puts a dialog over the F1-S5 `FinancialAuthorizationRun`. A person can authorize **one** receipt operation on **one** target,
see that authorization and the financial result as two separate things, and be told what may happen next. Every rule stays in the
F1-S5 coordinator. The dialog reads the coordinator's two machines and calls its moves.

## 1. Parts

All parts are in `src/app/features/financial-authorization/`, a feature with no route of its own.

| Part | Role |
|---|---|
| `domain/financial-authorization.view.ts` | **The presentation adapter.** These are pure functions. `authorizationGate` derives the gate from the F1-S2b authority decision. `bindingSummary` builds the target summary. `financialAuthorizationView` maps the coordinator's authorization and outcome states to the two state lines, the message to announce and the moves on offer. The file also holds the catalog-key maps. |
| `application/financial-authorization.dialogs.ts` | `FinancialAuthorizationDialogs.open(request)` is the narrow adapter to F1-S5. It reads the authority decision, then builds **one run per intent** from the bound receipt gateways, the tab's `UncertainFinancialTargets`, `NW_CLOCK` and the run context (actor, `AuthSession.epoch`, scope). The dialog only sees `FinancialAuthorizationControls`, a `Pick` of the run's states and moves. |
| `components/financial-authorization-dialog/` | `adm-financial-authorization-dialog` reuses `nw-dialog`, `nw-step-up-code`, `nw-inline-alert`, `nw-button`, `nw-spinner` and `nw-icon`. |
| `financial-authorization.providers.ts` | Binds the receipt step-up and issuance gateways through the new `financialAuthorization` demo domain. Every other build gets the `unavailable` adapters. |

**Demo registration is limited to the preview.** The F1-S4 demo adapters (`MOCK_AUTHORIZATION_RECEIPT_PROVIDERS`) are bound only
where `financialAuthorizationProviders` is loaded. That is a single place: `/foundation/financial-authorization`, a preview inside the
development-only design-foundation gallery. The gallery is never registered or bundled in production (G0-D6), and
`check:production` gains the preview's selector as a marker.

The preview opens the real dialog over a real run. Its consumer is a **simulated service**: it answers, after a delay, with one of
the operation's documented answers from F1-S3 `RECEIPT_CONSUMERS` (applied, refused, nothing changed, not settled yet, no answer).
It sends nothing and touches no demo-world finance. Its "check the result" read never proves an application.

## 2. What the dialog shows

- **The operation and its target.** The title names the operation. The summary lists:
  - the verification purpose (the machine value, for example `refund.authorize`);
  - the only service that may use the authorization (`payment-service`, `billing-service`);
  - every bound field except `operation` and `audience`, in Core's field order.

  Ids and codes are machine values: never translated, each in its own left-to-right box. Amounts are minor units of their
  ISO 4217 currency, formatted in the active locale (for example `TND 45.000`).
- **The authenticator code.** This is the existing `nw-step-up-code`, with the operation's purpose (for example "Authorizing a
  refund") and the demo note in demo builds. TOTP only: no passkey and no secret key; see §5.
- **Two state lines**, always separate:
  - **Authorization** (the receipt): not authorized yet, then checking the code, then issuing, then *Authorized (simulated).
    Nothing has been sent yet.* with Core's `expiresAt` and the receipt id. After sending it reads *kept in memory only to send this
    same request again*, then *used*, or one of the end reasons.
  - **Financial result**, from the consumer's answer only: *Not sent. Nothing has been paid, refunded, settled or changed.*, sending,
    applied, applied by a check, refused, nothing changed, not settled yet, or no answer (with or without a safe identical repeat).

  An issued receipt is shown in the info tone and never in the success tone. Success appears only on the result line, and only for
  an `applied` answer or a proving read.
- **Notes.** "An authorization is not a payment, refund or settlement…" is always shown. "Simulated service: no Billing or Payment
  command is sent…" is shown when the caller marks its consumer as simulated.

## 3. States and moves

The last move is the main action.

| Coordinator state | Moves offered |
|---|---|
| gate refused: signed out, not an owner (an operator), outside the Company, operation unavailable, or not this receipt | Close only; nothing is asked of Core |
| target `blocked` (an earlier no-key request has an unknown outcome) | Close only |
| `awaitingFactor`, `verifying` | Cancel, Verify and authorize |
| `issuing`, `submitted`, reconciling | none (busy: Escape, the backdrop and the close button are ignored) |
| `issueUnknown` | Cancel, Ask again with the same request (once) |
| `issued` + not submitted, or "nothing changed" | Cancel, Discard authorization, Send the request |
| `issued` + not settled yet / no answer on a route with a key | Close, Check the result, Repeat the identical request |
| `ended: outcomeUncertain` (no answer on a route without a key) | Close, Check the result |
| `ended: expired`, `voided` or `issueRefused`, with nothing sent | Close, Start a new authorization (a new intent: new step-up, new keys) |
| `consumed`, or any other end | Close |

If issuance refuses the proof without issuing anything, the dialog asks for a new code, clears the field and says why.

**Focus and announcements.** Focus goes to the code when it is asked for and to the main action after each step. With no move to
offer, focus goes to Close. Two persistent, visually hidden live regions announce each change once: danger and warning at once,
the rest politely. A refused code is announced as well. The state lines are what is read; no alert box repeats them.

## 4. Safety invariants

The coordinator holds these rules. The dialog keeps them and its specs check them.

| Invariant | How |
|---|---|
| Purpose and scope matching | The gate opens only when the F1-S2b decision is `mayAttempt` **and** names exactly `RECEIPT_OPERATION_PURPOSE[operation]`. The step-up is obtained for that purpose only. The run compares actor, session and scope before every send and on every answer, and the dialog asks it to re-check whenever the opener's session or scope signals change. |
| Owner versus delegated operator | Every receipt operation is the Company owner's (F1-S2b). An operator is refused before any verification, with no step-up and no issuance. A delegated fee proposal is not a receipt operation. |
| Single-use receipt | It is held from issuance to a terminal state, sent at most once except for Core-sanctioned identical repeats, and never re-issued for the same intent. |
| In-memory secret only | The `ReceiptSecret` holder is never rendered, logged or stored. Specs spy on `Storage.prototype.setItem`. Browser checks show only the three preference keys in `localStorage` and no console output that looks like a secret. |
| Separate idempotency keys | `Ki` (issuance) and `Kc` (consumer) are fixed per intent and distinct. Specs check them: replays use the same `Ki`, identical repeats the same `Kc`, a new intent new keys. |
| No unsafe retries | There is no automatic retry. On a no-key route an unknown outcome blocks the target (CF-74), and only a proving read lifts the block. "Start a new authorization" exists only after an end that sent nothing. |
| Authorization is not completion | There are two lines, an issued receipt is never in the success tone, and the result line reads "Not sent…" until the service answers. |
| Expiry, cancellation, scope change | A 1 s tick asks the run to check Core's `expiresAt`, and an unsent expired receipt is discarded. Discard, Close, Escape and leaving the page cancel the intent and drop the secret. A sign-out, another account or another scope (`AuthSession.epoch`, `ScopeContext.scope`) ends the intent. |

**Not changed:** the F1-S1 to F1-S5 sources, `FinancialAuthorizationRun`, the receipt gateways and mocks, `nw-step-up-code`, and
every existing dialog.

## 5. Not in this slice, and blockers

- **No passkey or factor chooser.** Core accepts TOTP or a passkey for receipt purposes, but Admin has no passkey assertion flow for
  step-ups, and inventing one is out of scope. The dialog offers the authenticator code only.
- **No feature wiring and no consumer.** No Billing or Payment command exists in Admin. Each future consumer is its own
  slice (F2+, not collectively authorized; G0-D8).
- **Production.** There is no HTTP adapter (D-A4 undecided), and Core refuses every receipt consumer in production (F0).
  Fraud-hold place and external surplus repayment are unavailable to Admin users (CF-71, CF-67, CF-74).
- **CF-74.** No-key routes stay blocked after an unknown outcome until Core answers.

## 6. Tests

| Spec | Checks |
|---|---|
| `domain/financial-authorization.view.spec.ts` (16) | <ul><li>each receipt operation's authority rule is exactly its purpose;</li><li>the owner gate across all operations, plus out-of-scope;</li><li>operator and signed-out refusals;</li><li>no cross-operation decision;</li><li>copy exists for every title, purpose, refusal and state line;</li><li>the summary covers every bound field;</li><li>money, ids and codes;</li><li>issued is never a financial result;</li><li>no move while busy;</li><li>issuance is replayed once;</li><li>"nothing changed";</li><li>Core-sanctioned repeats only;</li><li>the no-key block;</li><li>a new authorization only after an end that sent nothing.</li></ul> |
| `components/…/financial-authorization-dialog.spec.ts` (18) | Real run, F1-S4 demo adapters, a controllable fake consumer, and the opener in a child injector the dialog cannot see (as on the route). Covers:<ul><li>summary, focus and purpose;</li><li>a wrong code (announced, nothing issued), then the right one for exactly `refund.authorize`;</li><li>issued without a result (no success tone, no storage, focus on Send);</li><li>sent once with the held receipt and its own key;</li><li>busy cannot close;</li><li>applied (secret dropped);</li><li>operator, unavailable and signed-out refusals;</li><li>expiry (discarded, never sent, new intent with new keys);</li><li>Discard and Close (secret dropped);</li><li>sign-out and scope change;</li><li>no answer with a key (same key, same receipt);</li><li>"not settled yet" (identical repeat, no new receipt);</li><li>no answer without a key (blocked, announced once, a non-proving check lifts nothing, re-opening shows blocked);</li><li>a proving read;</li><li>refused (spent);</li><li>issuance changed nothing (new code);</li><li>lost issuance answer (same key and step-up, once);</li><li>FR and AR.</li></ul> |
| `features/foundation/pages/financial-authorization-preview.page.spec.ts` (1) | Each simulated answer is classified by the real F1-S3 mapping as intended, for a key route, a no-key route and an unavailable operation. |

The browser checks are listed in the review README: 39 configurations with the real `@nawara-solutions/design-tokens` 0.1.0.
