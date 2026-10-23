# P5-S2 — Approve and reject Organization membership requests (design specification)

- **Status:** implemented as a development-only mock prototype (2026-10-23), on Admin `main` `21997a6` (P5-S1 merged,
  PR #25). Production binds the unavailable adapter: no decision control is offered.
- **Why this file exists:** the claude.ai design canvas (https://claude.ai/artifact/2Krxadfp27tLNUtduDVW2S, 11
  artboards) is private and may expire; this text is the durable record, and it prevails.
- **Contract source:** the P5-S0 read-only Core verification (nawara-core `origin/main` `b91b7bf`), recorded in
  `docs/CORE-INTEGRATION.md` §5 and the P5-S0 session's source excerpts. No new Core access was made for this design.
  Paths below are relative to `nawara-core/apps/auth-service/src/`.

## 1. Verified contract

| Fact | Value | Source |
|---|---|---|
| Routes | `POST /auth/organizations/:organizationId/memberships/:membershipId/approve` and `…/reject` | `membership/organization.controller.ts:76-92` |
| Ids | UUIDs (`ParseUUIDPipe`): a malformed id is `400` | same |
| Request body | none; no `Idempotency-Key`, no step-up header | same |
| Success | `200 { id, status }`, `status` = `active` (approve) or `rejected` (reject) | `membership.service.ts:145` |
| Callers (`@Actors`) | owner, operator, member | controller |
| Authority | `organizationAuthority`: Company owner → `owner`; operator actively assigned to the Platform → `operator`; active, verified-when-required org admin → `org_admin`; anyone else → collapsed `404` | `platform/platform-access.service.ts:95-110`, `membership.service.ts:81-85` |
| Order | throttle (every attempt) → lock row by id **and** URL Organization (`FOR UPDATE`) → none: `404` → authority: `404` → own membership: `404` → not pending: `409 membership_already_decided` → approve with `REQUIRE_CONTACT_VERIFICATION` and an unverified contact: `409 contact_not_verified` → conditional update; 0 rows: `409 membership_already_decided` | `membership.service.ts:100-129` |
| Self-decision | **refused as a collapsed `404`**, not a distinct `403` ("nobody decides their own membership") | `membership.service.ts:115` |
| Contact verification | `REQUIRE_CONTACT_VERIFICATION` defaults to **false**; approve only. Admin cannot read the setting | `config/app-config.ts:391`, `membership.service.ts:117` |
| Writes | approve: `status=active, approvedAt, approvedBy`; reject: `status=rejected, rejectedAt, rejectedBy`. `isOrganizationAdmin`, `audience`, the user and other memberships untouched | `membership.service.ts:121-128` |
| Side effects (same transaction) | audit `membership.approved` / `membership.rejected` (authority in metadata), central audit intent, outbox domain event carrying the member's channel and destination | `membership.service.ts:130-143` |
| Concurrency | the row lock plus conditional update leave exactly one winner; the loser gets `409 membership_already_decided` | `membership.service.ts:103-129` |
| Throttle | `membership_op_actor`, 120 per 900 s per actor, shared with revoke; `429 rate_limited` | P5-S0, `CORE-INTEGRATION.md` §5 |
| Step-up | none (CF-26) | controller |
| Not available | rejection reason, bulk decisions, idempotency, decider in the list projection (`approvedBy` / `rejectedBy` never returned), a single-membership read (CF-24) | — |

Corrections to the task's baseline: deciding your own membership is refused with the same `404` as an unknown id, not
as a distinct "forbidden" error. `contact_not_verified` only applies when the deployment enables contact verification.
Admin actors (owners, operators) are never members (P5-S1 seed invariant; Core user kinds), so the self rule cannot
trigger from Admin in practice.

Unverified: whether a rejected person can request again (the join-code flow was not part of P5-S0); whether the
outbox event is delivered to the person as a notification.

## 2. Authorization matrix

| Actor | See requests | Approve | Reject | Core answer when not allowed |
|---|---|---|---|---|
| Company owner | ✅ | ✅ | ✅ | — |
| Operator actively assigned to the Organization's Platform | ✅ | ✅ | ✅ | — |
| Operator not assigned, unassigned meanwhile, or blocked | ❌ | ❌ | ❌ | `404` |
| Owner of another Company | ❌ | ❌ | ❌ | `404` |
| Organization admin | n/a in Admin (product apps) | Core allows | Core allows | — |
| The member themself | n/a | ❌ | ❌ | `404` |

UX only: Admin shows the actions to whoever sees the members page (owner or assigned operator). Core authorizes every
decision. Immediately before sending, the action re-checks that the Platform is still in the actor's scope; a changed
actor or scope sends nothing.

## 3. State model

```text
Membership (Core)          pending ──approve──▶ active   (P5-S3: active ──revoke──▶ revoked)
                              └────reject───▶ rejected (final for this request)

Decision run (Admin)       closed ─open─▶ confirming ─confirm─▶ pending ─200─▶ succeeded ─▶ closed (toast)
                                             │ cancel                 ├─409/404/400/401─▶ failed (final)
                                             ▼                        ├─429/503─▶ failed (manual "Try again", same request)
                                           closed                     └─lost answer─▶ failed: outcome unknown ("Check status")
```

`ActionRun<DecisionInput, MembershipDecision>` with `stepUp: null` (no verification phase). One run per members page:
a decision is single-flight across all rows; Approve and Reject on every row are disabled while one is pending.

## 4. Failure handling (branches on status and Core `code` only)

| Answer | Kind | Shown | Next | Refresh |
|---|---|---|---|---|
| `200` | success | Toast "Request approved/rejected · {Organization}"; the row leaves Requests; counts change | — | yes |
| `409 membership_already_decided` | conflict | "Already decided": someone decided first. After the refresh: "It is now Active / Rejected", or "no longer listed" | Close | yes |
| `409 contact_not_verified` | conflict | "Approval needs a verified contact. You can still reject the request." | Close | no |
| `404` | refused | "This request is no longer available to you" (withdrawn, decided and gone, or your access changed: Core does not say which) | Close | yes |
| `401` | refused | session ended | sign in | — |
| `429` | rateLimited | "Too many membership changes. Wait a few minutes." (`Retry-After` when present) | Try again (same request) | no |
| `503` | unavailable | "Nothing was changed. Try again." | Try again | no |
| no answer / unexpected | outcomeUnknown | "We couldn't confirm the decision. It may have been recorded. Nothing is sent again automatically." | **Check status** (refresh, then show the current status; a still-pending request can be decided again in a new run) | yes |
| `400` | validation | generic (cannot happen from the UI) | Close | no |

Never an automatic retry. No idempotency key is sent (Core has none). "Try again" is offered only where Core refused
before applying anything (`429`, `503`), or after a lost answer once the reload shows the request still pending.
The dialog's status line waits for a list answer newer than the failure (the facade's `loadSequence`).

