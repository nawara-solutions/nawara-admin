# P8 — Operations architecture (Releases, Audit log, Files, Notifications, Services & health, Monitoring)

- **Status:** P8-0 discovery reviewed; decisions **D1–D9 approved 2026-10-24** with the clarifications in §12. **P8-S1
  implemented** 2026-10-24 as a development-only, mock-first prototype (`/audit`, simulated administrative activity,
  owner only; §13). **Core Audit integration is NOT implemented.** P8-S2 to P8-S4 not started.
- **Baseline:** P8-0 read `main` content `a0b2d76` (PR #37). Core was **not** read: every Core fact below comes from Admin's `docs/CORE-INTEGRATION.md`
  (§3, §5 Audit / File / Notification / Release / Health, §7 matrix, §9 CF-04, CF-05, CF-06, CF-07, CF-14).
- **Scope:** the six Operations destinations: Releases, Audit log, Files, Notifications, Services & health, Monitoring.
- **Canvas:** https://claude.ai/artifact/GfgBWBDdYzxxZgQE7Sw7Z1 (8 artboards; private, may expire). This text prevails.

## 1. Current implementation inventory

| Area | Sidebar (`layout/sidebar/navigation.ts`) | Route | Gateway / adapters | Data | Shown today |
|---|---|---|---|---|---|
| Releases | inert item, `requires: 'company.scope'` (owner only) | none (`/releases` planned, ARCHITECTURE §6) | none | none | nothing |
| Audit log | inert, `company.scope` | none (`/audit` "launcher" planned; Organization child `/audit` planned) | none for audit. Simulated activity: `CompanyOverviewGateway`, `PlatformDashboardGateway`, `OrganizationGateway` (mocks; unavailable otherwise) | `ActivityRecord` in DemoWorld: `PlatformActivityRecord` (13 actions; Platform + optional Organization) and `CompanyActivityRecord` (`operator.created` / `blocked` / `unblocked`, subject = operator id, never a contact) | "Recent activity" on the Company Overview (4 newest), Platform dashboard and Organization detail; owner only (`platform.activity.view`) |
| Files | inert, `company.scope` | none | none | none | nothing |
| Notifications | inert, `company.scope`, `unreadBadge` | none | `NotificationSummaryGateway` (`summary(): { unread }`), mock + unavailable, shell-level | `NotificationInboxRecord { identityId, unread }`: a **declared count** (owner 4); no inbox records | sidebar badge (owner) and top-bar bell (`role="img"`, not a link; hidden at 0, so operators see none); nothing in production |
| Services & health | inert, `company.scope` | none (`/services` planned) | `ServiceHealthGateway.load()`, mock + unavailable (company-overview feature) | **static fixture** `DEMO_SERVICE_HEALTH` (not DemoWorld): 8 services, 7 "operational", Notification "delayed" | Company Overview strip, labelled "Illustrative statuses of Nawara Core services, not live health" |
| Monitoring | inert, `company.scope` | none (`/monitoring` planned) | none | none | nothing |

Operators never see the Operations group: every company-scope item requires an owner capability, and an operator's
sidebar lists their assigned Platforms. `capabilitiesOf` gives operators no capability at all.

## 2. Core contract readiness (from Admin docs only)

| Capability | Core | Who | Admin today | Readiness |
|---|---|---|---|---|
| Owner audit read, one Organization | 🟢 Prod: `GET /audit/owner/organizations/:id/records`; UTC `from`/`to` ≤ 31 days, `limit` ≤ 100, opaque cursor, rate-limited, self-audited, `no-store` | owner | none (simulated activity only) | **ready for an HTTP adapter** once real auth (A4) and origin enablement (CF-07) exist |
| Platform-level / Company audit (`account.*`, `operator.*`, `owner.*`) | 🔴 service-only; no Company attribution | — | Company events simulated on the Overview | blocked: **CF-04** (V2 A7) |
| Operator audit read | 🔴 excluded (ADR-0050 D6) | — | none | none planned |
| Release withdraw / compatibility policy | 🟢 not in production; owner of the operating Company, factor step-up (`release.withdraw`, `compatibility_policy.change`) | owner | none | contract exists, but no way to choose a target (no catalog) |
| Release catalog / history read | 🔴 none for humans | — | none | blocked: **CF-05** |
| Release register / publish | CI-only (service token) | — | none | never in Admin |
| Public compatibility read | 🟢 public, rate-limited, ETag | anyone | none | optional (Admin as a "web" component, CF-07) |
| Files | 🟡 service-token / ticket-redeem only; File administration out of V1 (ADR-0050 D12) | — | none | blocked: V2 A9 (no CF yet) |
| Notification inbox / unread count | 🟡 service-token send / status / cancel only | — | declared count mock | blocked: **CF-14** (V2 A8) |
| Notification templates | published by migration | — | none | never in Admin V1 |
| Service health | 🔴 unauthenticated `/health`, `/ready` probes; no aggregation, no "delayed" state; not an operator API | — | illustrative fixture | blocked: **CF-06** (V2 A12) |
| Monitoring / metrics / alerting | 🟡 V2 A12; no contract | — | none | blocked: V2 A12 (no CF yet) |

## 3. Domain boundaries

- **Release metadata** (products, components, versions, compatibility policy) is not a **deployment action**; Admin
  never registers, publishes or deploys (CI only). Withdraw and minimum-version change are release-policy commands, not
  deployments. Release is never entitlement.
- **Audit evidence** is Core's immutable record (eventId, actor, resource, outcome, changes, correlation). The demo
  world's `ActivityRecord`s are **simulated Admin activity**, never presented as audit evidence, exported, or given
  Core fields (correlation id, outcome, changes) they do not have.
- **File metadata** (name, size, owner) is not **access authority** (tickets, signed URLs): Admin shows neither.
- **Notifications** are messages to a person; they are not audit records and not activity. The inbox is personal (each
  signed-in person's own), not company scope.
- **Service health** is an observation (ready / not ready now), not uptime, latency or an incident history.
- **Monitoring** (metrics, alerting) is a separate observability product; nothing exists to read.

## 4. Authorization matrix (proposed; Core is the authority)

| Area | Owner | Operator (any assignments) | Non-demo build |
|---|---|---|---|
| Releases | read page (demo); future: withdraw / minimum version with step-up | no entry, guard → `/forbidden` | unavailable |
| Audit log (`/audit` launcher, Organization activity) | read (demo simulated; later Core per-Organization audit) | no entry, guard; never another Platform's or the Company's events | unavailable (later: HTTP for the owner only) |
| Files | none (inert) | none | none |
| Notifications | own inbox count (demo) | own inbox count (demo: 0) — personal, if D4 approves | unavailable |
| Services & health | read (illustrative, labelled) | none (company infrastructure) | unavailable |
| Monitoring | none (inert) | none | none |

New capabilities (owner only, D8): `company.audit.view`, `company.releases.view`, `company.services.view`; release
commands later `release.withdraw`, `release.policy.change`. Notifications needs none (every signed-in actor, like
Settings). A Platform assignment never grants a company-wide Operations capability.

## 5. Reusable DemoWorld records

- `ActivityRecord` (Platform, Organization, Company events): the only reusable records; as **simulated activity** for
  the audit launcher and an Organization's activity view, newest first, per Organization (mirroring Core's one-
  Organization read). Company events stay Company-level and are labelled as such (CF-04).
- `platforms` / `organizations`: the launcher's Platform → Organization choice.
- `NotificationInboxRecord`: a count only; no message, sender or time.
- `DEMO_SERVICE_HEALTH` (fixture, outside DemoWorld): illustrative statuses only; no history.
- Nothing for Releases, Files or Monitoring. No new record type is recommended for P8.

## 6. Must remain unavailable (said once, without controls)

- Releases: catalog and history, publishing, deployments, rollbacks; withdraw / minimum version until CF-05 (or an owner
  decision, D6) gives a verified target and an HTTP adapter is authorized.
- Audit: Core audit evidence in any demo build; platform-level / Company audit (CF-04); operator audit; export;
  cross-Organization sweeps; any field the demo record lacks.
- Files: everything (listing, metadata, download, upload, deletion, quotas).
- Notifications: message contents, senders, read/unread changes, sending, templates, preferences.
- Services: live status, uptime, latency, incidents, history, "probe now".
- Monitoring: metrics, charts, alerts, thresholds, logs, traces, embedded third-party dashboards.

## 7. Recommended slices and order

1. **P8-S1 Audit log, simulated (owner):** `/audit` launcher (Platform → Organization, search) and an Organization's
   activity page from `ActivityRecord`s, with Core's query shape (UTC range ≤ 31 days in the owner's time zone, newest
   first, a "load more" page size), labelled "Simulated administrative activity — not Core audit evidence". Company
   events in their own labelled section (or none, D3). Highest value: the only 🟢 production contract in Operations, so
   the shape is ready for a later HTTP adapter.
