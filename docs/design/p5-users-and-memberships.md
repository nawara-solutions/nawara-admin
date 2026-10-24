# P5 — Users and memberships (design specification)

- **Status:** P5-S1 (read-only Organization members and membership details) complete (PR #25); P5-S2 (approve and
  reject requests) complete (PR #26, [`p5-s2-membership-decisions.md`](p5-s2-membership-decisions.md)); P5-S3a
  (revocation) complete (PR #27) and P5-S3b (the admin role) complete (PR #28), both specified in
  [`p5-s3-revocation-and-admin-role.md`](p5-s3-revocation-and-admin-role.md). Production binds the unavailable
  adapter.
- **Why this file exists:** the claude.ai design canvases are private and have become unavailable before; this text is the
  durable record of the P5-0 design (six artboards) as corrected by the P5-S0 read-only Core verification.
- **Contract:** source-verified in P5-S0 against Nawara Core `origin/main` `b91b7bf`
  ([`CORE-INTEGRATION.md`](../CORE-INTEGRATION.md) §5). Paths below are relative to `nawara-core/apps/auth-service/src/`.

## 1. Concepts kept apart

| Concept | Core | Admin |
|---|---|---|
| Auth user identity | `user` (`kind` member, owner or operator); a member has no name | `MemberIdentityRecord` (demo): id, email or phone, verified flag |
| Organization membership | `organization_membership`, one per user and Organization (ADR-0030) | `MembershipRecord` (demo) |
| Organization-admin privilege | `isOrganizationAdmin` on an ACTIVE membership; cleared on revoke | the same flag; never implied by membership |
| Company owner | `kind=owner` | `AdminIdentityRecord` (unchanged); never a member |
| Platform operator assignment | `PlatformAssignment` | `PlatformAssignmentRecord` (unchanged); never a member |

A member can hold memberships in several Organizations (ADR-0030 `:96`; `membership/membership.service.ts:57-79`), but
only the member can list their own; **no administrative read finds one person across Organizations**, and no route counts
distinct people (CF-03, CF-11). Admin shows neither.

## 2. Verified contract (P5-S0)

- **List:** `GET /auth/organizations/:organizationId/memberships?status=` (`membership/organization.controller.ts:69-74`).
  `status` ∈ `pending | active | rejected` (`onboarding/dto.ts:27-30`), default `pending` — Admin always sends it.
  `revoked` exists (`membership.service.ts:14`) but **cannot be listed**. No pagination, search or sort; rows ordered by
  `requestedAt` ascending (`membership.service.ts:87-97`). Unknown, not yours or not allowed: collapsed `404`.
- **Row:** `{ id, userId, status, requestedAt, approvedAt, rejectedAt, isOrganizationAdmin, email, phone, audience,
  contactVerified }`. No name, no admission provenance (join code / invitation), no `revokedAt`, no decider.
- **Readers:** the owner of the Organization's Company, an operator actively assigned to its Platform, an organization
  admin of it (`platform/platform-access.service.ts:95-110`). All three receive the same rows, contacts included.
- **No single-membership read** for administrators; `GET /auth/organizations/:id/membership` is the member's own
  tenancy check (`auth/auth.controller.ts:120-128`).
- **Later slices (verified; approve/reject built in P5-S2):** approve/reject (`POST …/memberships/:id/approve|reject`, `200`, no step-up,
  `409 membership_already_decided`, `409 contact_not_verified`); revoke (`POST …/revoke`, `200`, no step-up, `409
  membership_not_active`, admin flag cleared); admin grant/remove (`POST|DELETE …/memberships/:id/admin`, `204`, owner +
  factor step-up `organization.admin.grant|revoke`); account suspend/restore (`POST /auth/admin/members/:id/suspend|
  restore`, owner + factor step-up, reasons `compromised_account | security_incident | policy_violation`, account-wide).

### Privacy note (documented mismatch, Core not changed)

ADR-0050 decision 11 says administrative reads are purpose-specific projections ("identifiers, state, timestamps"), never
"everything about a user" (`docs/adr/0050-…md:200-201`). The implemented list returns raw email and phone to owners,
assigned operators and organization admins alike (`membership.service.ts:90-91`). Admin shows only what is needed (D3)
and records the tension as a Core follow-up.

## 3. Owner decisions (2026-10-23)

D1 Users & identity (company) stays unavailable until CF-03. D2 tabs Active, Requests (pending), Rejected; no Revoked tab.
D3 identity: email, else phone, else a neutral reference; never a name. D4 owners and assigned operators read. D5 a nested
detail route resolved from the Organization's lists. D6 deterministic synthetic records replacing the aggregate counts
with derived figures of the same meaning.

## 4. Routes and navigation

- `/platforms/:platformId/organizations/:organizationId/members` (`?status=pending|rejected`, `admins=1`,
  `sort=oldest|identity`; the default is Active, newest first). **The search text is never in the URL.**
- `/platforms/:platformId/organizations/:organizationId/members/:membershipId`: resolved from the three loaded lists;
  an id in none (unknown, another Organization's, revoked) is one "not found".
- Both pages use the Organization detail facade first (Platform access, then the Organization of that Platform), then
  the members facade. Breadcrumbs: … › Organizations › {Organization} › Members › Membership — the Organization's name,
  never a member's contact.
- Organization details: "View members" in the Membership card. Users & identity (sidebar) unchanged.

## 5. UI

- **Members:** header (the Organization, "Members", the note that one person may belong to several Organizations);
  tabs with counts (WAI-ARIA tabs; arrows follow the reading direction, Home, End); search over email, phone and audience
  (case- and accent-insensitive, local); "Organization admins only" on the Active tab; sort newest / oldest / by email or
  phone; a polite count; a table from 40rem, cards below. Each row: identity (LTR, isolated) and contact verification in
  words, role in this Organization, audience (LTR, monospace, not translated), requested and decided dates.
- **Membership:** identity, status, admin role, audience, email and/or phone, verification, requested / active since /
  rejected instants; "Other memberships: not shown (Core offers no lookup across Organizations)"; read-only note.
- **States:** the Organization's (checking, outage, not accessible, not found, loading, not in build, error); members
  loading, error with Try again, not in build, empty per tab, no results with "Clear search and filters"; membership not
  found.

## 6. Demo world (mock)

- `seedMemberships` generates, per Organization, its `memberships` figure as ACTIVE memberships (the first is the
  organization admin; École Horizon's is the person who used its admin invitation) and its `pendingRequests` figure as
  PENDING ones, plus a few rejected and one revoked record that no figure counts. Every figure is now derived
  (`activeMembershipCount`, `pendingRequestCount`): School 920 / 12, Drive 460 / 4, unchanged.
- Audiences (corrected in P5-S2 to Nawara School's standard join codes): School requests (pending, rejected) are
  `teacher`, active School members `student` or `teacher`; Drive keeps `learner` requests and `learner`/`instructor`
  members. Join codes and admission provenance are not represented.
- About 1,360 synthetic people (no names; `member-NNNN@example.invalid`, or a phone in the unassigned `+999` range), some
  with memberships in several Organizations; timestamps within each Organization's life; ids deterministic.
- `MockMembershipGateway` answers Core's list: authority as Core (owner, assigned operator), collapsed `404` otherwise,
  `400` for an unlistable status, oldest request first, revoked never listed.
- Production: the unavailable adapter, and bundle markers for the synthetic contacts and ids.

## 7. Privacy safeguards

No names invented; the identity shown is the minimum (email, else phone, else a reference). Contacts never go into the
URL (the search stays page state), breadcrumbs, titles, toasts, logs or browser storage. Operators see exactly the
Organization-scoped rows Core gives them. No other memberships, no distinct counts, no Company-wide directory.

## 8. Not built (later slices)

Account suspend / restore (P5-S4: DEFERRED / BLOCKED BY CORE, CF-28–CF-31; see
[`p5-s4-account-suspension.md`](p5-s4-account-suspension.md)), join codes, a
Company-wide directory (blocked on CF-03), a revoked view (blocked on Core's list filter).