## 5. UX

- **Where:** Requests tab rows (table: an "Actions" column; cards: a button row), and a "Decision" card on a pending
  membership's detail page. Active and Rejected rows have no decision actions.
- **Authority line** above the Requests list: "You can approve or reject requests as the Company owner" / "as an
  operator assigned to {Platform}". "Nawara Core checks your authority on every decision."
- **Buttons:** "Approve" (secondary) and "Reject" (ghost, danger text). Accessible names include the identity:
  "Approve the request from {identity}" (contacts stay in the DOM only, never in URLs, toasts or logs).
- **Approve:** a `dialog`: "Approve this request?"; identity, contact verification, audience (LTR, monospace),
  requested; "Approval does not make them an organization admin." Unverified contact: a warning that Core may refuse.
  Focus on "Approve request"; Cancel available.
- **Reject:** an `alertdialog`: "Reject this request?"; "The request is closed and they will not join {Organization}.
  This cannot be undone here." Focus on Cancel. Danger button "Reject request". No reason field (Core has none).
- **Pending:** the dialog is busy (cannot close, Escape ignored); the button shows "Approving…" / "Rejecting…" with a
  spinner; the row shows a spinner; all other decision buttons `aria-disabled` with "Another decision is being sent".
- **After success:** dialog closes; polite success toast (Organization name only); focus moves to the next request's
  Approve button, or to the Requests count when none remain. On the detail page the page stays: status badge
  "Active"/"Rejected", the Decision card is replaced by the outcome, focus to the heading.