2. **P8-S2 Services & health (owner):** `/services`: the eight Core services, what each owns, and which are not in
   production (documented facts), with the illustrative status clearly marked or removed (D5); "live health not
   available" (CF-06). No uptime, latency or history.
3. **P8-S3 Notifications (personal):** `/notifications` from the existing badge and bell: the unread count, and "your
   inbox is not available yet" (CF-14); the bell becomes a link. No message invented.
4. **P8-S4 Releases — BLOCKED (default):** an owner page saying the catalog is not available (CF-05) and what the two
   owner commands are; actions only after CF-05 or an explicit decision (D6) and HTTP authorization.
5. **Files, Monitoring — BLOCKED:** stay inert in the sidebar until Core V2 A9 / A12 publish contracts.

## 8. Security and privacy risks

- **Simulated activity mistaken for audit evidence** (legal and integrity risk): permanent label, no export, no Core
  fields, never "audit trail" wording in demo data.
- **Audit records hold personal data** (actor and subject ids, `changes` may carry contacts): show ids, never contacts;
  no `changes` payload until reviewed (CF-45); respect `no-store`; never put record ids, filters with contacts or cursors
  containing personal data in URLs or logs.
- **Audit reads are rate-limited and self-audited**: no polling, no prefetch, explicit "load more"; ≤ 31-day windows.
- **Operator isolation**: operators must never see Company events (operator blocks, creations) or other Platforms'
  activity; guard + facade + mock, as in P6/P7.