- **Detached:** if the page is left while pending, the answer still settles: toast (success or failure), no contact.
- **Counts:** `organizationsChanged()` bumps `ScopeContext.revision`: the members lists, Organization details
  (memberships, pending requests), Organization directory, Platform dashboard, Platform directory and Company overview
  all reload through the canonical selectors (`activeMembershipCount`, `pendingRequestCount`, `membershipTotal`,
  `pendingRequestTotal`).
- **Wording:** neutral for every audience; approval adds a membership in this Organization only, never an admin role,
  Premium, a subscription or a payment status.
- **Responsive / RTL:** cards below 40rem with full-width 44 px buttons; dialogs become full-width sheets at narrow
  widths (existing `nw-dialog`); logical properties; arrows and identity isolated (`bdi dir=ltr`).
- **i18n:** en / fr / ar for every string; machine values (`audience`, codes) untranslated.

## 6. Data integrity (demo world)

- New pure command `decideMembership(world, input)` in `demo/world/commands/membership.commands.ts`, applied through
  `DemoWorld.commit`, in Core's order (§1). It changes **exactly one** `MembershipRecord`: `status` and `approvedAt` or
  `rejectedAt`. Nothing else: no new person, no new membership, no audience or admin-flag change, no other Organization.
- Activity: append `membership.approved` (exists) or `membership.rejected` (new action) for the Organization's Platform.
- The decider is not stored: Core stores `approvedBy`/`rejectedBy` but never returns it to Admin.
- Counts are already derived; the WeakMap cache keys on the memberships table, so a new table recomputes.
- Mock gateway: session (`401`) → outage scenario (`503`) → throttle bucket (`429`, 120 / 900 s per actor, every attempt)
  → command; scenarios `normal | decidedElsewhere | outcomeUnknown | rateLimited | unavailable`
  (`MEMBERSHIP_DECISIONS_DEMO_SCENARIO`); `MEMBERSHIP_CONTACT_VERIFICATION_REQUIRED` mirrors Core's setting (default
  `false`). `outcomeUnknown` applies the decision and loses the answer.

## 7. Components and responsibilities

| Layer | Responsibility |
|---|---|
| `MembershipGateway` | + `approve(org, id)`, `reject(org, id)` → `MembershipDecision {id, status}`; `available` flag (unavailable adapter: `false`) |
| `MockMembershipGateway` | Core's order and answers over DemoWorld; throttle; scenarios |
| `decideMembership` command | the one state change; pure; Core's refusals as `AppError` |
| `MembershipDecisionAction` (route-scoped with the members facade) | `ActionRun`, context (actor + Platform scope), guard before send, settle: toast, `organizationsChanged`, focus request; failure copy (`decisionFailureKey`) |
| `OrganizationMembersFacade` | + `loadSequence` and `whereabouts(membershipId)` for reconciliation |
| `MembershipDecisionDialog` | confirm / pending / failed states; one component, decision as input |
| `MemberList`, members page, detail page | buttons, busy and disabled states, focus management |

## 8. Files

New: `demo/world/commands/membership.commands.ts` (+ spec); `features/organizations/domain/membership-decision.model.ts`;
`application/membership-decision.action.ts` (+ spec); `components/membership-decision-dialog/*.{ts,html,scss}`;
`pages/membership-decisions.spec.ts`; `testing/members-testing.ts` (the members pages' test bed, shared by the P5-S1
and P5-S2 specs); `docs/design/p5-s2-membership-decisions.md`.

Changed: `demo/world/seed-memberships.ts` (audiences, §10a); `demo/world/records.ts` (activity action); `membership.gateway.ts`, `membership.mock.ts` (+ spec);
`organization-members.facade.ts`; `organizations.routes.ts`; `member-list.*`; `organization-members.page.*`;
`membership-detail.page.*`; the three activity feeds and their models (`membership.rejected`); `i18n/{en,fr,ar}.json`;
`tools/check-production-bundle.mjs`; `docs/CORE-INTEGRATION.md` (decision facts, §7 row), `docs/ROADMAP.md`,
`docs/ARCHITECTURE.md`, `docs/design/p5-users-and-memberships.md`, `CLAUDE.md`.

## 9. Tests and acceptance

- Command: approve and reject change exactly one record (deep-equal the rest); `409` on decided; `404` for unknown,
  another Organization's id, an unassigned operator, the actor's own membership; `contact_not_verified` only with the
  flag; admin flag and audience untouched; no new people; activity appended.
- Selectors: every dashboard figure moves by exactly ±1 (Organization, Platform, Company); other Organizations unchanged.
- Gateway: order (throttle first), 120 / 900 s bucket, each scenario.
- Action: single-flight; stale actor sends nothing; no resend after outcome unknown; toasts carry no contact; refresh on
  success, `409`, `404`, unknown.
- Pages: actions only on pending rows; accessible names; dialog roles and initial focus; busy blocks close and other
  rows; focus after success; counts update; detail Decision card; operator assigned decides, unassigned refused;
  unavailable adapter shows no actions.
- Browser: owner EN light 1440 (approve from list, reject from detail); operator dark 834; FR system; AR RTL 390 and
  320; keyboard only; no contacts in URL, storage, console or toasts; dashboard and overview counts after a decision.

## 10. Owner decisions (2026-10-23)

Implementation authorized with: a clear confirmation for each decision (Approve a `dialog` with focus on its
confirmation, Reject an `alertdialog` with focus on Cancel); the Company owner and assigned operators decide; Core's
self-decision rule enforced (collapsed `404`); no step-up, no subscription or payment coupling; no bulk decisions, no
rejection reason; the detail page stays after a decision; `membership.rejected` recorded beside `membership.approved`.
An unverified contact gets a warning, not a block (Core's default allows approval).

## 10a. Nawara School onboarding policy and the demo data (owner, 2026-10-23)

- Core's join codes carry an opaque `audience`, `requiresApproval` (pending vs active at registration) and
  `requiresSubscription` (a commercial hint, not membership authorization). The code's configuration decides, never
  the label.
- Nawara School's standard codes: `student` with `requiresApproval: false` (active at once; subscription chosen
  separately), `teacher` with `requiresApproval: true` (pending until an authorized administrator decides). These are
  product defaults, not Core rules: a pending `student` from a code that requires approval is valid, and Admin
  decides it exactly like any other request.
- Demo correction (`seed-memberships.ts`): School pending and rejected requests are `teacher` (were `student`); the
  unverified `parent` label is gone from the active rotation (active School members are `student` and `teacher`); the
  revoked `teacher` and the admins (`org_admin`, `fleet_manager`) unchanged; Drive unchanged (`learner` requests,
  `learner`/`instructor` active). Every count unchanged: School 920 / 12 / 4 rejected / 1 revoked, Drive 460 / 4 / 2.
- Not represented: join codes, `requiresApproval`, `requiresSubscription`, admission provenance. None was invented.
- **Timestamps:** Core's `approvedAt` is shown as "Active since" (Active tab, details), never "Approved": for a member
  admitted by a code without approval, what Core stores in `approvedAt` is not source-verified (the demo puts it shortly
  after the request). To verify separately; Core not changed.

## 11. Risks

- **No idempotency:** a lost answer cannot be replayed safely; reconciliation by reloading cannot tell who decided.
- **No step-up (CF-26):** a stolen operator session can approve or reject; Admin's confirmation is UX, not authority.
- **Collapsed `404`:** Admin cannot tell "withdrawn" from "your access changed"; copy stays neutral.
- **External effect:** approval emits an event that may notify the person; it cannot be recalled.
- **Runtime config unknown:** `REQUIRE_CONTACT_VERIFICATION` is not readable; Admin handles `409 contact_not_verified`.
- **Shared throttle:** 120 decisions per 15 minutes per actor (revoke shares it in P5-S3).
- **Refresh cost:** each decision reloads the Organization, its commercial facts (owner) and three lists; no pagination
  (CF-25).
- **Unverified re-request semantics** after rejection: copy says only "cannot be undone here".