- **Release commands are destructive and outward-facing** (they break client apps): owner step-up, confirmation with the
  exact product/component/version, idempotency, never a bulk action, never from a guessed target.
- **Notifications may carry secrets** (working codes, confirmation codes are delivered by notification-service): an
  inbox must never show codes or links with tokens (CF-44).
- **Files**: tickets and signed URLs are bearer secrets; never in the browser history, logs or storage.
- **Health probes are infrastructure**: the browser never calls `/health` or `/ready` (no CORS intent, topology leak);
  an aggregated authenticated read is required (CF-06).
- **Monitoring**: telemetry can carry personal data; no embedded third-party dashboards or tokens in the browser.

## 9. Proposed routes and navigation

```text
/audit                                              owner · activity browser (P8-S1)
/audit?platform=:p&organization=:o                  owner · the Organization entry: the same browser, preselected
/services                                           owner · services & health (P8-S2)
/notifications                                      every signed-in actor · own unread count (P8-S3)
/releases                                           owner · catalog unavailable (P8-S4, blocked by default)
Files, Monitoring                                   inert sidebar items (no route)
```

(D1 as approved: the Organization entry reuses the central browser through ids in the query, instead of a nested
route, so there is one page, one facade and one gateway.) Sidebar: Audit log, Services & health, Releases get paths
and owner capabilities as built; Notifications becomes a
link for every actor (D4: for an operator outside the owner-only group, e.g. beside Settings); Files and Monitoring stay
inert. The Organization detail's "Recent activity" card links to its audit page.

## 10. Test and browser acceptance (per slice)

- Exactly the DemoWorld records (activity counts per Organization agree with the Organization detail and Platform
  dashboard feeds; newest first; ≤ 31-day window; page size); no Core-only field rendered; simulated label present.
- Owner only: capability, guard (`/forbidden`), facade (no gateway call), mock `403`; collapsed `404` for another
  Company's Platform / Organization; operator never sees Company events.
- Notifications: the count equals the badge and the bell for each actor; no message content.
- Services: no uptime, latency or history; the illustrative label (or none, D5).
- Production: unavailable adapters bound; new demo markers in `check:production`.
- Browser: EN/FR/AR, RTL, light/dark/system, 1440/834/390/320, keyboard (launcher search, filters, "load more"), no
  overflow, no console errors; operator direct URLs forbidden.

## 11. Core follow-ups (all to be verified; proposed numbering)

- **CF-04** platform-level / Company audit for the owner (existing, 🔴).
- **CF-05** release catalog read (existing, 🔴).
- **CF-06** aggregated, authenticated service health (existing, 🟡 V2 A12).
- **CF-14** signed-in person's inbox and unread count (existing, 🟡 V2 A8).
- **CF-43 (proposed)** owner File administration read (metadata only, no tickets) — V2 A9.
- **CF-44 (proposed)** inbox content safety: a human inbox never returns codes or token links.
- **CF-45 (proposed; tracked)** audit record display rules: which `changes` fields are safe for a browser (contacts redacted).
- **CF-46 (proposed)** monitoring / metrics / alerting owner read — V2 A12.
- **CF-47 (proposed; tracked)** time-zone and window semantics of the audit query as Admin presents them (verify ≤ 31 days,
  inclusive bounds, cursor stability).

## 12. Decisions (approved 2026-10-24)

All nine approved as recommended, with these clarifications for P8-S1: the Organization entry PREFERABLY reuses the
central browser with a preselected Organization (D1); the content is labelled "Simulated administrative activity — not
Core audit evidence" in every view, mobile and Organization-scoped included (D2); Company events in a separate section,
never given a Platform or Organization (D3); capability `company.audit.view` (D8).


- **D1** Audit route: `/audit` launcher + `/platforms/:p/organizations/:o/audit` (recommended) vs. everything under
  `/audit/...`.
- **D2** Show simulated activity on `/audit` with a permanent "not Core audit evidence" label (recommended), or show only
  "not available" until the HTTP adapter.
- **D3** Company-level events (operator created / blocked): a separate labelled section (recommended) or omitted (Core
  has no owner read, CF-04).
- **D4** Notifications page for every signed-in actor (recommended: personal) vs. owner only.
- **D5** Services: keep the illustrative statuses with the label, or show only the service catalog and "live health not
  available" (recommended; "delayed" is not a Core state).
- **D6** Releases: unavailable page only (recommended) vs. a labelled demo catalog to prototype withdraw / minimum
  version.
- **D7** Files and Monitoring stay inert (recommended).
- **D8** Capability names (`company.audit.view`, `company.services.view`, `company.releases.view`).
- **D9** Slice order S1 Audit → S2 Services → S3 Notifications → S4 Releases (blocked); Files, Monitoring blocked.

## 13. P8-S1 as built (2026-10-24)

- **Feature** `features/activity/`: `AdministrativeActivity { platforms, organizations, entries }`, each `ActivityEntry`
  `{ id (never shown), scope: company | platform | organization, action, occurredAt, platformId, organizationId,
  operatorId (Company events only) }` — the scope read from the record (Organization: it names one; Platform: a
  Platform and no Organization; Company: neither). Abstract `ActivityGateway.activity(company)`;
  `MockActivityGateway` = exactly `companyActivity` (the Company Overview feed's source), owner only (`401`, `403` for
  any operator, collapsed `404` another Company; scenarios `normal`, `empty`, `error`; no other method);
  `UnavailableActivityGateway` in every other build; `ActivityFacade` (owner + `company.audit.view`, otherwise no
  gateway call; filters from the URL: `platform`, `organization`, `action` — ids and machine values only; an id the
  Company lacks is reported, never matched; local "Show more" by 20); `ActivityPage`.
- **Page** `/audit`: the permanent note "Simulated administrative activity — not Core audit evidence." (above every
  state, operator and production included); Platform → Organization → action filters; "Platform and Organization
  activity", newest first (action, scope with links to the Organization or Platform, UTC time in a `<time>`); an
  Organization selection keeps only events that name it, never its Platform's own; "Company-level activity" its own
  section, shown only with no selection, each event linked to the operator by id; "What this is not" (no immutable,
  verified or certified evidence; not complete; no audit id, actor, outcome, origin, signature or changes; no export;
  Core reads one Organization at a time). Loading, empty, no match, unknown selection, error (retry), not in build,
  forbidden.
- **Organization entry:** the Organization detail's "Recent activity" card links (owner only) to
  `/audit?platform=…&organization=…`, which shows the context and "Back to the Organization".
- **Wiring:** owner-only capability `company.audit.view`; shell route `/audit` with `capabilityGuard`; sidebar entry
  live for the owner; demo domain `activity`; production marker `ACTIVITY_DEMO_SCENARIO`.
- **Acceptance:** exactly the 7 seeded events (6 Organization, 1 Platform, 0 Company), newest first; a block adds one
  Company event, in its section only; the browser agrees with the Company Overview feed, both Platform dashboards and
  every Organization detail (`consistency.spec.ts`); owner only (guard, facade, mock); cross-Company isolation; the
  note in every state; no export, download or audit-only field; production binds the unavailable adapter; EN/FR/AR,
  RTL, light/dark/system, 1440/834/390/320 and keyboard in the browser.
